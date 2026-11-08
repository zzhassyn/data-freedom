"""Durable topic execution across process roles; every provider is an explicit stub."""
import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app import llm_switch, topics
from app.background import LeaseLost, WorkerLease
from app.db import Database
from app.errors import ApiError, JudgeError
from app.main import create_app
from app.models import TopicAssignment, Usage
from app.settings import Settings
from app.topic_jobs import ATTEMPT_KIND, JOB_KEY, JOB_KIND, TopicAttempt, read_job, topic_usage_incomplete
from tests.providers import PROVIDERS


def record(cid):
    return {'conversation_id': cid, 'channel': 'agent chat', 'language': 'RU',
            'transcript': [{'speaker': 'operator', 'timestamp': '00:00', 'text': 'Здравствуйте.'},
                           {'speaker': 'client', 'timestamp': '00:01', 'text': 'Не могу войти.'}]}


@contextmanager
def process(path, role):
    settings = Settings(db_path=str(path), auto_summarize=False, auto_evaluate_imports=False,
                        stt_enabled=False, openrouter_api_key='')
    settings.worker_mode = role  # SQLite stands in for the shared remote SQL store.
    lease = WorkerLease(Database(path)) if role == 'worker' else None
    if lease:
        assert lease.acquire()
    app = create_app(settings, providers=PROVIDERS, background_guard=lease.check if lease else None)
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if lease:
            lease.release()


def wait_job(client):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        job = client.get('/api/topics').json()['job']
        if job['status'] != 'running':
            return job
        time.sleep(.01)
    raise AssertionError(job)


def success(monkeypatch, calls):
    async def classify(conversation, catalog):
        calls.append(conversation.id)
        return TopicAssignment(new_title='Вход в приложение', resolution_status='unknown',
                               usage=Usage(calls=1, cost_usd=.01, input_tokens=20, output_tokens=5))
    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', classify, raising=False)


def test_api_cold_start_is_read_only_and_worker_consumes_exact_scope(tmp_path, monkeypatch):
    path = tmp_path / 'shared.sqlite'
    calls = []
    success(monkeypatch, calls)
    with process(path, 'api') as api:
        api.post('/api/conversations/upload', json=[record('one'), record('two')])
        job = api.post('/api/topics/analyze', json={'conversationIds': ['one']}).json()
        assert job['status'] == 'running' and job['phase'] == 'queued'
        assert calls == [] and api.app.state.topic_jobs.task is None
    with process(path, 'api') as cold:
        assert cold.get('/api/topics').json()['job'] == job
        assert calls == []
        with process(path, 'worker') as worker:
            result = wait_job(worker)
            assert result['status'] == 'done' and result['processed'] == 1
            assert cold.get('/api/topics').json()['job'] == result
            assert cold.get('/api/analytics').json()['coverage']['topicsPending'] == 1
    assert calls == ['one']


def test_existing_worker_polls_later_api_job_once(tmp_path, monkeypatch):
    path = tmp_path / 'shared.sqlite'
    calls = []
    success(monkeypatch, calls)
    with process(path, 'worker') as worker, process(path, 'api') as api:
        api.post('/api/conversations/upload', json=[record('one')])
        api.post('/api/topics/analyze', json={})
        assert calls == []
        worker.portal.call(worker.app.state.topic_jobs.poll_pending)
        worker.portal.call(worker.app.state.topic_jobs.poll_pending)
        assert wait_job(worker)['processed'] == 1
        assert api.post('/api/topics/analyze', json={}).json()['total'] == 0
        assert calls == ['one']


def test_two_api_instances_deduplicate_and_never_widen_active_scope(tmp_path):
    path = tmp_path / 'shared.sqlite'
    with process(path, 'api') as a, process(path, 'api') as b:
        a.post('/api/conversations/upload', json=[record('one'), record('two')])
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(client.post, '/api/topics/analyze', json={'conversationIds': ['one']})
                       for client in (a, b)]
            results = [future.result().json() for future in futures]
        assert results[0]['id'] == results[1]['id']
        assert b.post('/api/topics/analyze', json={}).status_code == 409
        assert b.post('/api/topics/analyze', json={'conversationIds': []}).json()['total'] == 0
        assert b.post('/api/topics/analyze', json={'conversationIds': ['missing']}).status_code == 400
        assert a.get('/api/topics').json()['job']['id'] == results[0]['id']
        assert a.get('/api/analytics', params={'conversationIds': '["two"]'}).json()['topics']['job']['selectedCount'] == 0


