"""Small transactional SQLite adapter. JSON is authoritative; columns index queries."""
import json
import re
import sqlite3
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone
from pathlib import Path

from .errors import ApiError


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def json_dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def conversation_started_at(body):
    """A call carries its own date; an undated chat uses its first import."""
    timestamp = body['transcript'][0]['timestamp']
    if 'T' not in timestamp:
        return body['importedAt']
    timestamp = re.sub(r'(\.\d{6})\d+', r'\1', timestamp).replace('Z', '+00:00')
    return datetime.fromisoformat(timestamp).astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


SCHEMA = '''
CREATE TABLE IF NOT EXISTS conversations (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, channel TEXT NOT NULL, language TEXT NOT NULL,
 audio_url TEXT, transcript_json TEXT NOT NULL, transcript_hash TEXT NOT NULL,
 imported_at TEXT NOT NULL, body_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS conversations_group ON conversations(group_id);
CREATE TABLE IF NOT EXISTS checklists (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, name TEXT NOT NULL,
 based_on_version INTEGER, is_active INTEGER NOT NULL, created_at TEXT NOT NULL, body_json TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_checklist ON checklists(is_active) WHERE is_active=1;
CREATE TABLE IF NOT EXISTS evaluations (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
 checklist_id TEXT NOT NULL REFERENCES checklists(id), status TEXT NOT NULL, model TEXT,
 started_at TEXT, finished_at TEXT, duration_ms INTEGER, body_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS evaluations_conversation ON evaluations(conversation_id);
CREATE INDEX IF NOT EXISTS evaluations_status ON evaluations(status);
CREATE INDEX IF NOT EXISTS evaluations_checklist ON evaluations(checklist_id, status);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, body_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE TABLE IF NOT EXISTS appeals (
 id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL REFERENCES evaluations(id), criterion_id TEXT NOT NULL,
 status TEXT NOT NULL, created_at TEXT NOT NULL, body_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS appeals_status ON appeals(status);
CREATE INDEX IF NOT EXISTS appeals_evaluation ON appeals(evaluation_id);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_appeal ON appeals(evaluation_id, criterion_id) WHERE status='open';
CREATE TABLE IF NOT EXISTS gold (
 conversation_id TEXT NOT NULL, criterion_id TEXT NOT NULL, answer TEXT NOT NULL, note TEXT,
 PRIMARY KEY(conversation_id,criterion_id));
CREATE TABLE IF NOT EXISTS ai_cache (
 kind TEXT NOT NULL, key TEXT NOT NULL, body_json TEXT NOT NULL, usage_json TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(kind,key));
CREATE TABLE IF NOT EXISTS sequences (prefix TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_calls (
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, input_tokens INTEGER NOT NULL,
 output_tokens INTEGER NOT NULL, cost_usd REAL NOT NULL, calls INTEGER NOT NULL,
 latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transcriptions (
 conversation_id TEXT PRIMARY KEY REFERENCES conversations(id), transcript_hash TEXT NOT NULL,
 status TEXT NOT NULL, step TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, error TEXT,
 model TEXT NOT NULL, audio_seconds_declared REAL, audio_seconds_decoded REAL,
 incomplete INTEGER NOT NULL DEFAULT 0, seconds_billed REAL NOT NULL DEFAULT 0,
 cost_usd REAL NOT NULL DEFAULT 0, turns_json TEXT NOT NULL DEFAULT '[]',
 speakers_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 generation INTEGER NOT NULL DEFAULT 1, audio_check TEXT NOT NULL DEFAULT 'pending');
CREATE INDEX IF NOT EXISTS transcriptions_status ON transcriptions(status);
'''


