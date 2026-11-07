"""Foundation contract through HTTP, including organizer and audio boundaries."""
from copy import deepcopy
import socket

import httpx
import pytest

from app import conversations
from app import audio_security
from app.models import Conversation, Evaluation
from tests.helpers import evaluate


def record(id='test-1', *, channel='agent chat', language='RU', turns=None, audio=None):
    return {'conversation_id': id, 'channel': channel, 'language': language,
            'audio_url': audio, 'transcript': turns or [
                {'timestamp': '00:05', 'speaker': 'client', 'text': 'Где найти отчёт?'},
                {'timestamp': '00:08', 'speaker': 'operator', 'text': 'Откройте раздел отчётов.'},
            ]}


def error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {'error'}
    assert set(body['error']) == {'code', 'message'}
    assert body['error']['code'] == code
    assert body['error']['message']
    return body['error']['message']


def import_work(new_ids, existing_ids):
    return {'newConversationIds': new_ids, 'existingConversationIds': existing_ids,
            'sttQueued': 0, 'sttConversationIds': [], 'evaluationJob': None}


def install_transport(monkeypatch, handler):
    actual_client = httpx.AsyncClient
    opened = []

    def factory(*args, **kwargs):
        client = actual_client(*args, transport=httpx.MockTransport(handler), **kwargs)
        opened.append(client)
        return client

    monkeypatch.setattr(conversations.httpx, 'AsyncClient', factory)
    return opened


@pytest.fixture
def public_audio_dns(monkeypatch):
    monkeypatch.setattr(audio_security.socket, 'getaddrinfo', lambda host, port, **kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, '', ('93.184.216.34', port))])


def test_dev_upload_is_idempotent_and_public_conversation_matches_contract(client, dev_payload):
    first = client.post('/api/conversations/upload', json=dev_payload)
    ids = [r['conversation_id'] for r in dev_payload['data']['records']]
    assert first.json() == {'groupId': 'UPLOAD', 'imported': 65, 'updated': 0, 'unchanged': 0,
                            'total': 65, 'audioRejected': 0, **import_work(ids, [])}
    before = client.get('/api/conversations/p4-ru-001').json()
    second = client.post('/api/conversations/upload', json=dev_payload)
    assert second.json() == {'groupId': 'UPLOAD', 'imported': 0, 'updated': 0, 'unchanged': 65,
                             'total': 65, 'audioRejected': 0, **import_work([], ids)}
    after = client.get('/api/conversations/p4-ru-001').json()
    assert before == after
    Conversation.model_validate(after)
    assert set(after) == {'id', 'number', 'startedAt', 'datasetGroupId', 'channel', 'language', 'audioUrl', 'transcript', 'importedAt'}
    raw = next(r for r in dev_payload['data']['records'] if r['conversation_id'] == after['id'])
    assert [turn['idx'] for turn in after['transcript']] == list(range(len(raw['transcript'])))
    assert [turn['timestamp'] for turn in after['transcript']] == [turn['timestamp'] for turn in raw['transcript']]
    assert after['transcript'][0]['tSec'] == 0
    assert after['importedAt'].endswith('Z')
    assert all(set(turn) == {'idx', 'timestamp', 'tSec', 'speaker', 'text'} for turn in after['transcript'])


