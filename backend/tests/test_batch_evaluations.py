"""One paid batch, durable billing, partial retries and unchanged saved history."""
import asyncio
from copy import deepcopy
import time
from types import SimpleNamespace

import pytest

from app import llm_switch
from app.background import LeaseLost
from app.checklists import seed_checklist
from app.conversations import import_records
from app.db import Database
from app.errors import JudgeError
from app.evaluations import EvaluationQueue, zero_usage
from app.models import JudgeResult, Usage
from app.settings import Settings
from tests.helpers import evaluate, use_runtime_providers


IDENTITY = 'openrouter:batch-current-semantic-identity'
MODEL = 'provider/batch-model'


def batch_receipt(conversation, criteria, errors=None):
    errors = errors or {}
    turn = next(turn for turn in conversation.transcript if turn.speaker == 'operator')
    results = {}
    for criterion in criteria:
        if criterion.id in errors:
            continue
        answer = (criterion.scale[-1].value if criterion.type == 'scale'
                  else 'no' if criterion.type == 'flag' else 'yes')
        results[criterion.id] = JudgeResult(
            answer=answer, explanation='Проверенный результат тестового провайдера.',
            evidence=[{'turnIdx': turn.idx, 'quote': turn.text[:80], 'kind': 'supports'}],
            checked_range=(conversation.transcript[0].idx, conversation.transcript[-1].idx) if answer == 'no' else None,
            model=MODEL, usage=Usage(), latency_ms=0,
        )
    return SimpleNamespace(results=results, errors=errors,
                           diagnostics={cid: {'answer': 'yes', 'supportStatus': 'unsupported'} for cid in errors},
                           usage=Usage(input_tokens=80, output_tokens=40, cost_usd=.008, calls=1),
                           model=MODEL, latency_ms=97, request_sent=True)


@pytest.fixture
def batch_provider(seeded_client, monkeypatch):
    calls, failures, identity = [], {}, [IDENTITY]

    async def judge_batch(conversation, criteria):
        calls.append((conversation.id, [criterion.id for criterion in criteria]))
        return batch_receipt(conversation, criteria, failures)

    settings = seeded_client.app.state.settings
    settings.openrouter_api_key = 'offline-test-key'
    settings.judge_model = MODEL
    use_runtime_providers(settings)
    provider = SimpleNamespace(judge_batch=judge_batch, configured_model=lambda: MODEL,
                               cache_identity=lambda: identity[0],
                               compatible_cache_identities=lambda: {identity[0]})
    monkeypatch.setattr(llm_switch, 'get_judge', lambda: provider)
    return provider, calls, failures, identity


def ledger(db):
    with db.read_connection() as conn:
        row = conn.execute("SELECT COUNT(*) AS rows,COALESCE(SUM(calls),0) AS calls,COALESCE(SUM(cost_usd),0) AS cost FROM model_calls WHERE kind='evaluation'").fetchone()
    return dict(row)


def wait_evaluation(client, eid):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        result = client.get('/api/evaluations/' + eid).json()
        if result['status'] in {'done', 'failed'}:
            return result
        time.sleep(.01)
    raise AssertionError('Evaluation did not finish')


def test_one_batch_receipt_and_zero_cost_reuse_preserve_original(seeded_client, batch_provider):
    _, calls, _, _ = batch_provider
    result, = evaluate(seeded_client)
    db = seeded_client.app.state.db
    original = db.get_evaluation(result['id'])
    assert result['status'] == 'done' and result['usage']['calls'] == 1
    assert result['usage']['costUsd'] == .008 and result['usageIncomplete'] is False
    assert len(calls) == 1 and len(calls[0][1]) == 8
    assert all(item['usage']['calls'] == 0 and item['latencyMs'] is None for item in result['items'])
    assert '_batchCalls' not in result and len(original['_batchCalls']) == 1
    assert ledger(db) == {'rows': 1, 'calls': 1, 'cost': .008}
    cached, = evaluate(seeded_client, reuse=True)
    assert cached['status'] == 'done' and cached['usage'] == zero_usage()
    assert all(item['reused'] for item in cached['items']) and len(calls) == 1
    assert db.get_evaluation(result['id']) == original
    health = seeded_client.get('/api/health').json()
    assert health['avgBatchMs'] == 97 and health['avgCriterionMs'] == 0
    assert health['totalCostUsd'] == .008 and health['totalCostIncomplete'] is False


