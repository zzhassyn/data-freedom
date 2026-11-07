"""Health reports provider reachability without billing AI extras as evaluations."""
import json
from types import SimpleNamespace

import httpx
import pytest

from app import llm_switch
from tests.helpers import evaluate


def install_provider(client, monkeypatch, handler):
    settings = client.app.state.settings
    settings.llm_base_url = 'https://model.example/v1/'
    settings.llm_api_key = 'unit-test-key'
    settings.llm_model = 'unit-test-model'
    monkeypatch.setattr(llm_switch, 'get_judge', lambda: SimpleNamespace(IS_FAKE=False))
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def test_fake_health_has_contract_shape_and_does_not_require_credentials(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    body = response.json()
    assert {'ok', 'model', 'modelOnline', 'avgCriterionMs', 'avgEvaluationCostUsd'} <= body.keys()
    assert body['ok'] is True and body['modelOnline'] is True
    assert body['model'] == 'fake'
    assert body['avgCriterionMs'] == body['avgEvaluationCostUsd'] == 0


def test_real_import_failure_runs_fake_but_health_reports_unavailable(client, monkeypatch):
    original_import = llm_switch.importlib.import_module

    def failing_import(name):
        if name == 'app.judge':
            raise ImportError('Unit-test unavailable provider dependency')
        return original_import(name)

    monkeypatch.setenv('JUDGE', 'real')
    monkeypatch.setattr(llm_switch.importlib, 'import_module', failing_import)
    body = client.get('/api/health').json()
    assert body['ok'] is True
    assert body['model'] == 'fake'
    assert body['modelOnline'] is False
    assert callable(llm_switch.get_judge().judge)


def test_provider_health_uses_three_second_timeout_and_twenty_second_cache(client, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        assert str(request.url) == 'https://model.example/v1/chat/completions'
        assert request.headers['authorization'] == 'Bearer unit-test-key'
        assert request.extensions['timeout'] == {'connect': 3, 'read': 3, 'write': 3, 'pool': 3}
        assert json.loads(request.content)['model'] == 'unit-test-model'
        return httpx.Response(200, json={'choices': [{'message': {'content': 'OK'}}]})

    install_provider(client, monkeypatch, handler)
    first = client.get('/api/health').json()
    second = client.get('/api/health').json()
    assert first == second
    assert first['modelOnline'] is True and first['model'] == 'unit-test-model'
    assert len(calls) == 1
    client.app.state.health_cache['at'] -= 21
    assert client.get('/api/health').json()['modelOnline'] is True
    assert len(calls) == 2


@pytest.mark.parametrize('failure', ['timeout', 'http_error', 'invalid_json', 'no_choices', 'non_object'])
def test_provider_failure_does_not_make_application_unhealthy(client, monkeypatch, failure):
    calls = []

    def handler(request):
        calls.append(request)
        if failure == 'timeout':
            raise httpx.ReadTimeout('Unit-test timed out', request=request)
        if failure == 'http_error':
            return httpx.Response(429, json={'error': 'quota exhausted'})
        if failure == 'invalid_json':
            return httpx.Response(200, text='<html>Unavailable</html>')
        if failure == 'no_choices':
            return httpx.Response(200, json={})
        return httpx.Response(200, json=[])

    install_provider(client, monkeypatch, handler)
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['ok'] is True
    assert response.json()['modelOnline'] is False
    assert client.get('/api/health').json()['modelOnline'] is False
    assert len(calls) == 1


def test_missing_real_credentials_reports_offline_without_network(client, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError('No HTTP request should be attempted without provider credentials')

    monkeypatch.setattr(llm_switch, 'get_judge', lambda: SimpleNamespace(IS_FAKE=False))
    monkeypatch.setattr(httpx, 'AsyncClient', forbidden)
    client.app.state.settings.llm_api_key = ''
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['modelOnline'] is False


def test_health_averages_evaluation_cost_separately_from_ai_extras(seeded_client):
    evaluation = evaluate(seeded_client)[0]
    evaluation['usage']['costUsd'] = 0.016
    db = seeded_client.app.state.db
    db.save_evaluation(evaluation)
    db.record_usage({'inputTokens': 500, 'outputTokens': 200, 'costUsd': 0.025, 'calls': 1}, latency_ms=8000, kind='extra')
    response = seeded_client.get('/api/health')
    assert response.status_code == 200
    body = response.json()
    assert body['avgEvaluationCostUsd'] == pytest.approx(0.016)
    assert body['totalCostUsd'] >= 0.025
    assert body['avgCriterionMs'] < 8000