def test_turn_indexes_duplicates_and_seven_digit_iso_timestamps_are_preserved(client):
    chat = record(turns=[
        {'timestamp': '02:05', 'speaker': 'client', 'text': 'Вопрос'},
        {'timestamp': '02:07', 'speaker': 'bot', 'text': 'Добрый день'},
        {'timestamp': '02:07', 'speaker': 'bot', 'text': 'Добрый день'},
        {'timestamp': '02:08', 'speaker': 'system', 'text': 'Передано оператору'},
        {'timestamp': '02:09', 'speaker': 'operator', 'text': 'Ответ'},
    ])
    call = record('call-1', channel='voice call', audio='https://player.dynamics.com/player', turns=[
        {'timestamp': '2026-11-03T13:10:00.6388245+00:00', 'speaker': 'system', 'text': 'Начало'},
        {'timestamp': '2026-11-03T18:10:01.8888249+05:00', 'speaker': 'operator', 'text': 'Ответ'},
    ])
    response = client.post('/api/conversations/upload', json=[chat, call])
    assert response.json() == {'groupId': 'UPLOAD', 'imported': 2, 'updated': 0, 'unchanged': 0,
                               'total': 2, 'audioRejected': 0, **import_work(['test-1', 'call-1'], [])}
    actual = client.get('/api/conversations/test-1').json()['transcript']
    assert [turn['tSec'] for turn in actual] == [0, 2, 2, 3, 4]
    assert [turn['idx'] for turn in actual] == [0, 1, 2, 3, 4]
    assert actual[1]['text'] == actual[2]['text']
    actual_call = client.get('/api/conversations/call-1').json()['transcript']
    assert actual_call[1]['timestamp'] == call['transcript'][1]['timestamp']
    assert actual_call[1]['tSec'] == 1.25


@pytest.mark.parametrize('field,value', [
    ('conversation_id', None), ('transcript', 'не массив'), ('channel', 'email'),
    ('channel', {}), ('language', []),
    ('language', 'DE'), ('audio_url', {}),
])
def test_invalid_record_is_rejected_before_any_rows_are_written(client, field, value):
    good, invalid = record('good'), record('bad')
    invalid[field] = value
    message = error(client.post('/api/conversations/upload', json=[good, invalid]), 400, 'invalid_transcript')
    assert 'Запись 2' in message and field in message
    assert client.get('/api/conversations').json()['counts']['all'] == 0


@pytest.mark.parametrize('field,value', [('speaker', 'agent'), ('speaker', []), ('text', '  '), ('timestamp', '00:99')])
def test_invalid_turn_identifies_record_and_field(client, field, value):
    invalid = record()
    invalid['transcript'][1][field] = value
    message = error(client.post('/api/conversations/upload', json=[invalid]), 400, 'invalid_transcript')
    assert 'Запись 1' in message and 'реплики 2' in message
    assert client.get('/api/conversations').json()['items'] == []


def test_duplicate_record_ids_and_malformed_json_are_contract_errors(client):
    error(client.post('/api/conversations/upload', json=[record(), record()]), 400, 'invalid_transcript')
    error(client.post('/api/conversations/upload', content='{broken', headers={'Content-Type': 'application/json'}), 400, 'invalid_json')
    error(client.get('/api/conversations/not-existing'), 404, 'not_found')
    error(client.get('/api/not-existing'), 404, 'not_found')


def test_registry_filters_search_and_first_client_preview(seeded_client):
    full = seeded_client.get('/api/conversations').json()
    assert full['counts'] == {'all': 65, 'evaluated': 0, 'running': 0, 'appealsOpen': 0}
    assert len(full['items']) == 65
    assert all(row['lastEvaluation'] is None for row in full['items'])
    assert len(seeded_client.get('/api/conversations', params={'language': 'KZ'}).json()['items']) == 15
    assert len(seeded_client.get('/api/conversations', params={'language': 'EN'}).json()['items']) == 15
    assert len(seeded_client.get('/api/conversations', params={'channel': 'voice call'}).json()['items']) == 5
    assert len(seeded_client.get('/api/conversations', params={'language': 'RU', 'channel': 'agent chat', 'groupId': 'UPLOAD'}).json()['items']) == 30
    assert seeded_client.get('/api/conversations', params={'groupId': 'other'}).json()['items'] == []
    assert len(seeded_client.get('/api/conversations', params={'status': 'new'}).json()['items']) == 65
    found = seeded_client.get('/api/conversations', params={'q': 'P1-RU-001'}).json()['items']
    assert [r['id'] for r in found] == ['p1-ru-001']
    conversation = seeded_client.get('/api/conversations/p1-ru-001').json()
    client_text = next(t['text'] for t in conversation['transcript'] if t['speaker'] == 'client')
    assert found[0]['preview'] == client_text[:140]
    assert found[0]['durationSec'] == conversation['transcript'][-1]['tSec']
    assert 'p1-ru-001' in {r['id'] for r in seeded_client.get('/api/conversations', params={'q': client_text.upper()}).json()['items']}
    error(seeded_client.get('/api/conversations', params={'status': 'invented'}), 400, 'invalid_filter')


