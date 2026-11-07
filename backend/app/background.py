"""Shared daemon ownership and durable import-summary work.

The database is the coordination point. No queue state depends on a warm API
function, and a replaced daemon cannot start or persist another owner's work.
"""
import asyncio
import time
import uuid

from .db import utcnow


class LeaseLost(RuntimeError):
    pass


class WorkerLease:
    KEY = 'backgroundWorkerLease'

    def __init__(self, db, *, owner=None, ttl=300, clock=time.time):
        self.db, self.owner, self.ttl, self.clock = db, owner or uuid.uuid4().hex, ttl, clock

    def acquire(self):
        with self.db.transaction() as conn:
            current = self.db.get_setting(self.KEY, {}, conn)
            now = self.clock()
            if current.get('owner') != self.owner and current.get('expiresAt', 0) > now:
                return False
            self.db.set_setting(self.KEY, {'owner': self.owner, 'expiresAt': now + self.ttl}, conn)
            return True

    def check(self, conn=None):
        current = self.db.get_setting(self.KEY, {}, conn)
        if current.get('owner') != self.owner or current.get('expiresAt', 0) <= self.clock():
            raise LeaseLost('Background worker lease expired or changed')

    def renew(self):
        with self.db.transaction() as conn:
            self.check(conn)
            self.db.set_setting(self.KEY, {'owner': self.owner, 'expiresAt': self.clock() + self.ttl}, conn)

    def release(self):
        with self.db.transaction() as conn:
            current = self.db.get_setting(self.KEY, {}, conn)
            if current.get('owner') == self.owner:
                self.db.set_setting(self.KEY, {}, conn)


class SummaryJobs:
    def __init__(self, db, guard=None):
        self.db, self.guard = db, guard
        with db.transaction() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS background_summaries ('
                         'conversation_id TEXT PRIMARY KEY REFERENCES conversations(id), '
                         'source_hash TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)')

    def enqueue(self, ids):
        with self.db.transaction() as conn:
            for cid in dict.fromkeys(ids):
                conversation = self.db.get_conversation(cid, conn)
                conn.execute('INSERT INTO background_summaries VALUES(?,?,?,?) '
                             'ON CONFLICT(conversation_id) DO UPDATE SET source_hash=excluded.source_hash, '
                             'status=excluded.status,updated_at=excluded.updated_at '
                             'WHERE background_summaries.source_hash<>excluded.source_hash',
                             (cid, conversation['transcriptHash'], 'queued', utcnow()))

    def recover(self):
        # A daemon may have stopped after sending a paid request. Preserve that
        # uncertainty as failure; an explicit summary request can still retry.
        with self.db.transaction() as conn:
            if self.guard:
                self.guard(conn)
            conn.execute("UPDATE background_summaries SET status='failed',updated_at=? WHERE status='running'", (utcnow(),))

    def claim(self):
        with self.db.transaction() as conn:
            if self.guard:
                self.guard(conn)
            row = conn.execute("SELECT conversation_id,source_hash FROM background_summaries WHERE status='queued' ORDER BY updated_at LIMIT 1").fetchone()
            if row is None:
                return None
            conn.execute("UPDATE background_summaries SET status='running',updated_at=? WHERE conversation_id=?", (utcnow(), row['conversation_id']))
            return row['conversation_id'], row['source_hash']

    def finish(self, cid, source_hash, status):
        with self.db.transaction() as conn:
            if self.guard:
                self.guard(conn)
            conn.execute('UPDATE background_summaries SET status=?,updated_at=? '
                         'WHERE conversation_id=? AND source_hash=? AND status=\'running\'',
                         (status, utcnow(), cid, source_hash))

    async def run_one(self, app):
        from .extras import _summary
        pair = self.claim()
        if pair is None:
            return
        cid, source_hash = pair
        status = 'failed'
        try:
            if self.db.get_conversation(cid)['transcriptHash'] == source_hash:
                await _summary(app, cid, priority=10)
                status = 'done'
        except asyncio.CancelledError:
            raise
        except LeaseLost:
            raise
        except Exception:
            # The provider layer records known billed usage. No automatic retry.
            pass
        finally:
            self.finish(cid, source_hash, status)