class Database:
    def __init__(self, path, *, remote_url='', auth_token=''):
        self.path = str(path)
        self.remote_url = remote_url
        self._auth_token = auth_token
        if remote_url:
            from .remote_db import validate_remote_config
            validate_remote_config(remote_url, auth_token)
        else:
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as conn:
            # Functions can cold-start often. Initialize the shared schema once,
            # in the same write transaction as its version marker, rather than
            # repeating all DDL and metadata reads for every API instance.
            version = 0
            if remote_url and conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings'").fetchone():
                version = self.get_setting('_databaseSchemaVersion', 0, conn)
                if type(version) is not int or version < 0:
                    raise RuntimeError('Remote database schema marker is invalid')
            if remote_url and version > 1:
                raise RuntimeError('Remote database schema is newer than this application')
            if version < 1:
                conn.executescript(SCHEMA)
                self._migrate_conversation_metadata(conn)
                if remote_url:
                    self.set_setting('_databaseSchemaVersion', 1, conn)

    def _migrate_conversation_metadata(self, conn):
        """Keep existing registry order once, then persist identity independently of rowid."""
        rows = conn.execute('SELECT rowid, body_json FROM conversations ORDER BY rowid').fetchall()
        records = [(row['rowid'], json.loads(row['body_json'])) for row in rows]
        used = {body['number'] for _, body in records if body.get('number') is not None}
        last_number = max([rowid for rowid, _ in records] + list(used), default=0)
        for rowid, body in records:
            changed = False
            if body.get('number') is None:
                if rowid in used:
                    last_number += 1
                    body['number'] = last_number
                else:
                    body['number'] = rowid
                used.add(body['number'])
                changed = True
            if not body.get('startedAt'):
                body['startedAt'] = conversation_started_at(body)
                changed = True
            if changed:
                conn.execute('UPDATE conversations SET body_json=? WHERE id=?', (json_dumps(body), body['id']))
        conn.execute("INSERT INTO sequences(prefix,value) VALUES('conversation',?) "
                     "ON CONFLICT(prefix) DO UPDATE SET value=MAX(value,excluded.value)", (last_number,))

    @contextmanager
    def transaction(self):
        with self._connection(write=True, snapshot=True) as conn:
            yield conn

    @contextmanager
    def read_connection(self, *, consistent=True):
        """Share a read snapshot across getters; never acquire a write lock.

        The internal one-query getters use autocommit because one SELECT is
        already atomic. Grouped route reads keep the default explicit snapshot.
        """
        from .remote_db import ReadConnection
        with self._connection(write=False, snapshot=consistent) as conn:
            yield ReadConnection(conn)

    @contextmanager
    def _connection(self, *, write, snapshot):
        if self.remote_url:
            from .remote_db import TRANSACTION_LOCK, connect_remote
            guard = TRANSACTION_LOCK
        else:
            guard = nullcontext()
        with guard:
            if self.remote_url:
                conn = connect_remote(self.remote_url, self._auth_token)
            else:
                conn = sqlite3.connect(self.path, timeout=15)
                conn.row_factory = sqlite3.Row
            failed = False
            try:
                if write:
                    conn.execute('PRAGMA foreign_keys=ON')
                    if not self.remote_url:
                        conn.execute('PRAGMA journal_mode=WAL')
                if snapshot:
                    conn.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
                yield conn
                if snapshot:
                    conn.commit()
            except BaseException:
                failed = True
                # A server timeout can already have rolled back the stream.
                # Preserve the original failure, including an unknown COMMIT
                # outcome; never retry a write or hide it with cleanup errors.
                if snapshot:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                raise
            finally:
                try:
                    conn.close()
                except Exception:
                    if not failed:
                        raise

    @contextmanager
    def _using(self, conn=None):
        if conn is not None:
            yield conn
        else:
            with self.transaction() as owned:
                yield owned

    @contextmanager
    def _reading(self, conn=None):
        if conn is not None:
            yield conn
        else:
            with self.read_connection(consistent=False) as owned:
                yield owned

    def _get(self, table, record_id, noun, conn=None):
        with self._reading(conn) as c:
            row = c.execute(f'SELECT body_json FROM {table} WHERE id=?', (record_id,)).fetchone()
        if row is None:
            raise ApiError('not_found', f'{noun} {record_id} не найден', 404)
        return json.loads(row['body_json'])

    def _all(self, table, conn=None):
        with self._reading(conn) as c:
            rows = c.execute(f'SELECT body_json FROM {table} ORDER BY rowid DESC').fetchall()
        return [json.loads(row['body_json']) for row in rows]

    def _save(self, table, body, columns, conn=None):
        values = {'id': body['id'], **columns, 'body_json': json_dumps(body)}
        keys = ','.join(values)
        placeholders = ','.join('?' for _ in values)
        update = ','.join(f'{key}=excluded.{key}' for key in values if key != 'id')
        with self._using(conn) as c:
            c.execute(f'INSERT INTO {table} ({keys}) VALUES ({placeholders}) ON CONFLICT(id) DO UPDATE SET {update}', tuple(values.values()))

    def get_conversation(self, id, conn=None):
        return self._get('conversations', id, 'Диалог', conn)

    def get_setting(self, key, default=None, conn=None):
        with self._reading(conn) as c:
            row = c.execute('SELECT value_json FROM settings WHERE key=?', (key,)).fetchone()
        return default if row is None else json.loads(row['value_json'])

    def set_setting(self, key, value, conn=None):
        with self._using(conn) as c:
            c.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json',
                      (key, json_dumps(value)))

    def all_conversations(self, conn=None):
        return self._all('conversations', conn)

    def save_conversation(self, b, conn=None):
        with self._using(conn) as c:
            old = c.execute('SELECT body_json FROM conversations WHERE id=?', (b['id'],)).fetchone()
            if old:
                previous = json.loads(old['body_json'])
                b['number'] = previous['number']
                b['startedAt'] = previous['startedAt']
            else:
                b['number'] = int(self.next_id('conversation', c).removeprefix('conversation_'))
                b['startedAt'] = conversation_started_at(b)
            self._save('conversations', b, dict(group_id=b['datasetGroupId'], channel=b['channel'], language=b['language'], audio_url=b['audioUrl'], transcript_json=json_dumps(b['transcript']), transcript_hash=b['transcriptHash'], imported_at=b['importedAt']), c)

    def get_checklist(self, id, conn=None):
        if id == 'active':
            with self._reading(conn) as c:
                row = c.execute('SELECT body_json FROM checklists WHERE is_active=1').fetchone()
            if row is None:
                raise ApiError('not_found', 'Активный чек-лист не найден', 404)
            return json.loads(row['body_json'])
        return self._get('checklists', id, 'Чек-лист', conn)

    def all_checklists(self, conn=None):
        return self._all('checklists', conn)

    def save_checklist(self, b, conn=None):
        self._save('checklists', b, dict(version=b['version'], name=b['name'], based_on_version=b.get('basedOnVersion'), is_active=int(b['isActive']), created_at=b['createdAt']), conn)

    def get_evaluation(self, id, conn=None):
        return self._get('evaluations', id, 'Оценка', conn)

    def all_evaluations(self, conn=None, *, statuses=None, conversation_id=None, ids=None):
        clauses, params = [], []
        for column, values in (('status', statuses), ('id', ids)):
            if values is not None:
                values = tuple(values)
                if not values:
                    return []
                clauses.append(column + ' IN (' + ','.join('?' for _ in values) + ')')
                params.extend(values)
        if conversation_id is not None:
            clauses.append('conversation_id=?')
            params.append(conversation_id)
        where = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
        with self._reading(conn) as c:
            rows = c.execute('SELECT body_json FROM evaluations' + where + ' ORDER BY rowid DESC', params).fetchall()
        return [json.loads(row['body_json']) for row in rows]

    def save_evaluation(self, b, conn=None):
        self._save('evaluations', b, dict(conversation_id=b['conversationId'], checklist_id=b['checklistId'], status=b['status'], model=b.get('model'), started_at=b.get('startedAt'), finished_at=b.get('finishedAt'), duration_ms=b.get('durationMs')), conn)

    def get_appeal(self, id, conn=None):
        return self._get('appeals', id, 'Апелляция', conn)

    def all_appeals(self, conn=None):
        return self._all('appeals', conn)

    def save_appeal(self, b, conn=None):
        self._save('appeals', b, dict(evaluation_id=b['evaluationId'], criterion_id=b['criterionId'], status=b['status'], created_at=b['createdAt']), conn)

    def get_job(self, id, conn=None):
        return self._get('jobs', id, 'Задача', conn)

    def all_jobs(self, conn=None):
        return self._all('jobs', conn)

    def save_job(self, b, conn=None):
        self._save('jobs', b, dict(status=b['status'], created_at=b.get('createdAt') or b.get('startedAt') or utcnow()), conn)

    def next_id(self, prefix, conn=None):
        with self._using(conn) as c:
            c.execute('INSERT INTO sequences(prefix,value) VALUES(?,1) ON CONFLICT(prefix) DO UPDATE SET value=value+1', (prefix,))
            value = c.execute('SELECT value FROM sequences WHERE prefix=?', (prefix,)).fetchone()[0]
        return f'{prefix}_{value}'

    def get_cache(self, kind, key, conn=None):
        with self._reading(conn) as c:
            row = c.execute('SELECT * FROM ai_cache WHERE kind=? AND key=?', (kind, key)).fetchone()
        return None if row is None else dict(body=json.loads(row['body_json']), usage=json.loads(row['usage_json']), createdAt=row['created_at'])

    def get_caches(self, kind, conn=None):
        """Fetch one cache kind once for registry/bulk reads."""
        with self._reading(conn) as c:
            rows = c.execute('SELECT key,body_json,usage_json,created_at FROM ai_cache WHERE kind=?', (kind,)).fetchall()
        return {row['key']: dict(body=json.loads(row['body_json']), usage=json.loads(row['usage_json']),
                                 createdAt=row['created_at']) for row in rows}

    def set_cache(self, kind, key, body, usage=None, conn=None):
        with self._using(conn) as c:
            c.execute('INSERT INTO ai_cache VALUES(?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET body_json=excluded.body_json,usage_json=excluded.usage_json,created_at=excluded.created_at', (kind, key, json_dumps(body), json_dumps(usage or {}), utcnow()))

    def invalidate_cache(self, kind, key, conn=None):
        with self._using(conn) as c:
            c.execute('DELETE FROM ai_cache WHERE kind=? AND key=?', (kind, key))

    def record_usage(self, usage, latency_ms=0, kind='extra'):
        if hasattr(usage, 'model_dump'):
            usage = usage.model_dump(by_alias=True)
        with self.transaction() as c:
            c.execute('INSERT INTO model_calls(kind,input_tokens,output_tokens,cost_usd,calls,latency_ms,created_at) VALUES(?,?,?,?,?,?,?)', (kind, usage.get('inputTokens',0), usage.get('outputTokens',0), usage.get('costUsd',0), usage.get('calls',0), latency_ms, utcnow()))


def latest_evaluations(db, checklist_id=None, group_id=None):
    from .evaluations import is_evaluation_visible
    checklist_id = checklist_id or db.get_checklist('active')['id']
    db.get_checklist(checklist_id)
    conversations = {c['id']: c for c in db.all_conversations() if not group_id or c['datasetGroupId'] == group_id}
    latest = {}
    for ev in db.all_evaluations():
        conversation = conversations.get(ev['conversationId'])
        if (conversation and is_evaluation_visible(ev) and ev['status'] == 'done' and ev['checklistId'] == checklist_id
                and ev.get('transcriptHash') == conversation.get('transcriptHash')):
            latest.setdefault(ev['conversationId'], ev)
    return list(latest.values())