def test_stale_evaluation_is_retained_but_not_listed_as_current_done(seeded_client, dev_payload):
    first = evaluate(seeded_client)[0]
    second = evaluate(seeded_client, reuse=True)[0]
    done = seeded_client.get('/api/conversations', params={'status': 'done'}).json()
    assert [r['id'] for r in done['items']] == ['p1-ru-001']
    last = done['items'][0]['lastEvaluation']
    assert last['id'] == second['id']
    assert last['ribbon'] == [{k: i[k] for k in ('criterionId', 'answer', 'fraction', 'effectiveWeight')} for i in second['items']]
    raw = deepcopy(next(r for r in dev_payload['data']['records'] if r['conversation_id'] == 'p1-ru-001'))
    raw['transcript'][0]['text'] += ' Дополнительный вопрос.'
    changed = seeded_client.post('/api/conversations/upload', json=[raw])
    assert changed.json() == {'groupId': 'UPLOAD', 'imported': 0, 'updated': 1, 'unchanged': 0,
                              'total': 65, 'audioRejected': 0, **import_work([], ['p1-ru-001'])}
    stale = seeded_client.get('/api/conversations', params={'status': 'stale'}).json()['items']
    assert [r['id'] for r in stale] == ['p1-ru-001']
    assert stale[0]['lastEvaluation']['status'] == 'stale'
    assert seeded_client.get('/api/conversations', params={'status': 'done'}).json()['items'] == []
    history = seeded_client.get('/api/conversations/p1-ru-001/evaluations').json()['items']
    assert [ev['id'] for ev in history] == [second['id'], first['id']]
    for evaluation in history:
        Evaluation.model_validate(evaluation)
        assert not any(key.startswith('_') for key in evaluation)
    assert seeded_client.get('/api/stats').json()['evaluated'] == 0


def test_live_import_adapter_encodes_group_and_retries_once(client, dev_payload, monkeypatch):
    requests = []
    client.app.state.settings.org_api_url = 'https://organizer.test/data?sig=test-signature&sp=%2Ftriggers%2Fmanual%2Frun'

    def upstream(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503)
        return httpx.Response(200, json=dev_payload)

    opened = install_transport(monkeypatch, upstream)
    response = client.post('/api/datasets/import', json={'groupId': 'DEV & контроль'})
    assert response.status_code == 200, response.text
    ids = [r['conversation_id'] for r in dev_payload['data']['records']]
    assert response.json() == {'groupId': 'DEV & контроль', 'imported': 65, 'updated': 0, 'unchanged': 0,
                               'total': 65, 'audioRejected': 0, **import_work(ids, [])}
    assert len(requests) == 2
    assert requests[-1].url.params['group_id'] == 'DEV & контроль'
    assert requests[-1].url.params['sig'] == 'test-signature'
    assert requests[-1].url.params['sp'] == '/triggers/manual/run'
    assert all(c.is_closed for c in opened)


def test_organizer_bad_group_and_exhausted_failure_are_distinct(client, monkeypatch):
    requests = []
    fail = {'network': False}

    def upstream(request):
        requests.append(request)
        if fail['network']:
            raise httpx.ConnectError('private transport detail', request=request)
        return httpx.Response(200, json={'isSuccess': False, 'error': 'Набор не существует'})

    install_transport(monkeypatch, upstream)
    message = error(client.post('/api/datasets/import', json={'groupId': 'missing'}), 400, 'bad_group')
    assert message == 'Набор не существует'
    assert len(requests) == 1
    fail['network'] = True
    message = error(client.post('/api/datasets/import', json={'groupId': 'DEV'}), 502, 'upstream_failed')
    assert 'private transport detail' not in message
    assert len(requests) == 3
    assert client.get('/api/conversations').json()['counts']['all'] == 0


