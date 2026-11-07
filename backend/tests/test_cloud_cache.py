"""Cross-process cache billing and fencing using the real SQL transaction layer."""
import asyncio
from types import SimpleNamespace

import pytest

from app import extras
from app.cache_coordination import CacheLease, active_cache_lease, shared_cache_lock
from app.db import Database
from app.errors import ApiError


def app_for(db, role='api'):
    return SimpleNamespace(state=SimpleNamespace(db=db,
        settings=SimpleNamespace(worker_mode=role, model_timeout=1)))


def test_two_app_instances_share_one_generation(tmp_path, monkeypatch):
    db = Database(tmp_path / 'cache.sqlite')
    api = app_for(db)
    daemon = app_for(Database(db.path), 'worker')
    monkeypatch.setattr(extras, '_cache_identity', lambda app, kind: 'fixed-provider')
    calls = []

    async def producer():
        calls.append(True)
        await asyncio.sleep(.05)
        return {'text': 'one generated result'}, {'calls': 1}

    async def run():
        return await asyncio.gather(*[
            extras._cached(app, 'summary', 'cid', 'source', producer, lambda: True)
            for app in (api, daemon)
        ])
    values = asyncio.run(run())
    assert values == [{'text': 'one generated result'}] * 2
    assert calls == [True]


def test_replaced_cache_owner_cannot_persist_or_release_new_owner(tmp_path):
    db = Database(tmp_path / 'cache.sqlite')
    now = [100.0]
    old = CacheLease(db, 'summary', 'cid', ttl=5, clock=lambda: now[0])
    new = CacheLease(Database(db.path), 'summary', 'cid', ttl=5, clock=lambda: now[0])
    assert old.acquire()
    old.before_call()
    now[0] = 106
    assert new.acquire()
    with pytest.raises(ApiError, match='прервалась'):
        extras._save_cached(app_for(db), old, 'summary', 'cid', {'result': 'old'}, {'calls': 1})
    assert db.get_cache('summary', 'cid') is None
    old.release()
    new.check()


def test_worker_lease_is_checked_inside_cache_write(tmp_path):
    db = Database(tmp_path / 'cache.sqlite')
    app = app_for(db, 'worker')
    def reject(conn):
        assert conn is not None
        raise ApiError('lost_worker', 'ownership lost', 409)
    app.state.background_guard = reject
    with pytest.raises(ApiError, match='ownership lost'):
        extras._save_cached(app, None, 'summary', 'cid', {'result': 'old'}, {'calls': 1})
    assert db.get_cache('summary', 'cid') is None


def test_cancelled_started_call_keeps_reservation_until_deadline(tmp_path):
    db = Database(tmp_path / 'cache.sqlite')
    app = app_for(db)

    async def run():
        entered = asyncio.Event()
        async def first():
            async with shared_cache_lock(app, 'summary', 'cid') as lease:
                lease.before_call()
                entered.set()
                await asyncio.Event().wait()
        task = asyncio.create_task(first())
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(run())
    assert not CacheLease(Database(db.path), 'summary', 'cid').acquire()


def test_busy_wait_is_bounded_and_never_enters_producer(tmp_path):
    db = Database(tmp_path / 'cache.sqlite')
    assert CacheLease(db, 'summary', 'cid').acquire()
    app = app_for(Database(db.path))
    app.state.settings.model_timeout = .01
    async def run():
        with pytest.raises(ApiError) as captured:
            async with shared_cache_lock(app, 'summary', 'cid'):
                pytest.fail('a second generation may not start')
        assert captured.value.code == 'ai_request_running'
    asyncio.run(run())


def test_lease_is_rechecked_when_queued_call_reaches_provider(tmp_path, monkeypatch):
    db = Database(tmp_path / 'cache.sqlite')
    app = app_for(db)
    monkeypatch.setattr(extras.llm_switch, 'provider_configured', lambda *args: True)
    calls = []

    async def provider():
        calls.append(True)
        return {'usage': {'inputTokens': 0, 'outputTokens': 0, 'costUsd': 0, 'calls': 1}}

    async def queue_call(function, *args, **kwargs):
        # Simulate takeover while this request waits in the provider queue.
        lease = active_cache_lease.get()
        db.set_setting(lease.key, {'owner': 'replacement', 'expiresAt': lease.clock() + 600})
        await asyncio.sleep(0)
        return await function(*args)

    app.state.queue = SimpleNamespace(call_model=queue_call)
    async def run():
        with pytest.raises(ApiError) as captured:
            async with shared_cache_lock(app, 'summary', 'cid'):
                await extras._call(app, provider)
        assert captured.value.code == 'ai_request_interrupted'
    asyncio.run(run())
    assert calls == []
