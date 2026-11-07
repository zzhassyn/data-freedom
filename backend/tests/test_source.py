"""Persistent CRM configuration, atomic sync receipts and measured stream progress."""
from copy import deepcopy
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_app
from tests.helpers import evaluate
from tests.test_foundation import install_transport


def test_source_defaults_validation_and_persistence(client):
    assert client.get('/api/source').json() == dict(groupId='DEV', lastSyncAt=None, lastResult=None)
    for body in ({}, [], {'groupId': ''}, {'groupId': '  '}, {'groupId': 12}, {'groupId': 'a' * 101}):
        assert client.put('/api/source', json=body).status_code == 400
    assert client.put('/api/source', json={'groupId': ' CTRL-1 '}).json() == {'groupId': 'CTRL-1'}
    with TestClient(create_app(client.app.state.settings)) as restarted:
        assert restarted.get('/api/source').json() == dict(groupId='CTRL-1', lastSyncAt=None, lastResult=None)


def test_sync_fetches_fresh_data_and_preserves_stale_history(client, dev_payload, monkeypatch):
    payload = deepcopy(dev_payload)
    requests = []
    def upstream(request):
        requests.append(request)
        return httpx.Response(200, json=payload)
    install_transport(monkeypatch, upstream)
    first = client.post('/api/source/sync', json={})
    assert first.status_code == 200, first.text
    result = first.json()
    assert set(result) == {'imported', 'updated', 'unchanged', 'total', 'lastSyncAt',
                           'newConversationIds', 'existingConversationIds', 'sttQueued', 'sttConversationIds', 'evaluationJob'}
    assert (result['imported'], result['updated'], result['unchanged'], result['total']) == (65, 0, 0, 65)
    ev = evaluate(client)[0]
    before = client.get('/api/conversations/p1-ru-001').json()
    second = client.post('/api/source/sync', json={}).json()
    assert (second['imported'], second['updated'], second['unchanged'], second['total']) == (0, 0, 65, 65)
    assert client.get('/api/conversations/p1-ru-001').json() == before
    record = next(r for r in payload['data']['records'] if r['conversation_id'] == 'p1-ru-001')
    record['transcript'][0]['text'] += ' Уточняю вопрос.'
    new = deepcopy(record)
    new['conversation_id'] = 'new-from-crm'
    payload['data']['records'].append(new)
    payload['data']['total_records'] = len(payload['data']['records'])
    third = client.post('/api/source/sync', json={}).json()
    assert (third['imported'], third['updated'], third['unchanged'], third['total']) == (1, 1, 64, 66)
    assert client.get('/api/conversations').json()['counts']['all'] == 66
    stale = client.get('/api/conversations?status=stale').json()['items']
    assert [r['id'] for r in stale] == ['p1-ru-001']
    assert stale[0]['lastEvaluation']['id'] == ev['id']
    assert client.get('/api/conversations/p1-ru-001/evaluations').json()['items'][0]['id'] == ev['id']
    assert client.get('/api/conversations/p1-ru-001').json()['transcript'][0]['text'] == record['transcript'][0]['text']
    source = client.get('/api/source').json()
    assert source == dict(groupId='DEV', lastSyncAt=third['lastSyncAt'], lastResult=dict(imported=1, updated=1, unchanged=64))
    assert len(requests) == 3
    assert all(r.url.params['group_id'] == 'DEV' for r in requests)
    with TestClient(create_app(client.app.state.settings)) as restarted:
        assert restarted.get('/api/source').json() == source
        assert restarted.get('/api/conversations').json()['counts']['all'] == 66


def test_sync_uses_saved_group_and_reset_receipt_only_when_group_changes(client, dev_payload, monkeypatch):
    seen = []
    def upstream(request):
        seen.append(request.url.params['group_id'])
        payload = deepcopy(dev_payload)
        payload['data']['dataset_group_id'] = request.url.params['group_id']
        return httpx.Response(200, json=payload)
    install_transport(monkeypatch, upstream)
    client.put('/api/source', json={'groupId': 'CTRL & 1'})
    assert client.post('/api/source/sync', json={}).json()['imported'] == 65
    assert seen == ['CTRL & 1']
    source = client.get('/api/source').json()
    client.put('/api/source', json={'groupId': 'CTRL & 1'})
    assert client.get('/api/source').json() == source
    client.put('/api/source', json={'groupId': 'DEV'})
    assert client.get('/api/source').json() == dict(groupId='DEV', lastSyncAt=None, lastResult=None)
    assert client.post('/api/source/sync', json={}).json()['unchanged'] == 65
    assert client.get('/api/conversations').json()['counts']['all'] == 65


@pytest.mark.parametrize('stream', [False, True])
def test_failed_sync_keeps_last_success_and_records(client, dev_payload, monkeypatch, stream):
    mode = {'value': 'ok'}
    def upstream(request):
        if mode['value'] == 'missing':
            return httpx.Response(200, json={'isSuccess': False, 'error': 'secret upstream diagnostic'})
        if mode['value'] == 'network':
            raise httpx.ConnectError('secret connection detail', request=request)
        if mode['value'] == 'invalid':
            return httpx.Response(200, json={'data': {'records': [dev_payload['data']['records'][0], {'conversation_id': 'broken'}]}})
        return httpx.Response(200, json=dev_payload)
    install_transport(monkeypatch, upstream)
    client.post('/api/source/sync', json={})
    before = client.get('/api/source').json()
    for failure in ('missing', 'network', 'invalid'):
        mode['value'] = failure
        response = client.post('/api/source/sync', headers={'Accept': 'application/x-ndjson'} if stream else {}, json={})
        if stream:
            error = json.loads(response.text.splitlines()[-1])
            assert error['stage'] == 'error'
        else:
            assert response.status_code in (400, 502)
            error = response.json()
        assert error['error']['message'] == 'CRM не ответила. Попробуйте ещё раз через минуту'
        assert client.get('/api/source').json() == before
        assert client.get('/api/conversations').json()['counts']['all'] == 65


def test_stream_reports_processed_records_and_committed_receipt(client, dev_payload, monkeypatch):
    install_transport(monkeypatch, lambda request: httpx.Response(200, json=dev_payload))
    response = client.post('/api/source/sync', headers={'Accept': 'application/x-ndjson'}, json={})
    assert response.headers['content-type'].startswith('application/x-ndjson')
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[0] == {'stage': 'fetching'}
    progress = [e for e in events if e['stage'] == 'importing']
    assert [e['processed'] for e in progress] == list(range(66))
    assert all(e['total'] == 65 for e in progress)
    assert events[-1]['stage'] == 'done'
    assert events[-1]['result']['imported'] == 65
    assert client.get('/api/source').json()['lastSyncAt'] == events[-1]['result']['lastSyncAt']
    assert client.post('/api/source/sync', json={}).json()['unchanged'] == 65


def test_empty_group_has_zero_counts(client, monkeypatch):
    install_transport(monkeypatch, lambda request: httpx.Response(200, json={'data': {'records': []}}))
    result = client.post('/api/source/sync', json={}).json()
    assert {k: result[k] for k in ('imported', 'updated', 'unchanged', 'total')} == dict(imported=0, updated=0, unchanged=0, total=0)
