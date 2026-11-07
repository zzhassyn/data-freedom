import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from tests.test_foundation import record


@pytest.mark.parametrize('content_type', [None, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/csv', 'application/jsonp'])
def test_form_upload_cannot_write(client, content_type):
    headers = {'Content-Type': content_type} if content_type else {}
    response = client.post('/api/conversations/upload', content='[]', headers=headers)
    assert response.status_code == 415
    assert response.json()['error']['code'] == 'unsupported_media_type'
    assert client.get('/api/conversations').json()['items'] == []


@pytest.mark.parametrize('method', ['POST', 'PUT', 'PATCH', 'DELETE'])
@pytest.mark.parametrize('headers', [
    {'Origin': 'https://evil.example'}, {'Origin': 'null'},
    {'Origin': 'http://localhost.evil.example:8000'}, {'Origin': 'http://127.0.0.1.evil.example'},
    {'Origin': 'http://localhost@evil.example'}, {'Origin': 'http://evil@localhost'},
    {'Origin': 'https://localhost:5500'}, {'Origin': 'http://localhost:8000/path'},
    {'Origin': 'http://localhost:bad'}, {'Origin': ''},
    {'Sec-Fetch-Site': 'cross-site'}, {'Sec-Fetch-Site': 'same-site'},
    {'Sec-Fetch-Site': 'none'}, {'Sec-Fetch-Site': 'unknown'},
    {'Origin': 'https://evil.example', 'Sec-Fetch-Site': 'same-origin'},
])
def test_untrusted_request_is_rejected_before_routing(client, method, headers):
    result = client.request(method, '/api/source', json={'groupId': 'ATTACK'}, headers=headers)
    assert result.status_code == 403
    assert result.json() == {'error': {'code': 'forbidden_origin', 'message': 'Запрос отклонён: чужой источник'}}
    assert client.get('/api/source').json()['groupId'] == 'DEV'


@pytest.mark.parametrize('headers', [
    {}, {'Origin': 'http://testserver'}, {'Sec-Fetch-Site': 'same-origin'},
    {'Origin': 'http://localhost:5500', 'Sec-Fetch-Site': 'cross-site'},
    {'Origin': 'http://127.0.0.1:8001', 'Sec-Fetch-Site': 'same-site'},
    {'Origin': 'http://LOCALHOST:5500'},
])
def test_trusted_json_upload_and_source_work(client, headers):
    result = client.post('/api/conversations/upload', json=[record()], headers=headers)
    assert result.status_code == 200, result.text
    assert result.json()['imported'] == 1
    assert client.put('/api/source', json={'groupId': 'CTRL-1'}, headers=headers).status_code == 200


def test_same_origin_on_nonlocal_host(client):
    with TestClient(create_app(client.app.state.settings), base_url='https://quality.example') as remote:
        assert remote.put('/api/source', json={'groupId': 'CTRL'}, headers={'Origin': 'https://quality.example:443', 'Sec-Fetch-Site': 'same-origin'}).status_code == 200
        assert remote.put('/api/source', json={'groupId': 'ATTACK'}, headers={'Origin': 'https://quality.example:444'}).status_code == 403


def test_csv_is_only_allowed_for_gold_and_checks_origin(seeded_client):
    content = 'conversation_id,criterion_id,answer,note\np1-ru-001,contact,yes,\n'
    headers = {'Content-Type': 'text/csv; charset=utf-8', 'Origin': 'http://localhost:8000'}
    assert seeded_client.post('/api/gold', content=content, headers=headers).status_code == 200
    assert seeded_client.post('/api/gold', content=content, headers={**headers, 'Origin': 'https://evil.example'}).status_code == 403
    assert seeded_client.post('/api/gold', json={}).status_code == 415
    assert seeded_client.post('/api/conversations/upload', content=content, headers=headers).status_code == 415


def test_bodyless_mutation_still_requires_json_and_safe_methods_work(client):
    assert client.post('/api/source/sync').status_code == 415
    assert client.get('/api/health').status_code == 200
    assert client.options('/api/source', headers={'Origin': 'http://localhost:5500', 'Access-Control-Request-Method': 'PUT'}).status_code == 200
    assert client.put('/api/source', content='{"groupId":"DEV"}', headers={'Content-Type': 'Application/JSON; charset=utf-8'}).status_code == 200


def test_duplicate_origin_or_content_type_headers_rejected(client):
    assert client.put('/api/source', content='{}', headers=[('Origin', 'http://localhost:8000'), ('Origin', 'https://evil.example'), ('Content-Type', 'application/json')]).status_code == 403
    assert client.put('/api/source', content='{}', headers=[('Content-Type', 'application/json'), ('Content-Type', 'text/plain')]).status_code == 415