def test_partial_failure_and_targeted_retry_charge_each_batch_once(seeded_client, batch_provider):
    _, calls, failures, _ = batch_provider
    failures['contact'] = 'Не хватает наблюдаемого основания для этого ответа.'
    result, = evaluate(seeded_client)
    db = seeded_client.app.state.db
    assert result['status'] == 'failed' and result['total'] is None
    assert sum(item['status'] == 'done' for item in result['items']) == 7
    failed = next(item for item in result['items'] if item['criterionId'] == 'contact')
    assert failed['answer'] is None and failed['explanation'] == failures['contact']
    assert result['usage']['calls'] == 1 and result['usageIncomplete'] is False
    record = db.get_evaluation(result['id'])
    assert record['_batchCalls'][0]['diagnostics']['contact']['answer'] == 'yes'
    assert not any(key.startswith('_') for key in result)
    previous = {item['criterionId']: (item['answer'], item['explanation'], item['evidence'])
                for item in result['items'] if item['status'] == 'done'}
    failures.clear()
    response = seeded_client.post(f"/api/evaluations/{result['id']}/criteria/contact/retry", json={})
    assert response.status_code == 202
    finished = wait_evaluation(seeded_client, result['id'])
    assert finished['status'] == 'done' and calls[-1][1] == ['contact'] and len(calls) == 2
    assert finished['usage']['calls'] == 2 and finished['usage']['costUsd'] == .016
    assert ledger(db) == {'rows': 2, 'calls': 2, 'cost': .016}
    assert all((item['answer'], item['explanation'], item['evidence']) == previous[item['criterionId']]
               for item in finished['items'] if item['criterionId'] != 'contact')


def test_changed_custom_rule_reuses_seven_and_sends_one_current_rule(seeded_client, batch_provider):
    _, calls, _, _ = batch_provider
    original, = evaluate(seeded_client)
    db = seeded_client.app.state.db
    before = db.get_evaluation(original['id'])
    body = deepcopy(db.get_checklist('cl_1'))
    body.update(name='Новая версия', basedOnVersion=1, isActive=False)
    next(criterion for criterion in body['criteria'] if criterion['id'] == 'closing')['description'] = 'Оператор назвал следующий шаг.'
    created = seeded_client.post('/api/checklists', json=body)
    assert created.status_code == 201
    result, = evaluate(seeded_client, checklist_id=created.json()['id'], reuse=True)
    assert result['status'] == 'done' and calls[-1][1] == ['closing'] and len(calls) == 2
    assert sum(item['reused'] for item in result['items']) == 7
    assert result['usage']['calls'] == 1 and db.get_evaluation(original['id']) == before
    assert db.get_checklist('active')['id'] == 'cl_1'


