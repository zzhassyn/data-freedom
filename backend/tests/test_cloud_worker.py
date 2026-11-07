"""Cloud API dispatch, durable recovery, and daemon ownership without live AI."""
import asyncio

import pytest

from app.background import LeaseLost, SummaryJobs, WorkerLease
from app.checklists import seed_checklist
from app.conversations import import_records
from app.db import Database
from app.evaluations import EvaluationQueue
from app.settings import Settings
from app.stt.service import TranscriptionQueue


def setup_db(tmp_path, dev_payload):
    db = Database(tmp_path / 'cloud.sqlite')
    seed_checklist(db)
    import_records(db, dev_payload, 'DEV')
    return db


def config_for(db, role, **kwargs):
    # Local SQLite simulates the shared SQL store for the process-role tests.
    config = Settings(db_path=db.path, auto_summarize=False, **kwargs)
    config.worker_mode = role
    return config


def test_cloud_api_requires_persistent_database(monkeypatch):
    monkeypatch.delenv('TURSO_DATABASE_URL', raising=False)
    monkeypatch.delenv('TURSO_AUTH_TOKEN', raising=False)
    with pytest.raises(ValueError, match='постоянную базу'):
        Settings(worker_mode='api')


def test_worker_lease_excludes_other_owner_and_fences_after_expiration(tmp_path):
    db = Database(tmp_path / 'lease.sqlite')
    now = [100.0]
    a = WorkerLease(db, owner='a', ttl=10, clock=lambda: now[0])
    b = WorkerLease(Database(db.path), owner='b', ttl=10, clock=lambda: now[0])
    assert a.acquire()
    assert not b.acquire()
    now[0] = 105
    a.renew()
    now[0] = 112
    assert not b.acquire()
    now[0] = 116
    assert b.acquire()
    with pytest.raises(LeaseLost):
        a.check()
    with pytest.raises(LeaseLost):
        a.renew()
    a.release()  # Old owner cannot clear the newer lease.
    b.check()
    b.release()
    assert a.acquire()


def test_api_persists_evaluation_for_daemon_without_starting_it(tmp_path, dev_payload):
    db = setup_db(tmp_path, dev_payload)

    async def run():
        api = EvaluationQueue(db, config_for(db, 'api'))
        await api.start()
        accepted = await api.submit(['p1-ru-001'], 'cl_1', reuse=False)
        eid = accepted['evaluationIds']['p1-ru-001']
        await asyncio.sleep(.01)
        assert db.get_evaluation(eid)['status'] == 'queued'
        assert not api._evaluations
        await api.close()
        worker = EvaluationQueue(Database(db.path), config_for(db, 'worker'))
        await worker.start()
        try:
            for _ in range(500):
                if db.get_evaluation(eid)['status'] in {'done', 'failed'}:
                    break
                await asyncio.sleep(.01)
            assert db.get_evaluation(eid)['status'] == 'done'
            assert db.get_job(accepted['jobId'])['done'] == 1
        finally:
            await worker.close()
    asyncio.run(run())


def test_running_daemon_polls_new_api_jobs_once(tmp_path, dev_payload, monkeypatch):
    from app import llm_switch
    db = setup_db(tmp_path, dev_payload)
    original = llm_switch.get_judge().judge
    calls = []

    async def counted(conversation, criterion):
        calls.append(criterion.id)
        return await original(conversation, criterion)

    monkeypatch.setattr(llm_switch.get_judge(), 'judge', counted)

    async def run():
        worker = EvaluationQueue(Database(db.path), config_for(db, 'worker'))
        api = EvaluationQueue(Database(db.path), config_for(db, 'api'))
        await worker.start()
        await api.start()
        try:
            created = await api.submit(['p1-ru-001'], 'cl_1', reuse=False)
            eid = created['evaluationIds']['p1-ru-001']
            for _ in range(500):
                worker.poll_pending()
                if db.get_evaluation(eid)['status'] in {'done', 'failed'}:
                    break
                await asyncio.sleep(.01)
            assert db.get_evaluation(eid)['status'] == 'done'
            assert len(calls) == len(set(calls)) == 8
        finally:
            await api.close()
            await worker.close()
    asyncio.run(run())


def test_api_cold_start_does_not_recover_inflight_and_worker_does_not_replay_it(tmp_path, dev_payload):
    db = setup_db(tmp_path, dev_payload)

    async def run():
        api = EvaluationQueue(db, config_for(db, 'api'))
        await api.start()
        accepted = await api.submit(['p1-ru-001'], 'cl_1', reuse=False)
        eid = accepted['evaluationIds']['p1-ru-001']
        evaluation = db.get_evaluation(eid)
        evaluation['status'] = 'running'
        for item in evaluation['items']:
            item['status'] = 'running'
        db.save_evaluation(evaluation)
        await api.close()
        cold_api = EvaluationQueue(Database(db.path), config_for(db, 'api'))
        await cold_api.start()
        assert db.get_evaluation(eid) == evaluation
        await cold_api.close()
        worker = EvaluationQueue(Database(db.path), config_for(db, 'worker'))
        await worker.start()
        try:
            for _ in range(100):
                if db.get_evaluation(eid)['status'] == 'failed':
                    break
                await asyncio.sleep(.01)
            result = db.get_evaluation(eid)
            assert result['status'] == 'failed'
            assert all(item['status'] == 'failed' for item in result['items'])
            assert result['usage']['calls'] == 0
        finally:
            await worker.close()
    asyncio.run(run())


def test_api_stt_rows_survive_function_without_workers(tmp_path, dev_payload):
    db = setup_db(tmp_path, dev_payload)
    calls = [c['id'] for c in db.all_conversations() if c.get('audioUrl')]
    assert calls
    settings = config_for(db, 'api', stt_enabled=True, openrouter_api_key='test-not-a-live-key')
    queue = TranscriptionQueue(db, settings)

    async def run():
        await queue.start()
        assert queue.enqueue(calls[:1]) == calls[:1]
        assert not queue.workers and not queue.scheduled
        assert queue.transcription(calls[0])['status'] == 'queued'
        worker_settings = config_for(db, 'worker', stt_enabled=True, openrouter_api_key='test-not-a-live-key')
        worker = TranscriptionQueue(Database(db.path), worker_settings)
        worker.poll_pending()
        worker.poll_pending()
        assert len(worker.scheduled) == worker.queue.qsize() == 1
        await queue.close()
    asyncio.run(run())


def test_summary_queue_deduplicates_source_and_does_not_replay_interrupted_call(tmp_path, dev_payload):
    db = setup_db(tmp_path, dev_payload)
    summaries = SummaryJobs(db)
    summaries.enqueue(['p1-ru-001', 'p1-ru-001'])
    first = summaries.claim()
    assert first[0] == 'p1-ru-001'
    summaries.enqueue(['p1-ru-001'])
    assert summaries.claim() is None
    restarted = SummaryJobs(Database(db.path))
    restarted.recover()
    assert restarted.claim() is None
    with db.transaction() as conn:
        assert conn.execute('SELECT status FROM background_summaries').fetchone()[0] == 'failed'
