"""SQLite owns job identity; stale workers can never replace a newer transcript."""
import json

from ..db import json_dumps, utcnow


class Store:
    def __init__(self, db, keep_raw=False):
        self.db, self.keep_raw = db, keep_raw
        self.guard = None
        with db.transaction() as conn:
            if keep_raw:
                conn.execute('CREATE TABLE IF NOT EXISTS transcriptions_raw '
                             '(conversation_id TEXT PRIMARY KEY REFERENCES conversations(id), body_json TEXT NOT NULL)')
            else:
                # Turning retention off also removes any raw responses retained earlier.
                conn.execute('DROP TABLE IF EXISTS transcriptions_raw')

    @staticmethod
    def decode(row):
        if row is None:
            return None
        value = dict(row)
        value['turns'] = json.loads(value.pop('turns_json'))
        value['speakers'] = json.loads(value.pop('speakers_json'))
        value['incomplete'] = bool(value['incomplete'])
        return value

    def get(self, cid, conn=None):
        with self.db._using(conn) as c:
            return self.decode(c.execute(
                'SELECT t.* FROM transcriptions t JOIN conversations c ON c.id=t.conversation_id '
                'WHERE c.id=? AND c.transcript_hash=t.transcript_hash', (cid,)).fetchone())

    def all(self, group_id=None):
        with self.db.transaction() as conn:
            query = ('SELECT t.* FROM transcriptions t JOIN conversations c ON c.id=t.conversation_id '
                     'WHERE c.transcript_hash=t.transcript_hash')
            values = ()
            if group_id:
                query += ' AND c.group_id=?'
                values = (group_id,)
            return [self.decode(row) for row in conn.execute(query + ' ORDER BY t.created_at,c.rowid', values)]

    def enqueue(self, ids, model, force=False):
        accepted = []
        with self.db.transaction() as conn:
            for cid in dict.fromkeys(ids):
                conversation = self.db.get_conversation(cid, conn)
                if conversation['channel'] != 'voice call' or not conversation.get('audioUrl'):
                    continue
                old = conn.execute('SELECT * FROM transcriptions WHERE conversation_id=?', (cid,)).fetchone()
                if old and old['transcript_hash'] == conversation['transcriptHash'] and (
                        old['status'] in {'queued', 'running'} or old['status'] == 'done' and not force):
                    continue
                generation = old['generation'] + 1 if old else 1
                now = utcnow()
                conn.execute('''INSERT INTO transcriptions
                    (conversation_id,transcript_hash,status,step,progress,error,model,
                     audio_seconds_declared,audio_seconds_decoded,incomplete,seconds_billed,cost_usd,
                     turns_json,speakers_json,created_at,updated_at,generation,audio_check)
                    VALUES(?,?,'queued','queued',0,NULL,?,NULL,NULL,0,0,0,'[]','[]',?,?,?,'pending')
                    ON CONFLICT(conversation_id) DO UPDATE SET
                    transcript_hash=excluded.transcript_hash,status='queued',step='queued',progress=0,error=NULL,
                    model=excluded.model,audio_seconds_declared=NULL,audio_seconds_decoded=NULL,incomplete=0,
                    seconds_billed=0,cost_usd=0,turns_json='[]',speakers_json='[]',created_at=excluded.created_at,
                    updated_at=excluded.updated_at,generation=excluded.generation,audio_check='pending' ''',
                    (cid, conversation['transcriptHash'], model, now, now, generation))
                if self.keep_raw:
                    conn.execute('DELETE FROM transcriptions_raw WHERE conversation_id=?', (cid,))
                accepted.append((cid, generation))
        return accepted

    def update(self, cid, generation, conn=None, **fields):
        allowed = {'status', 'step', 'progress', 'error', 'audio_seconds_declared', 'audio_seconds_decoded',
                   'incomplete', 'seconds_billed', 'cost_usd', 'audio_check', 'turns', 'speakers'}
        if not fields.keys() <= allowed:
            raise ValueError('Unknown transcription field')
        fields = {key + '_json' if key in {'turns', 'speakers'} else key:
                  json_dumps(value) if key in {'turns', 'speakers'} else value for key, value in fields.items()}
        fields['updated_at'] = utcnow()
        with self.db._using(conn) as c:
            if self.guard:
                self.guard(c)
            result = c.execute('UPDATE transcriptions SET ' + ','.join(key + '=?' for key in fields)
                               + ' WHERE conversation_id=? AND generation=? AND transcript_hash='
                                 '(SELECT transcript_hash FROM conversations WHERE id=?)',
                               (*fields.values(), cid, generation, cid))
            return result.rowcount == 1

    def finish(self, cid, generation, result, raw=None):
        with self.db.transaction() as conn:
            saved = self.update(cid, generation, conn, status='done', step='done', progress=100,
                                error=None, turns=result['turns'], speakers=result['speakers'])
            if saved and self.keep_raw and raw is not None:
                conn.execute('INSERT INTO transcriptions_raw VALUES(?,?) ON CONFLICT(conversation_id) '
                             'DO UPDATE SET body_json=excluded.body_json', (cid, json_dumps(raw)))
            return saved
