"""Real-mode views exclude fixture answers without deleting historical work."""
import asyncio
import copy
from types import SimpleNamespace

import pytest

from app.checklists import prepare_criterion
from app.evaluations import EvaluationQueue, is_evaluation_visible, is_real_model
from tests.helpers import evaluate, use_runtime_providers, use_test_providers


def _open_appeal(client, evaluation):
    response = client.post('/api/appeals', json={'evaluationId': evaluation['id'], 'criterionId': 'contact',
                                               'comment': 'Прошу повторно проверить установление контакта.',
                                               'proposedAnswer': 'no'})
    assert response.status_code == 201
    return response.json()


def _real_record(db, evaluation, model='provider/older-real-model'):
    """Synthetic persisted provenance fixture; no accuracy/provider claim."""
    record = copy.deepcopy(db.get_evaluation(evaluation['id']))
    record['model'] = model
    record['_judgeIdentity'] = 'openrouter:older-configuration'
    record['usage'] = {'inputTokens': 80, 'outputTokens': 40, 'costUsd': .08, 'calls': 8}
    for item in record['items']:
        item['model'] = model
        item['latencyMs'] = 1234
        item['usage'] = {'inputTokens': 10, 'outputTokens': 5, 'costUsd': .01, 'calls': 1}
    db.save_evaluation(record)
    return record


def test_fixture_scores_and_appeals_are_hidden_everywhere_without_deleting_them(seeded_client):
    evaluation, = evaluate(seeded_client)
    appeal = _open_appeal(seeded_client, evaluation)
    db = seeded_client.app.state.db
    original_evaluation = copy.deepcopy(db.get_evaluation(evaluation['id']))
    original_appeal = copy.deepcopy(db.get_appeal(appeal['id']))
    job = next(job for job in db.all_jobs() if any(i['evaluationId'] == evaluation['id'] for i in job['items']))
    use_runtime_providers(seeded_client.app.state.settings)

    registry = seeded_client.get('/api/conversations').json()
    row = next(item for item in registry['items'] if item['id'] == evaluation['conversationId'])
    assert row['lastEvaluation'] is None
    assert registry['counts']['evaluated'] == registry['counts']['appealsOpen'] == 0
    assert seeded_client.get(f"/api/conversations/{evaluation['conversationId']}/evaluations").json() == {'items': []}
    assert seeded_client.get('/api/appeals?status=all').json() == {'items': [], 'counts': {'open': 0, 'decided': 0}}
    assert seeded_client.get('/api/operators').json() == {'items': []}
    stats = seeded_client.get('/api/stats').json()
    assert stats['evaluated'] == 0 and stats['avgTotal'] is None and stats['grossCount'] == 0
    assert stats['appeals'] == {'open': 0, 'confirmed': 0, 'changed': 0}
    assert seeded_client.get('/api/export?format=json').json() == []
    assert seeded_client.get('/api/checklists/cl_1/compare?against=cl_1').json()['items'] == []
    assert seeded_client.get('/api/checklists').json()['items'][0]['evaluationsCount'] == 0
    health = seeded_client.get('/api/health').json()
    assert health['avgEvaluationCostUsd'] == health['avgCriterionMs'] == 0

    guarded = [
        ('get', f"/api/evaluations/{evaluation['id']}", None),
        ('get', f"/api/evaluations/{evaluation['id']}/conversation", None),
        ('get', f"/api/evaluations/{evaluation['id']}/coaching", None),
        ('get', f"/api/evaluations/{evaluation['id']}/coaching?stream=true", None),
        ('get', f"/api/jobs/{job['id']}", None),
        ('get', f"/api/appeals/{appeal['id']}", None),
        ('post', f"/api/evaluations/{evaluation['id']}/criteria/contact/retry", {}),
        ('post', f"/api/appeals/{appeal['id']}/second-opinion", {}),
        ('post', f"/api/appeals/{appeal['id']}/decision", {'action': 'confirm', 'reason': 'Оценка проверена повторно.'}),
        ('post', '/api/appeals', {'evaluationId': evaluation['id'], 'criterionId': 'closing',
                               'comment': 'Прошу перепроверить завершение разговора.'}),
    ]
    for method, path, body in guarded:
        response = seeded_client.get(path) if method == 'get' else seeded_client.post(path, json=body)
        assert response.status_code == 409, (path, response.text)
        assert response.json()['error']['code'] == 'provider_changed'
    assert db.get_evaluation(evaluation['id']) == original_evaluation
    assert db.get_appeal(appeal['id']) == original_appeal
    use_test_providers(seeded_client.app.state.settings)
    assert seeded_client.get(f"/api/evaluations/{evaluation['id']}").status_code == 200
    assert seeded_client.get('/api/appeals').json()['counts']['open'] == 1