@pytest.mark.parametrize('sent', [False, True])
def test_recovery_replays_only_work_that_was_never_sent(tmp_path, monkeypatch, sent):
    path = tmp_path / 'shared.sqlite'
    calls = []
    success(monkeypatch, calls)
    with process(path, 'api') as api:
        api.post('/api/conversations/upload', json=[record('one'), record('two')])
        api.post('/api/topics/analyze', json={})
        db = api.app.state.db
        with db.transaction() as conn:
            job = db.get_cache(JOB_KIND, JOB_KEY, conn)['body']
            first = job['items'][0]
            first['status'] = 'running'
            db.set_cache(JOB_KIND, JOB_KEY, job, conn=conn)
        attempt = TopicAttempt(db, first['attemptId'], cid=first['conversationId'],
                               source_hash=first['sourceHash'], provider=job['providerIdentity'], job_id=job['id'])
        if sent:
            with db.transaction() as conn:
                attempt.sent(conn)
        persisted = db.get_cache(JOB_KIND, JOB_KEY)
    with process(path, 'api') as cold:
        assert cold.app.state.db.get_cache(JOB_KIND, JOB_KEY) == persisted
        with process(path, 'worker') as worker:
            result = wait_job(worker)
            assert result['status'] == ('error' if sent else 'done')
            assert result['processed'] == (1 if sent else 2)
            assert topic_usage_incomplete(worker.app.state.db) is sent
            assert worker.get('/api/health').json()['totalCostIncomplete'] is sent
    assert calls == [item['conversationId'] for item in job['items'] if not sent or item is not first]


def test_cancelled_sent_call_stays_unknown_and_is_not_replayed_on_restart(tmp_path, monkeypatch):
    path = tmp_path / 'local.sqlite'
    entered = threading.Event()
    calls = []
    async def blocked(conversation, catalog):
        calls.append(conversation.id)
        entered.set()
        await asyncio.Event().wait()
    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', blocked, raising=False)
    with process(path, 'standalone') as app:
        app.post('/api/conversations/upload', json=[record('one'), record('two')])
        app.post('/api/topics/analyze', json={})
        assert entered.wait(3)
    success(monkeypatch, calls)
    with process(path, 'standalone') as restarted:
        job = wait_job(restarted)
        assert job['status'] == 'error' and job['processed'] == job['failed'] == 1
        assert topic_usage_incomplete(restarted.app.state.db)
        assert restarted.get('/api/health').json()['totalCostUsd'] == .01
    assert len(calls) == 2 and set(calls) == {'one', 'two'}


@pytest.mark.parametrize('reported', [False, True])
def test_429_is_not_retried_and_known_failure_cost_is_recorded_once(client, monkeypatch, reported):
    calls = []
    async def rejected(conversation, catalog):
        calls.append(conversation.id)
        error = JudgeError('provider error')
        error.status_code = 429
        error.usage = Usage(calls=1, cost_usd=.02) if reported else Usage()
        raise error
    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', rejected, raising=False)
    client.post('/api/conversations/upload', json=[record('one'), record('two')])
    client.post('/api/topics/analyze', json={})
    job = wait_job(client)
    assert job['failed'] == job['skipped'] == 1 and job['status'] == 'error'
    assert len(calls) == 1 and calls[0] in {'one', 'two'}
    health = client.get('/api/health').json()
    assert health['totalCostUsd'] == (.02 if reported else 0)
    assert health['totalCostIncomplete'] is (not reported)