@pytest.mark.parametrize('known,request_sent', [(False, True), (True, True), (True, False)])
def test_failed_batch_billing_is_known_once_or_explicitly_incomplete(seeded_client, batch_provider, known, request_sent):
    provider, calls, _, _ = batch_provider

    async def failing(conversation, criteria):
        calls.append((conversation.id, [criterion.id for criterion in criteria]))
        failure = JudgeError('Сервис оценки не завершил запрос. Повторите критерий.')
        failure.usage = Usage(cost_usd=.003, calls=1) if known and request_sent else Usage() if known else None
        failure.request_sent, failure.model, failure.latency_ms = request_sent, MODEL, 41
        # Even a raw 429 from a provider implementation cannot replay a batch.
        failure.status_code = 429
        raise failure

    provider.judge_batch = failing
    result, = evaluate(seeded_client)
    assert len(calls) == 1 and result['status'] == 'failed'
    assert all(item['status'] == 'failed' for item in result['items'])
    assert result['usageIncomplete'] is (not known and request_sent)
    expected = .003 if known and request_sent else 0
    assert result['usage']['costUsd'] == expected
    assert ledger(seeded_client.app.state.db) == {'rows': int(known and request_sent), 'calls': int(known and request_sent), 'cost': expected}
    if not known:
        async def succeed(conversation, criteria):
            calls.append((conversation.id, [criterion.id for criterion in criteria]))
            return batch_receipt(conversation, criteria)
        provider.judge_batch = succeed
        response = seeded_client.post(f"/api/evaluations/{result['id']}/criteria/contact/retry", json={})
        assert response.status_code == 202
        retried = wait_evaluation(seeded_client, result['id'])
        assert calls[-1][1] == ['contact'] and len(calls) == 2
        assert retried['usageIncomplete'] is True and retried['usage']['costUsd'] == .008
        health = seeded_client.get('/api/health').json()
        assert health['totalCostIncomplete'] is True


def test_queued_identity_change_fails_before_provider_and_receipt(seeded_client, batch_provider, monkeypatch):
    _, calls, _, identity = batch_provider
    queue, db = seeded_client.app.state.queue, seeded_client.app.state.db
    original_call = queue.call_model

    async def changed_before_slot(fn, *args, **kwargs):
        identity[0] = 'openrouter:changed-prompt'
        return await original_call(fn, *args, **kwargs)

    monkeypatch.setattr(queue, 'call_model', changed_before_slot)
    result, = evaluate(seeded_client)
    assert result['status'] == 'failed' and not calls
    assert '_batchCalls' not in db.get_evaluation(result['id'])
    assert ledger(db) == {'rows': 0, 'calls': 0, 'cost': 0}
    before = db.get_evaluation(result['id'])
    retry = seeded_client.post(f"/api/evaluations/{result['id']}/criteria/contact/retry", json={})
    assert retry.status_code == 409 and db.get_evaluation(result['id']) == before


def test_batch_receipt_and_ledger_rollback_together_and_duplicate_completion_is_noop(seeded_client, batch_provider, monkeypatch):
    provider, _, _, _ = batch_provider
    queue, db = seeded_client.app.state.queue, seeded_client.app.state.db
    result, = evaluate(seeded_client)
    record = db.get_evaluation(result['id'])
    record['_batchCalls'].append({'id': 'atomic-attempt', 'criterionIds': ['contact'], 'status': 'running',
                                   'usage': None, 'usageKnown': False, 'requestSent': True, 'model': MODEL})
    db.save_evaluation(record)
    criterion = next(row for row in db.get_checklist('cl_1')['criteria'] if row['id'] == 'contact')
    source = record['_conversation']
    from app.models import Conversation, Criterion
    receipt = batch_receipt(Conversation.model_validate(source), [Criterion.model_validate(criterion)])
    original_save = db.save_evaluation

    def broken_save(*args, **kwargs):
        raise RuntimeError('Synthetic persistence failure after ledger insertion')

    monkeypatch.setattr(db, 'save_evaluation', broken_save)
    with pytest.raises(RuntimeError):
        queue._complete_batch(record['id'], 'atomic-attempt', [criterion], source, receipt=receipt)
    assert ledger(db)['rows'] == 1 and db.get_evaluation(record['id']) == record
    monkeypatch.setattr(db, 'save_evaluation', original_save)
    assert queue._complete_batch(record['id'], 'atomic-attempt', [criterion], source, receipt=receipt) is True
    assert queue._complete_batch(record['id'], 'atomic-attempt', [criterion], source, receipt=receipt) is False
    assert ledger(db) == {'rows': 2, 'calls': 2, 'cost': .016}


