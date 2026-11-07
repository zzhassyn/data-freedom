"""Audited transport migrations never broaden semantic reuse permission."""
import asyncio
import copy
import time
from types import SimpleNamespace

import pytest

from app import llm_switch
from app.checklists import prepare_criterion
from app.evaluations import EvaluationQueue, empty_item, reusable_judge_identities
from app.models import JudgeResult, Usage
from tests.helpers import evaluate, use_runtime_providers


CURRENT = 'openrouter:v2:current-semantic-digest'
LEGACY = 'openrouter:audited-legacy-transport'
OTHER = 'openrouter:other-prompt-or-model'


@pytest.fixture
def lookup(monkeypatch):
    criterion = prepare_criterion({'id': 'contact', 'title': 'Контакт', 'description': 'Оператор представился.',
                                   'sectionId': 'service', 'order': 0, 'type': 'binary', 'weight': 10,
                                   'naAllowed': False, 'naCondition': None, 'scale': None, 'flagTypes': None})
    source = {'id': 'ev_old', 'conversationId': 'chat', 'checklistId': 'cl_1', 'transcriptHash': 'same-source',
              '_judgeIdentity': LEGACY, 'model': 'provider/model', 'items': [
                  {**empty_item(criterion), 'status': 'done', 'answer': 'yes', 'model': 'provider/model',
                   'usage': {'inputTokens': 10, 'outputTokens': 5, 'costUsd': .01, 'calls': 1}}]}
    target = {**copy.deepcopy(source), 'id': 'ev_new', '_judgeIdentity': CURRENT}
    provider = SimpleNamespace(cache_identity=lambda: CURRENT,
                               compatible_cache_identities=lambda: {CURRENT, LEGACY})
    monkeypatch.setattr(llm_switch, 'has_provider_overrides', lambda: False)
    monkeypatch.setattr(llm_switch, 'get_judge', lambda: provider)
    db = SimpleNamespace(all_evaluations=lambda: [source], get_checklist=lambda _: {'criteria': [criterion]})
    return EvaluationQueue(db, None), source, target, criterion, provider


def test_audited_transport_change_reuses_original_with_zero_usage_without_rewriting_source(lookup):
    queue, source, target, criterion, _ = lookup
    source['items'][0]['answer'] = 'no'
    source['items'][0]['original'] = {'answer': 'yes', 'points': 100, 'effectiveWeight': 100}
    source['items'][0]['appealId'] = 'appeal_1'
    before = copy.deepcopy(source)
    item, model = queue._find_reusable(target, criterion)
    assert model == 'provider/model' and item['answer'] == 'yes'
    assert item['reused'] is True and item['original'] is None and item['appealId'] is None
    assert item['usage'] == {'inputTokens': 0, 'outputTokens': 0, 'costUsd': 0, 'calls': 0}
    assert item['latencyMs'] == 0 and source == before


@pytest.mark.parametrize('identity', [None, '', 'unknown', 'fake', 'openrouter:uncertified', OTHER])
def test_unknown_or_semantically_changed_source_is_rejected(lookup, identity):
    queue, source, target, criterion, _ = lookup
    source['_judgeIdentity'] = identity
    assert queue._find_reusable(target, criterion) is None


def test_old_target_cannot_borrow_current_migration_allowlist(lookup):
    queue, source, target, criterion, _ = lookup
    target['_judgeIdentity'] = OTHER
    assert queue._find_reusable(target, criterion) is None
    source['_judgeIdentity'] = OTHER
    assert queue._find_reusable(target, criterion) is not None


@pytest.mark.parametrize('change', ['model', 'prompt'])
def test_current_semantic_change_does_not_certify_previous_legacy_source(lookup, change):
    queue, source, target, criterion, provider = lookup
    changed = 'openrouter:v2:changed-' + change
    provider.cache_identity = lambda: changed
    provider.compatible_cache_identities = lambda: {changed}
    target['_judgeIdentity'] = changed
    assert queue._find_reusable(target, criterion) is None


@pytest.mark.parametrize('change', ['fake-model', 'unknown-model', 'transcript', 'content'])
def test_certified_identity_preserves_all_other_reuse_guards(lookup, change):
    queue, source, target, criterion, _ = lookup
    if change in {'fake-model', 'unknown-model'}:
        source['items'][0]['model'] = 'fake' if change == 'fake-model' else None
    elif change == 'transcript':
        target['transcriptHash'] = 'changed-source'
    else:
        criterion = prepare_criterion({**criterion, 'description': 'Теперь оператор должен назвать номер.'})
    assert queue._find_reusable(target, criterion) is None


def test_provider_without_compatibility_keeps_only_exact_identity(lookup):
    queue, source, target, criterion, provider = lookup
    del provider.compatible_cache_identities
    assert queue._find_reusable(target, criterion) is None
    source['_judgeIdentity'] = CURRENT
    assert queue._find_reusable(target, criterion) is not None
    assert reusable_judge_identities(None) == reusable_judge_identities('unknown') == set()