class AudioChunks(httpx.AsyncByteStream):
    def __init__(self, content):
        self.content = content
        self.closed = False

    async def __aiter__(self):
        yield self.content[:300]
        yield self.content[300:]

    async def aclose(self):
        self.closed = True


def test_audio_refreshes_player_url_and_streams_range_with_headers(client, monkeypatch, public_audio_dns):
    client.post('/api/conversations/upload', json=[record('call', channel='voice call', audio='https://player.environment.api.powerplatform.com/player')])
    requests, streams = [], []
    page_count = {'value': 0}
    audio_bytes = b'ID3' + bytes(range(256)) * 4
    selected = audio_bytes[:1024]

    def upstream(request):
        requests.append(request)
        if request.url.path == '/player':
            page_count['value'] += 1
            return httpx.Response(200, text=f'<audio><source src="https://media.dynamics.com/file.mp3?signature={page_count["value"]}&amp;rsct=audio%2Fmpeg" type="audio/mpeg"></audio>')
        assert request.headers['range'] == 'bytes=0-1023'
        assert request.headers['accept-encoding'] == 'identity'
        assert request.url.params['rsct'] == 'audio/mpeg'
        assert 'amp;rsct' not in request.url.params
        stream = AudioChunks(selected)
        streams.append(stream)
        return httpx.Response(206, headers={'Content-Range': f'bytes 0-1023/{len(audio_bytes)}', 'Content-Length': '1024', 'Accept-Ranges': 'bytes'}, stream=stream)

    opened = install_transport(monkeypatch, upstream)
    for _ in range(2):
        response = client.get('/api/conversations/call/audio', headers={'Range': 'bytes=0-1023'})
        assert response.status_code == 206
        assert response.content == selected
        assert response.headers['content-type'] == 'audio/mpeg'
        assert response.headers['content-range'] == f'bytes 0-1023/{len(audio_bytes)}'
        assert response.headers['content-length'] == '1024'
        assert response.headers['accept-ranges'] == 'bytes'
    assert page_count['value'] == 2
    assert [r.url.params['signature'] for r in requests if r.headers['host'] == 'media.dynamics.com'] == ['1', '2']
    assert all(r.url.host == '93.184.216.34' for r in requests)
    assert all(r.extensions['sni_hostname'] == r.headers['host'] for r in requests)
    assert all(stream.closed for stream in streams)
    assert all(c.is_closed for c in opened)


@pytest.mark.parametrize('page_status,page_content,mp3_status', [
    (503, '', 200), (200, '<html>Плеер без записи</html>', 200),
    (200, '<source src="https://media.dynamics.com/file.mp3" type="audio/mpeg">', 403),
])
def test_audio_upstream_errors_are_safe_and_clients_close(client, monkeypatch, public_audio_dns, page_status, page_content, mp3_status):
    client.post('/api/conversations/upload', json=[record('call', channel='voice call', audio='https://player.environment.api.powerplatform.com/player'), record('chat')])

    def upstream(request):
        if request.url.path == '/player':
            return httpx.Response(page_status, text=page_content)
        return httpx.Response(mp3_status)

    opened = install_transport(monkeypatch, upstream)
    error(client.get('/api/conversations/chat/audio'), 404, 'no_audio')
    assert opened == []
    message = error(client.get('/api/conversations/call/audio'), 502, 'upstream_failed')
    assert 'https://' not in message
    assert all(c.is_closed for c in opened)


def test_static_entry_assets_and_localhost_cors(client):
    response = client.get('/')
    assert response.status_code == 200
    assert '<html lang="ru">' in response.text
    assert 'DataAvengers' in response.text
    for asset in ('/styles/tokens.css', '/js/core.js', '/data/mock-evaluations.js'):
        result = client.get(asset)
        assert result.status_code == 200 and result.content
    response = client.options('/api/conversations', headers={'Origin': 'http://localhost:4173', 'Access-Control-Request-Method': 'GET'})
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'http://localhost:4173'
    denied = client.get('/api/conversations', headers={'Origin': 'https://example.test'})
    assert 'access-control-allow-origin' not in denied.headers
