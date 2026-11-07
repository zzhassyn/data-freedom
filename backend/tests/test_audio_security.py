"""No unchecked URL, redirect or DNS answer may become an audio connection."""
import socket

import httpx
import pytest

from app import audio_security
from app.settings import AUDIO_ALLOWED_HOSTS, Settings
from tests.test_foundation import AudioChunks, error, install_transport, record


PLAYER = 'https://player.environment.api.powerplatform.com/player'
MEDIA = 'https://media.dynamics.com/file.mp3'
PUBLIC_IP = '93.184.216.34'


def mock_dns(monkeypatch, addresses=None):
    calls = []
    def resolve(host, port, **kwargs):
        calls.append(host)
        result = addresses(host) if callable(addresses) else addresses or [PUBLIC_IP]
        return [(socket.AF_INET6 if ':' in ip else socket.AF_INET, socket.SOCK_STREAM,
                 socket.IPPROTO_TCP, '', (ip, port)) for ip in result]
    monkeypatch.setattr(audio_security.socket, 'getaddrinfo', resolve)
    return calls


def saved_call(client, url=PLAYER):
    result = client.post('/api/conversations/upload', json=[record('call', channel='voice call', audio=url)])
    assert result.status_code == 200, result.text
    return result.json()


@pytest.mark.parametrize('url', [
    'https://dynamics.com/player', 'https://MEDIA.DYNAMICS.COM./file.mp3',
    'https://environment.api.powerplatform.com/player', PLAYER,
])
def test_allowed_host_uses_exact_or_dot_suffix_matching(url):
    host, port = audio_security.audio_destination(url, AUDIO_ALLOWED_HOSTS)
    assert host == host.lower().rstrip('.') and port == 443


@pytest.mark.parametrize('url', [
    'https://evil.example/player', 'http://127.0.0.1/', 'https://127.0.0.1/',
    'https://dynamics.com.evil.example/', 'https://evildynamics.com/',
    'https://dynamics.com@evil.example/', 'https://evil.example@dynamics.com/',
    'http://media.dynamics.com/file.mp3', 'file:///private.mp3',
    'https://media.dynamics.com:bad/file.mp3', 'https://media.dynamics.com/\nfile.mp3',
])
def test_upload_clears_rejected_audio_and_proxy_never_accesses_network(client, monkeypatch, url):
    dns_calls = mock_dns(monkeypatch)
    requests = []
    install_transport(monkeypatch, lambda request: requests.append(request))
    result = saved_call(client, url)
    assert result['audioRejected'] == 1
    assert client.app.state.db.get_conversation('call')['audioUrl'] is None
    error(client.get('/api/conversations/call/audio'), 404, 'no_audio')
    assert dns_calls == [] and requests == []


@pytest.mark.parametrize('url', ['https://evil.example/', 'http://127.0.0.1/'])
def test_proxy_rejects_legacy_unsafe_urls_already_stored(client, monkeypatch, url):
    saved_call(client)
    stored = client.app.state.db.get_conversation('call')
    stored['audioUrl'] = url
    client.app.state.db.save_conversation(stored)
    dns_calls = mock_dns(monkeypatch)
    requests = []
    opened = install_transport(monkeypatch, lambda request: requests.append(request))
    error(client.get('/api/conversations/call/audio'), 502, 'upstream_failed')
    assert dns_calls == [] and requests == []
    assert all(client.is_closed for client in opened)


@pytest.mark.parametrize('address', [
    '10.0.0.5', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254',
    'fc00::1', 'fd00::1', '::1', 'fe80::1', '224.0.0.1', 'ff02::1',
    '0.0.0.0', '::', '240.0.0.1', '2001:db8::1', '::ffff:10.0.0.5', '100.64.0.1',
])
def test_every_dns_answer_must_be_public(client, monkeypatch, address):
    saved_call(client)
    # A public first result must not hide a private/reserved later result.
    dns_calls = mock_dns(monkeypatch, [PUBLIC_IP, address])
    requests = []
    opened = install_transport(monkeypatch, lambda request: requests.append(request))
    error(client.get('/api/conversations/call/audio'), 502, 'upstream_failed')
    assert dns_calls == ['player.environment.api.powerplatform.com']
    assert requests == [] and all(c.is_closed for c in opened)


def test_source_host_dns_is_checked_separately(client, monkeypatch):
    saved_call(client)
    dns_calls = mock_dns(monkeypatch, lambda host: [PUBLIC_IP] if host.startswith('player.') else ['10.0.0.5'])
    requests = []
    def upstream(request):
        requests.append(request)
        return httpx.Response(200, text=f'<source src="{MEDIA}" type="audio/mpeg">')
    install_transport(monkeypatch, upstream)
    error(client.get('/api/conversations/call/audio'), 502, 'upstream_failed')
    assert len(requests) == 1
    assert dns_calls == ['player.environment.api.powerplatform.com', 'media.dynamics.com']


@pytest.mark.parametrize('source', ['https://evil.example/audio.mp3', '//evil.example/audio.mp3', 'http://127.0.0.1/audio.mp3'])
def test_source_url_after_join_is_not_trusted(client, monkeypatch, source):
    saved_call(client)
    dns_calls = mock_dns(monkeypatch)
    requests = []
    def upstream(request):
        requests.append(request)
        return httpx.Response(200, text=f'<source src="{source}" type="audio/mpeg">')
    install_transport(monkeypatch, upstream)
    error(client.get('/api/conversations/call/audio'), 502, 'upstream_failed')
    assert len(requests) == 1 and len(dns_calls) == 1