def test_three_replacements_reuse_twenty_one_items_and_judge_only_three_new_items(seeded_client, monkeypatch):
    ids = ['p1-ru-001', 'p1-en-002', 'p1-kz-003']
    old_results = evaluate(seeded_client, ids=ids)
    db = seeded_client.app.state.db
    originals = []
    for result in old_results:
        record = db.get_evaluation(result['id'])
        record.update(_judgeIdentity=LEGACY, model='provider/model')
        for item in record['items']:
            item['model'] = 'provider/model'
        db.save_evaluation(record)
        originals.append(copy.deepcopy(record))

    body = copy.deepcopy(db.get_checklist('cl_1'))
    body.update(name='Новая помощь', basedOnVersion=1, isActive=False)
    closing = next(c for c in body['criteria'] if c['id'] == 'closing')
    closing.update(id='additional-help', title='Дополнительная помощь', description='Оператор предложил дополнительную помощь.')
    version = seeded_client.post('/api/checklists', json=body)
    assert version.status_code == 201
    calls = []

    async def judge(conversation, criterion):
        calls.append((conversation.id, criterion.id))
        return JudgeResult(answer='yes', explanation='Оператор предложил дополнительную помощь.',
                           evidence=[], checked_range=None, na_reason=None, flag_types=None,
                           needs_review=False, model='provider/model',
                           usage=Usage(input_tokens=10, output_tokens=5, cost_usd=.001, calls=1), latency_ms=1)

    settings = seeded_client.app.state.settings
    settings.openrouter_api_key = 'offline-test-key'
    settings.judge_model = 'provider/model'
    use_runtime_providers(settings)
    provider = SimpleNamespace(cache_identity=lambda: CURRENT, compatible_cache_identities=lambda: {CURRENT, LEGACY},
                               configured_model=lambda: 'provider/model', judge=judge)
    monkeypatch.setattr(llm_switch, 'get_judge', lambda: provider)
    results = evaluate(seeded_client, ids=ids, checklist_id=version.json()['id'], reuse=True)
    assert all(result['status'] == 'done' for result in results)
    assert set(calls) == {(cid, 'additional-help') for cid in ids} and len(calls) == 3
    assert sum(item['reused'] for result in results for item in result['items']) == 21
    assert sum(result['usage']['calls'] for result in results) == 3
    assert all(item['usage']['calls'] == 0 for result in results for item in result['items'] if item['reused'])
    assert all(db.get_evaluation(original['id']) == original for original in originals)
    assert db.get_checklist('active')['id'] == 'cl_1'


def _failed_runtime_record(client, monkeypatch, identity):
    result, = evaluate(client)
    db = client.app.state.db
    record = db.get_evaluation(result['id'])
    record.update(_judgeIdentity=identity, model='provider/model', status='failed', total=None)
    for item in record['items']:
        item['model'] = 'provider/model'
    record['items'][0].update(status='failed', answer=None, explanation='Прежняя ошибка')
    db.save_evaluation(record)
    settings = client.app.state.settings
    settings.openrouter_api_key = 'offline-test-key'
    settings.judge_model = 'provider/model'
    use_runtime_providers(settings)
    calls = []

    async def judge(conversation, criterion):
        calls.append(criterion.id)
        return JudgeResult(answer='yes', explanation='Проверено.', evidence=[], checked_range=None,
                           na_reason=None, flag_types=None, needs_review=False, model='provider/model',
                           usage=Usage(input_tokens=10, output_tokens=5, cost_usd=.001, calls=1), latency_ms=1)

    provider = SimpleNamespace(cache_identity=lambda: CURRENT, compatible_cache_identities=lambda: {CURRENT, LEGACY},
                               configured_model=lambda: 'provider/model', judge=judge)
    monkeypatch.setattr(llm_switch, 'get_judge', lambda: provider)
    return record, calls


@pytest.mark.parametrize('identity,allowed', [(CURRENT, True), (LEGACY, True), (OTHER, False),
                                              ('openrouter:changed-model', False), (None, False), ('unknown', False)])
def test_manual_retry_checks_compatibility_before_mutation(seeded_client, monkeypatch, identity, allowed):
    record, calls = _failed_runtime_record(seeded_client, monkeypatch, identity)
    cid = record['items'][0]['criterionId']
    response = seeded_client.post(f"/api/evaluations/{record['id']}/criteria/{cid}/retry", json={})
    db = seeded_client.app.state.db
    if not allowed:
        assert response.status_code == 409 and response.json()['error']['code'] == 'provider_changed'
        assert db.get_evaluation(record['id']) == record and calls == []
        return
    assert response.status_code == 202
    deadline = time.monotonic() + 5
    while db.get_evaluation(record['id'])['status'] in {'queued', 'running'} and time.monotonic() < deadline:
        time.sleep(.01)
    updated = db.get_evaluation(record['id'])
    assert updated['status'] == 'done' and calls == [cid]
    assert updated['_judgeIdentity'] == identity


@pytest.mark.parametrize('identity,allowed', [(CURRENT, True), (LEGACY, True), (OTHER, False),
                                              ('openrouter:changed-model', False), (None, False), ('unknown', False)])
def test_resumed_fresh_step_checks_compatibility_at_provider_invocation(seeded_client, monkeypatch, identity, allowed):
    record, calls = _failed_runtime_record(seeded_client, monkeypatch, identity)
    queue, db = seeded_client.app.state.queue, seeded_client.app.state.db
    cid = record['items'][0]['criterionId']
    criterion = next(c for c in db.get_checklist('cl_1')['criteria'] if c['id'] == cid)

    async def immediate(fn, *args, **kwargs):
        return await fn(*args, **kwargs)

    monkeypatch.setattr(queue, 'call_model', immediate)
    asyncio.run(queue._run_criterion(record['id'], criterion, db.get_conversation(record['conversationId'])))
    updated = db.get_evaluation(record['id'])
    item = next(i for i in updated['items'] if i['criterionId'] == cid)
    assert updated['_judgeIdentity'] == identity
    if allowed:
        assert item['status'] == 'done' and calls == [cid]
    else:
        assert item['status'] == 'failed' and calls == []
        assert item['explanation'] == 'Настройки модели изменились. Запустите новую оценку диалога.'
