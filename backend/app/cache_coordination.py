"""Cross-process ownership for cached AI requests in cloud mode."""
import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar
import hashlib
import time
import uuid

from .db import json_dumps
from .errors import ApiError

active_cache_lease = ContextVar('active_cache_lease', default=None)


class CacheLease:
    def __init__(self, db, kind, key, *, ttl=600, clock=time.time):
        self.db, self.ttl, self.clock = db, ttl, clock
        self.key = 'aiLease:' + hashlib.sha256(json_dumps([kind, key]).encode()).hexdigest()
        self.owner = uuid.uuid4().hex
        self.started = False

    def acquire(self):
        with self.db.transaction() as conn:
            current = self.db.get_setting(self.key, {}, conn)
            if current.get('owner') != self.owner and current.get('expiresAt', 0) > self.clock():
                return False
            self.db.set_setting(self.key, {'owner': self.owner, 'expiresAt': self.clock() + self.ttl}, conn)
            return True

    def check(self, conn=None):
        current = self.db.get_setting(self.key, {}, conn)
        if current.get('owner') != self.owner or current.get('expiresAt', 0) <= self.clock():
            raise ApiError('ai_request_interrupted', 'Обработка прервалась. Повторите запрос позже', 409)

    def renew(self):
        with self.db.transaction() as conn:
            self.check(conn)
            self.db.set_setting(self.key, {'owner': self.owner, 'expiresAt': self.clock() + self.ttl}, conn)

    def before_call(self):
        self.check()
        self.started = True

    def release(self):
        with self.db.transaction() as conn:
            current = self.db.get_setting(self.key, {}, conn)
            if current.get('owner') == self.owner:
                self.db.set_setting(self.key, {}, conn)


@asynccontextmanager
async def shared_cache_lock(app, kind, key):
    timeout = getattr(app.state.settings, 'model_timeout', 180)
    lease = CacheLease(app.state.db, kind, key, ttl=max(600, timeout * 2 + 60))
    deadline = time.monotonic() + min(60, timeout)
    while not lease.acquire():
        if time.monotonic() >= deadline:
            raise ApiError('ai_request_running', 'Ответ уже готовится. Повторите запрос позже', 409)
        await asyncio.sleep(.25)
    owner_task = asyncio.current_task()
    lost = []

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(15)
                lease.renew()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            lost.append(exc)
            owner_task.cancel()

    heartbeat_task = asyncio.create_task(heartbeat())
    token = active_cache_lease.set(lease)
    completed = False
    try:
        yield lease
        completed = True
    except asyncio.CancelledError:
        if lost:
            raise ApiError('ai_request_interrupted', 'Обработка прервалась. Повторите запрос позже', 409) from None
        raise
    finally:
        active_cache_lease.reset(token)
        heartbeat_task.cancel()
        await asyncio.gather(heartbeat_task, return_exceptions=True)
        # A cancelled queued future can return before its provider task has
        # finished cancellation. Retain the reservation after any started,
        # unsuccessful request; it expires beyond the provider deadline.
        if completed or not lease.started:
            lease.release()