def test_newer_fixture_does_not_hide_genuine_older_model_history_or_appeals(seeded_client):
    first, = evaluate(seeded_client)
    real = _real_record(seeded_client.app.state.db, first)
    appeal = _open_appeal(seeded_client, real)
    latest_fake, = evaluate(seeded_client)
    use_runtime_providers(seeded_client.app.state.settings)
    registry = seeded_client.get('/api/conversations').json()
    row = next(item for item in registry['items'] if item['id'] == real['conversationId'])
    assert row['lastEvaluation']['id'] == real['id']
    assert registry['counts']['evaluated'] == registry['counts']['appealsOpen'] == 1
    history = seeded_client.get(f"/api/conversations/{real['conversationId']}/evaluations").json()['items']
    assert [item['id'] for item in history] == [real['id']]
    assert seeded_client.get(f"/api/evaluations/{real['id']}").status_code == 200
    assert seeded_client.get(f"/api/evaluations/{latest_fake['id']}").status_code == 409
    assert seeded_client.get(f"/api/appeals/{appeal['id']}").status_code == 200
    assert seeded_client.get('/api/appeals').json()['counts']['open'] == 1
    assert seeded_client.get('/api/stats').json()['evaluated'] == 1
    health = seeded_client.get('/api/health').json()
    assert health['avgEvaluationCostUsd'] == pytest.approx(.08)
    assert health['avgCriterionMs'] == 1234


@pytest.mark.parametrize('model', [None, '', 'fake', 'fixture-1', 'mock/provider', 'unknown',
                                 'provider/real, unknown', 'provider/real, fake', 'provider/real, '])
def test_unknown_or_mixed_item_models_cannot_be_laundered_by_aggregate_model(model):
    use_runtime_providers()
    record = {'model': 'provider/real', '_judgeIdentity': 'openrouter:same', 'items': [
        {'status': 'done', 'model': 'provider/real'}, {'status': 'done', 'model': model}]}
    assert not is_real_model(model)
    assert not is_evaluation_visible(record)
    assert is_real_model('provider/first, provider/second')


def test_pending_real_failures_remain_visible_but_legacy_fake_work_does_not_resume(seeded_client):
    evaluation, = evaluate(seeded_client)
    db = seeded_client.app.state.db
    record = db.get_evaluation(evaluation['id'])
    record['status'] = 'running'
    record['items'][0]['status'] = 'pending'
    db.save_evaluation(record)
    use_runtime_providers(seeded_client.app.state.settings)
    assert is_evaluation_visible({'model': '', '_judgeIdentity': 'openrouter:configured', 'items': [{'status': 'failed'}]})
    assert not is_evaluation_visible({'model': '', '_judgeIdentity': 'unknown', 'items': [{'status': 'pending'}]})

    async def start_and_close():
        queue = EvaluationQueue(db, SimpleNamespace(judge_concurrency=1, model_timeout=1))
        await queue.start()
        try:
            assert not queue._evaluations
            assert db.get_evaluation(evaluation['id']) == record
        finally:
            await queue.close()
    asyncio.run(start_and_close())


def test_reuse_needs_item_provenance_even_when_provider_identity_matches(seeded_client):
    evaluation, = evaluate(seeded_client)
    db = seeded_client.app.state.db
    record = _real_record(db, evaluation)
    record['items'][0]['model'] = None
    db.save_evaluation(record)
    use_runtime_providers(seeded_client.app.state.settings)
    target = copy.deepcopy(record)
    target['id'] = 'ev-new-request'
    criterion = next(c for c in db.get_checklist('cl_1')['criteria'] if c['id'] == record['items'][0]['criterionId'])
    assert seeded_client.app.state.queue._find_reusable(target, criterion) is None


def test_contextual_na_metadata_has_canonical_hash_and_uses_original_snapshot(seeded_client):
    record = {'conversation_id': 'contextual-call', 'channel': 'voice call', 'language': 'RU',
              'transcript': [
                  {'timestamp': '00:00', 'speaker': 'system', 'text': 'Запись началась после соединения.'},
                  {'timestamp': '00:02', 'speaker': 'operator', 'text': 'Да, об этом я и говорю.'}]}
    assert seeded_client.post('/api/conversations/upload', json=[record]).status_code == 200
    current = seeded_client.get('/api/conversations/contextual-call').json()
    contact = next(c for c in seeded_client.app.state.db.get_checklist('cl_1')['criteria'] if c['id'] == 'contact')
    assert current['contextualNaCriteria'] == ['contact']
    assert current['contextualNaCriterionHashes'] == {'contact': contact['contentHash']}
    changed = prepare_criterion({**contact, 'description': 'Да, если оператор отвечает на вопрос.'})
    assert changed['contentHash'] != current['contextualNaCriterionHashes']['contact']
    assert contact['naAllowed'] is False

    evaluation, = evaluate(seeded_client)
    db = seeded_client.app.state.db
    snapshot = db.get_evaluation(evaluation['id'])
    snapshot['conversationId'] = 'contextual-call'
    snapshot['_conversation'] = db.get_conversation('contextual-call')
    snapshot['transcriptHash'] = snapshot['_conversation']['transcriptHash']
    db.save_evaluation(snapshot)
    record['transcript'][1]['text'] = 'Здравствуйте, меня зовут [Имя скрыто].'
    assert seeded_client.post('/api/conversations/upload', json=[record]).status_code == 200
    latest = seeded_client.get('/api/conversations/contextual-call').json()
    assert latest['contextualNaCriteria'] == [] and latest['contextualNaCriterionHashes'] == {}
    original = seeded_client.get(f"/api/evaluations/{evaluation['id']}/conversation").json()
    assert original['contextualNaCriteria'] == ['contact']
    assert original['contextualNaCriterionHashes'] == {'contact': contact['contentHash']}
