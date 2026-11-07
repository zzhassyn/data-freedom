"""Normal startup has real providers only; injection lives in tests/helpers.py."""
import copy
import importlib.util

import httpx
import pytest
from fastapi.testclient import TestClient

from app import llm_switch
from app.main import create_app as create_runtime_app
from app.settings import Settings
from tests.helpers import evaluate, use_runtime_providers


def test_runtime_defaults_to_openrouter_and_contains_no_prepared_adapters(monkeypatch):
    monkeypatch.delenv('JUDGE', raising=False)
    assert Settings(stt_enabled=False).judge == 'openrouter'
    with pytest.raises(ValueError, match='openrouter'):
        Settings(judge='fake')
    assert importlib.util.find_spec('app.judge.fake') is None
    assert importlib.util.find_spec('app.ai.fake') is None
    use_runtime_providers(Settings(openrouter_api_key='', stt_enabled=False))
    assert not llm_switch.has_provider_overrides()
    assert llm_switch.get_judge().__name__ == 'app.judge.openrouter'
    assert llm_switch.get_ai().__name__ == 'app.ai.openrouter'


def test_no_key_preserves_file_and_crm_import_without_spawning_failed_ai_jobs(tmp_path, monkeypatch, dev_payload):
    async def forbidden(*args, **kwargs):
        pytest.fail('No HTTP provider call is allowed without credentials')

    async def crm(request, group_id):
        assert group_id == 'DEV'
        return dev_payload

    monkeypatch.setattr(httpx.AsyncClient, 'send', forbidden)
    monkeypatch.setattr('app.conversations.fetch_dataset', crm)
    settings = Settings(db_path=tmp_path / 'no-key.sqlite', openrouter_api_key='', judge_model='test/model',
                        ai_model='test/model', stt_enabled=True, auto_summarize=True, auto_evaluate_imports=True)
    with TestClient(create_runtime_app(settings)) as client:
        assert not llm_switch.has_provider_overrides()
        assert client.get('/api/health').json()['modelOnline'] is False
        result = client.post('/api/source/sync', json={})
        assert result.status_code == 200, result.text
        receipt = result.json()
        assert receipt['imported'] == 65
        assert receipt['evaluationJob'] is None and receipt['sttQueued'] == 0
        assert set(receipt['processingUnavailable']['features']) == {'evaluation', 'summary', 'transcription'}
        assert client.get('/api/conversations').json()['counts']['all'] == 65
        assert client.get('/api/jobs?status=active').json() == {'items': []}
        assert client.app.state.db.all_evaluations() == []
        assert client.app.state.stt.jobs()['total'] == 0

        uploaded = copy.deepcopy(dev_payload['data']['records'][0])
        uploaded['conversation_id'] = 'file-without-ai-key'
        response = client.post('/api/conversations/upload', json=[uploaded])
        assert response.status_code == 200 and response.json()['imported'] == 1
        assert client.get('/api/conversations/file-without-ai-key').status_code == 200
        assert client.get('/api/checklists').status_code == 200
        assert client.app.state.db.all_evaluations() == []
        manual = [
            ('post', '/api/evaluations', {'conversationIds': ['p1-ru-001'], 'checklistId': 'cl_1'}),
            ('get', '/api/conversations/p1-ru-001/summary', None),
            ('get', '/api/conversations/p1-ru-001/summary?stream=true', None),
            ('get', '/api/conversations/p1-ru-001/translation?targetLanguage=EN', None),
            ('post', '/api/conversations/p4-ru-001/transcription/retry', {}),
        ]
        for method, path, body in manual:
            response = client.get(path) if method == 'get' else client.post(path, json=body)
            assert response.status_code == 503, (path, response.text)
        assert client.app.state.db.all_evaluations() == []
        assert client.app.state.stt.jobs()['total'] == 0
    with TestClient(create_runtime_app(settings)) as restarted:
        assert restarted.get('/api/conversations').json()['counts']['all'] == 66
        assert restarted.get('/api/jobs?status=active').json() == {'items': []}


def test_active_job_discovery_is_read_only_scoped_and_disappears_after_completion(seeded_client, monkeypatch):
    evaluation, = evaluate(seeded_client)
    db = seeded_client.app.state.db
    record = db.get_evaluation(evaluation['id'])
    record['status'] = 'running'
    record['_judgeIdentity'] = 'openrouter:test-active'
    record['model'] = 'provider/real'
    for item in record['items']:
        item['model'] = 'provider/real'
    db.save_evaluation(record)
    job = next(j for j in db.all_jobs() if any(i['evaluationId'] == record['id'] for i in j['items']))
    job.update(status='running', done=0, failed=0)
    job['items'][0]['status'] = 'running'
    db.save_job(job)
    original_job = copy.deepcopy(job)
    original_evaluation = copy.deepcopy(record)
    use_runtime_providers(seeded_client.app.state.settings)
    for _ in range(2):
        response = seeded_client.get('/api/jobs?status=active')
        assert response.status_code == 200
        item, = response.json()['items']
        assert item == {**job, 'checklistId': 'cl_1', 'checklistVersion': 1}
    assert db.get_job(job['id']) == original_job
    assert db.get_evaluation(record['id']) == original_evaluation
    assert seeded_client.get('/api/jobs?status=all').status_code == 400

    # Mixed/unknown provenance never becomes globally advertised progress.
    record['items'][0]['model'] = None
    db.save_evaluation(record)
    assert seeded_client.get('/api/jobs?status=active').json() == {'items': []}
    record['items'][0]['model'] = 'provider/real'
    db.save_evaluation(record)
    job.update(status='done', done=1)
    db.save_job(job)
    assert seeded_client.get('/api/jobs?status=active').json() == {'items': []}