@pytest.mark.parametrize('stage', ['page', 'mp3'])
@pytest.mark.parametrize('target', ['https://evil.example/', 'http://127.0.0.1/', 'https://internal.dynamics.com/'])
def test_each_redirect_is_checked_before_connecting(client, monkeypatch, stage, target):
    saved_call(client)
    dns_calls = mock_dns(monkeypatch, lambda host: ['10.0.0.5'] if host.startswith('internal.') else [PUBLIC_IP])
    requests, streams = [], []
    def upstream(request):
        requests.append(request)
        if stage == 'mp3' and request.url.path == '/player':
            return httpx.Response(200, text=f'<source src="{MEDIA}" type="audio/mpeg">')
        stream = AudioChunks(b'')
        streams.append(stream)
        return httpx.Response(302, headers={'Location': target}, stream=stream)
    opened = install_transport(monkeypatch, upstream)
    error(client.get('/api/conversations/call/audio'), 502, 'upstream_failed')
    assert len(requests) == (1 if stage == 'page' else 2)
    assert 'evil.example' not in dns_calls
    assert all(s.closed for s in streams) and all(c.is_closed for c in opened)


def test_relative_redirect_and_source_keep_logical_host_with_pinned_connections(client, monkeypatch):
    saved_call(client)
    dns_calls = mock_dns(monkeypatch)
    requests = []
    def upstream(request):
        requests.append(request)
        assert request.url.host == PUBLIC_IP
        assert request.headers['host'] == 'player.environment.api.powerplatform.com'
        assert request.extensions['sni_hostname'] == request.headers['host']
        if request.url.path == '/player':
            return httpx.Response(302, headers={'Location': '/new/player'})
        if request.url.path == '/new/player':
            return httpx.Response(200, text='<source src="../audio.mp3?sig=a%2Fb&amp;x=1" type="audio/mpeg">')
        assert request.url.path == '/audio.mp3'
        assert request.url.query == b'sig=a%2Fb&x=1'
        assert request.headers['range'] == 'bytes=0-1023'
        return httpx.Response(206, headers={'Content-Range': 'bytes 0-1023/2048'}, stream=AudioChunks(b'a' * 1024))
    opened = install_transport(monkeypatch, upstream)
    response = client.get('/api/conversations/call/audio', headers={'Range': 'bytes=0-1023'})
    assert response.status_code == 206 and response.content == b'a' * 1024
    assert len(requests) == len(dns_calls) == 3
    assert all(not c.follow_redirects and c.is_closed for c in opened)


@pytest.mark.parametrize('redirect_count', [3, 4])
def test_redirect_limit(client, monkeypatch, redirect_count):
    saved_call(client)
    mock_dns(monkeypatch)
    requests, streams = [], []
    def upstream(request):
        requests.append(request)
        if request.url.path == '/file.mp3':
            return httpx.Response(200, stream=AudioChunks(b'ID3'))
        hop = 0 if request.url.path == '/player' else int(request.url.path.strip('/'))
        if hop < redirect_count:
            stream = AudioChunks(b'')
            streams.append(stream)
            return httpx.Response(307, headers={'Location': f'/{hop + 1}'}, stream=stream)
        return httpx.Response(200, text=f'<source src="{MEDIA}" type="audio/mpeg">')
    install_transport(monkeypatch, upstream)
    response = client.get('/api/conversations/call/audio')
    if redirect_count == 3:
        assert response.status_code == 200 and response.content == b'ID3'
    else:
        error(response, 502, 'upstream_failed')
        assert len(requests) == 4
    assert all(s.closed for s in streams)


def test_organizer_import_also_sanitizes_audio(client, monkeypatch):
    requests = []
    def upstream(request):
        requests.append(request)
        return httpx.Response(200, json={'isSuccess': True, 'data': {'records': [
            record('safe', audio=PLAYER), record('bad', audio='https://evil.example/player'), record('empty')]}})
    install_transport(monkeypatch, upstream)
    response = client.post('/api/datasets/import', json={'groupId': 'DEV'})
    assert response.status_code == 200
    assert response.json()['audioRejected'] == 1
    assert client.app.state.db.get_conversation('safe')['audioUrl'] == PLAYER
    assert client.app.state.db.get_conversation('bad')['audioUrl'] is None
    error(client.get('/api/conversations/bad/audio'), 404, 'no_audio')
    assert len(requests) == 1


def test_allowlist_setting_is_used_by_import_and_proxy(client, monkeypatch, tmp_path):
    monkeypatch.setenv('AUDIO_ALLOWED_HOSTS', ' .CUSTOM.EXAMPLE.,another.example ')
    settings = Settings(db_path=tmp_path / 'settings.sqlite')
    assert settings.audio_allowed_hosts == ('custom.example', 'another.example')
    client.app.state.settings.audio_allowed_hosts = settings.audio_allowed_hosts
    assert saved_call(client, 'https://audio.custom.example/player')['audioRejected'] == 0
    mock_dns(monkeypatch)
    requests = []
    def upstream(request):
        requests.append(request)
        assert request.headers['host'] == 'audio.custom.example'
        if request.url.path == '/player':
            return httpx.Response(200, text='<source src="/audio.mp3">')
        return httpx.Response(200, stream=AudioChunks(b'ID3'))
    install_transport(monkeypatch, upstream)
    assert client.get('/api/conversations/call/audio').content == b'ID3'
    assert len(requests) == 2
    assert saved_call(client, PLAYER)['audioRejected'] == 1