@pytest.mark.parametrize('mode', ['standalone', 'worker'])
def test_cancelled_inflight_batch_is_not_replayed_after_restart(tmp_path, dev_payload, monkeypatch, mode):
    db = Database(tmp_path / 'recovery.sqlite')
    seed_checklist(db)
    import_records(db, dev_payload, 'DEV')
    settings = Settings(db_path=db.path, auto_summarize=False, openrouter_api_key='offline-test-key', judge_model=MODEL)
    settings.worker_mode = mode
    use_runtime_providers(settings)
    calls = []

    async def scenario():
        entered = asyncio.Event()

        async def interrupted(conversation, criteria):
            calls.append([criterion.id for criterion in criteria])
            entered.set()
            await asyncio.Event().wait()

        provider = SimpleNamespace(judge_batch=interrupted, configured_model=lambda: MODEL,
                                   cache_identity=lambda: IDENTITY, compatible_cache_identities=lambda: {IDENTITY})
        monkeypatch.setattr(llm_switch, 'get_judge', lambda: provider)
        first = EvaluationQueue(db, settings)
        await first.start()
        accepted = await first.submit(['p1-ru-001'], 'cl_1', reuse=False)
        await asyncio.wait_for(entered.wait(), 2)
        await first.close()
        eid = accepted['evaluationIds']['p1-ru-001']
        inflight = db.get_evaluation(eid)
        assert inflight['_batchCalls'][0]['status'] == 'running' and inflight['usageIncomplete'] is True
        recovered = EvaluationQueue(Database(db.path), settings)
        await recovered.start()
        try:
            for _ in range(200):
                if db.get_evaluation(eid)['status'] == 'failed':
                    break
                await asyncio.sleep(.005)
            final = db.get_evaluation(eid)
            assert final['status'] == 'failed' and all(item['status'] == 'failed' for item in final['items'])
            assert final['_batchCalls'][0]['status'] == 'interrupted' and final['usageIncomplete'] is True
            assert len(calls) == 1 and ledger(db)['rows'] == 0
        finally:
            await recovered.close()

    asyncio.run(scenario())


@pytest.mark.parametrize('lose_after_provider', [False, True])
def test_lease_loss_fences_batch_before_call_and_atomic_result_commit(seeded_client, batch_provider, monkeypatch, lose_after_provider):
    provider, calls, _, _ = batch_provider
    queue, db = seeded_client.app.state.queue, seeded_client.app.state.db
    # Use a previously saved row only as an isolated local fixture.
    result, = evaluate(seeded_client)
    record = db.get_evaluation(result['id'])
    record.update(status='running', _batchCalls=[], usage=zero_usage(), usageIncomplete=False)
    for item in record['items']:
        item.update(status='pending', answer=None)
    db.save_evaluation(record)
    calls.clear()
    lost = [not lose_after_provider]

    def guard(conn=None):
        if lost[0]:
            raise LeaseLost('Synthetic expired lease')

    async def outcome(conversation, criteria):
        calls.append([criterion.id for criterion in criteria])
        lost[0] = True
        return batch_receipt(conversation, criteria)

    async def immediate(fn, *args, **kwargs):
        return await fn(*args, **kwargs)

    provider.judge_batch = outcome
    monkeypatch.setattr(queue, 'call_model', immediate)
    monkeypatch.setattr(queue, 'background_guard', guard)
    criteria = db.get_checklist('cl_1')['criteria']
    with pytest.raises(LeaseLost):
        asyncio.run(queue._run_batch(record['id'], criteria, record['_conversation']))
    current = db.get_evaluation(record['id'])
    assert len(calls) == int(lose_after_provider) and ledger(db)['rows'] == 1
    if lose_after_provider:
        assert current['_batchCalls'][0]['status'] == 'running' and current['usageIncomplete'] is True
        assert all(item['status'] == 'running' for item in current['items'])
    else:
        assert current == record