def test_success_without_usage_is_not_reported_as_known_zero(client, monkeypatch):
    async def no_usage(conversation, catalog):
        return TopicAssignment(new_title='Вход')
    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', no_usage, raising=False)
    client.post('/api/conversations/upload', json=[record('one')])
    client.post('/api/topics/analyze', json={})
    assert wait_job(client)['status'] == 'done'
    assert client.get('/api/health').json()['totalCostIncomplete'] is True


@pytest.mark.parametrize('changed', ['transcript', 'provider'])
def test_changed_queued_source_or_provider_is_rejected_before_send(tmp_path, monkeypatch, changed):
    path = tmp_path / 'shared.sqlite'
    calls = []
    success(monkeypatch, calls)
    with process(path, 'api') as api:
        api.post('/api/conversations/upload', json=[record('one')])
        api.post('/api/topics/analyze', json={})
        if changed == 'transcript':
            modified = record('one')
            modified['transcript'][1]['text'] += ' Новый текст.'
            api.post('/api/conversations/upload', json=[modified])
        else:
            previous = topics.identity
            monkeypatch.setattr(topics, 'identity', lambda app: previous(app) + ':changed')
        with process(path, 'worker') as worker:
            assert wait_job(worker)['failed'] == 1
            assert not topic_usage_incomplete(worker.app.state.db)
    assert calls == []


def test_lost_worker_lease_cannot_publish_but_known_usage_is_preserved(client, monkeypatch):
    allowed = [True]
    def guard(conn=None):
        if not allowed[0]:
            raise LeaseLost('replacement owner')
    async def replaced(conversation, catalog):
        allowed[0] = False
        return TopicAssignment(new_title='Нельзя публиковать', usage=Usage(calls=1, cost_usd=.03))
    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', replaced, raising=False)
    client.app.state.background_guard = guard
    client.post('/api/conversations/upload', json=[record('one')])
    with pytest.raises(LeaseLost):
        client.portal.call(topics.classify, client.app, 'one')
    assert topics.catalog(client.app.state.db) == []
    assert topics.assignment(client.app, client.app.state.db.get_conversation('one')) is None
    assert client.get('/api/health').json()['totalCostUsd'] == .03


def test_catalog_reservation_keeps_unsent_work_queued(client, monkeypatch):
    client.app.state.settings.worker_mode = 'api'
    client.post('/api/conversations/upload', json=[record('one')])
    client.post('/api/topics/analyze', json={})
    calls = []
    async def reserved(*args, **kwargs):
        raise ApiError('ai_request_running', 'catalog reserved', 409)
    with monkeypatch.context() as patch:
        patch.setattr(topics, 'classify', reserved)
        client.app.state.settings.worker_mode = 'standalone'
        client.portal.call(client.app.state.topic_jobs.poll_pending)
        client.portal.call(lambda: client.app.state.topic_jobs.task)
        job = read_job(client.app.state.db)
        assert job['status'] == 'running' and job['phase'] == 'queued' and job['failed'] == 0
    success(monkeypatch, calls)
    client.portal.call(client.app.state.topic_jobs.poll_pending)
    assert wait_job(client)['processed'] == 1 and calls == ['one']


def test_late_known_receipt_settles_unknown_without_double_counting(client):
    db = client.app.state.db
    client.app.state.settings.worker_mode = 'api'
    client.post('/api/conversations/upload', json=[record('one')])
    client.post('/api/topics/analyze', json={})
    job = db.get_cache(JOB_KIND, JOB_KEY)['body']
    item = job['items'][0]
    attempt = TopicAttempt(db, item['attemptId'], cid='one', source_hash=item['sourceHash'],
                           provider=job['providerIdentity'], job_id=job['id'])
    with db.transaction() as conn:
        attempt.sent(conn)
    assert read_job(db)['usageIncomplete'] is True
    attempt.finish('interrupted')
    assert topic_usage_incomplete(db)
    receipt = {'calls': 1, 'costUsd': .04, 'inputTokens': 5, 'outputTokens': 2}
    attempt.finish('failed', receipt)
    attempt.finish('failed', receipt)
    assert not topic_usage_incomplete(db)
    assert read_job(db)['usageIncomplete'] is False
    assert client.get('/api/health').json()['totalCostUsd'] == .04
