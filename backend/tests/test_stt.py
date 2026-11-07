"""Only synthetic records and mocked network transports; no paid Scribe calls."""
import asyncio
import copy
import json
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.conversations import import_records
from app.db import Database
from tests.helpers import create_app
from app.settings import Settings
from app.stt import audio, provider
from app.stt.service import TranscriptionQueue
from app.stt.storage import Store


def records(count=1):
    return [{'conversation_id': f'call-{index}', 'channel': 'voice call', 'language': 'RU',
             'audio_url': 'https://example.dynamics.com/recording',
             'transcript': [{'timestamp': '00:00', 'speaker': 'operator', 'text': 'Здравствуйте чем могу помочь сегодня'},
                            {'timestamp': '00:10', 'speaker': 'client', 'text': 'Подскажите пожалуйста где найти отчёт'}]}
            for index in range(count)]


def response_words():
    texts = ['Здравствуйте', 'чем', 'могу', 'помочь', 'сегодня',
             'Подскажите', 'пожалуйста', 'где', 'найти', 'отчёт']
    return {'words': [{'word': word, 'start': float(index), 'end': index + 0.5,
                       'speaker': 'speaker_0' if index < 5 else 'speaker_1'} for index, word in enumerate(texts)],
            'duration': 10, 'usage': {'seconds': 10}}


def enabled_settings(path, **extra):
    return Settings(db_path=path, auto_summarize=False,
                    auto_evaluate_imports=extra.pop('auto_evaluate_imports', False),
                    stt_enabled=True, openrouter_api_key='synthetic-test-key', **extra)


def install_audio(monkeypatch, info=None):
    paths = []

    async def download(url, hosts, path):
        assert url == 'https://example.dynamics.com/recording'
        path.write_bytes(b'synthetic mp3 bytes')
        paths.append(path)
        return None

    async def inspect(path, declared):
        return info or audio.AudioInfo(declared=10, decoded=10, check='checked')

    monkeypatch.setattr(audio, 'download_audio', download)
    monkeypatch.setattr(audio, 'inspect_audio', inspect)
    return paths


def wait_jobs(client, total):
    until = time.monotonic() + 5
    while time.monotonic() < until:
        value = client.get('/api/stt/jobs').json()
        if value['total'] == total and value['done'] + value['failed'] == total:
            return value
        time.sleep(0.01)
    pytest.fail('Mocked transcription jobs did not finish')


def test_import_jobs_deduplicate_and_do_not_change_organizer_input(tmp_path, monkeypatch):
    paths = install_audio(monkeypatch, audio.AudioInfo(393.3, 265.75, True, 'incomplete'))
    calls, active = [], {'value': 0, 'maximum': 0}

    async def transcribe(path, settings):
        active['value'] += 1
        active['maximum'] = max(active['maximum'], active['value'])
        await asyncio.sleep(0.02)
        calls.append(path)
        active['value'] -= 1
        return response_words()

    monkeypatch.setattr(provider, 'transcribe', transcribe)
    app = create_app(enabled_settings(tmp_path / 'stt.sqlite', stt_concurrency=2))
    payload = records(5)
    with TestClient(app) as client:
        first = client.post('/api/conversations/upload', json=payload)
        assert first.status_code == 200
        assert first.json()['sttQueued'] == 5
        assert first.json()['sttConversationIds'] == [f'call-{i}' for i in range(5)]
        before = client.get('/api/conversations/call-0').json()
        job = wait_jobs(client, 5)
        assert (job['done'], job['failed'], job['running'], job['queued']) == (5, 0, 0, 0)
        assert active['maximum'] == 2
        transcript = client.get('/api/conversations/call-0/transcription').json()
        assert transcript['status'] == 'done' and transcript['progress'] == 100
        assert transcript['incomplete'] is True
        assert (transcript['audioSecondsDeclared'], transcript['audioSecondsDecoded']) == (393.3, 265.75)
        assert transcript['turns'] and transcript['speakers']
        from app.translation_service import transcription_source_hash
        assert transcript['sourceHash'] == transcription_source_hash(transcript)
        revised = copy.deepcopy(transcript)
        revised['turns'][0]['text'] += ' Уточнение'
        assert transcription_source_hash(revised) != transcript['sourceHash']
        assert transcript['costUsd'] == pytest.approx(10 * 0.0000611)
        assert client.get('/api/conversations/call-0').json() == before
        again = client.post('/api/conversations/upload', json=payload).json()
        assert again['sttQueued'] == 0 and again['sttConversationIds'] == []
        assert client.post('/api/conversations/call-0/transcription/retry', json={}).json()['status'] == 'done'
        assert len(calls) == 5
        assert client.get('/api/stt/jobs?groupId=OTHER').json()['total'] == 0
        with app.state.db.transaction() as conn:
            assert conn.execute("SELECT name FROM sqlite_master WHERE name='transcriptions_raw'").fetchone() is None
    assert all(not path.exists() for path in paths)


def test_only_new_imports_auto_evaluate_and_transcribe_existing_need_explicit_choice(tmp_path, monkeypatch):
    install_audio(monkeypatch)
    calls = []
    async def transcribe(*_):
        calls.append(True)
        return response_words()
    monkeypatch.setattr(provider, 'transcribe', transcribe)
    app = create_app(enabled_settings(tmp_path / 'new-only.sqlite', auto_evaluate_imports=True))
    with TestClient(app) as client:
        first = client.post('/api/conversations/upload', json=records()).json()
        assert first['newConversationIds'] == ['call-0'] and first['existingConversationIds'] == []
        accepted = first['evaluationJob']
        assert accepted['reuse'] is False and accepted['checklistVersion'] == 1
        assert set(accepted['evaluationIds']) == {'call-0'}
        wait_jobs(client, 1)
        count = len(app.state.db.all_evaluations())
        mixed = records(2)
        mixed[0]['transcript'][0]['text'] += ' Уточнение'
        second = client.post('/api/conversations/upload', json=mixed).json()
        assert (second['imported'], second['updated'], second['unchanged']) == (1, 1, 0)
        assert second['newConversationIds'] == ['call-1'] and second['existingConversationIds'] == ['call-0']
        assert second['sttConversationIds'] == ['call-1']
        assert set(second['evaluationJob']['evaluationIds']) == {'call-1'}
        assert len(app.state.db.all_evaluations()) == count + 1
        assert client.get('/api/conversations/call-0/transcription').json()['status'] == 'not_queued'
        wait_jobs(client, 1)
        third = client.post('/api/conversations/upload', json=mixed).json()
        assert third['newConversationIds'] == [] and third['existingConversationIds'] == ['call-0', 'call-1']
        assert third['unchanged'] == 2 and third['sttQueued'] == 0 and third['evaluationJob'] is None
        assert len(app.state.db.all_evaluations()) == count + 1
        # The explicit duplicate action may also replace a completed transcript.
        client.post('/api/conversations/call-1/transcription/retry', json={'force': True})
        wait_jobs(client, 1)
        assert len(calls) == 3


@pytest.mark.parametrize('stream', [False, True])
def test_crm_import_and_sync_report_new_queue_ids(tmp_path, monkeypatch, stream):
    install_audio(monkeypatch)
    async def transcribe(*_):
        return response_words()
    async def fetch_dataset(*_):
        return {'data': {'records': records(1)}}
    monkeypatch.setattr(provider, 'transcribe', transcribe)
    monkeypatch.setattr('app.conversations.fetch_dataset', fetch_dataset)
    with TestClient(create_app(enabled_settings(tmp_path / 'crm.sqlite'))) as client:
        headers = {'Accept': 'application/x-ndjson'} if stream else {}
        response = client.post('/api/source/sync', json={}, headers=headers)
        result = json.loads(response.text.splitlines()[-1])['result'] if stream else response.json()
        assert result['sttQueued'] == 1 and result['sttConversationIds'] == ['call-0']
        wait_jobs(client, 1)
        assert client.post('/api/datasets/import', json={'groupId': 'DEV'}).json()['sttQueued'] == 0


def test_disabled_missing_config_and_failure_retry(tmp_path, monkeypatch):
    paths = install_audio(monkeypatch)
    count = {'value': 0}
    async def transcribe(*_):
        count['value'] += 1
        if count['value'] == 1:
            raise provider.TranscriptionError('Сервис распознавания не ответил')
        return response_words()
    monkeypatch.setattr(provider, 'transcribe', transcribe)
    settings = enabled_settings(tmp_path / 'retry.sqlite')
    settings.stt_enabled = False
    with TestClient(create_app(settings)) as client:
        assert client.post('/api/conversations/upload', json=records()).json()['sttQueued'] == 0
        assert client.get('/api/conversations/call-0/transcription').json()['status'] == 'disabled'
        assert client.get('/api/stt/jobs').json()['enabled'] is False
        assert client.post('/api/conversations/call-0/transcription/retry', json={}).status_code == 409
    settings.stt_enabled = True
    settings.openrouter_api_key = ''
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/conversations/call-0/transcription').json()['status'] == 'not_queued'
        unavailable = client.post('/api/conversations/call-0/transcription/retry', json={})
        assert unavailable.status_code == 503 and unavailable.json()['error']['code'] == 'model_unavailable'
        assert client.get('/api/stt/jobs').json()['total'] == 0
        assert client.get('/api/conversations/call-0/transcription').json()['status'] == 'not_queued'
        assert not paths and count['value'] == 0
    settings.openrouter_api_key = 'synthetic-test-key'
    with TestClient(create_app(settings)) as client:
        assert client.post('/api/conversations/call-0/transcription/retry', json={}).status_code == 202
        assert wait_jobs(client, 1)['failed'] == 1
        failed = client.get('/api/conversations/call-0/transcription').json()
        assert failed['turns'] == [] and failed['progress'] < 100
        assert failed['sourceHash'] is None
        assert client.post('/api/conversations/call-0/transcription/retry', json={}).status_code == 202
        assert wait_jobs(client, 1)['done'] == 1
        assert count['value'] == 2


def test_restart_resumes_download_but_does_not_repeat_uncertain_paid_call(tmp_path, monkeypatch):
    install_audio(monkeypatch)
    called = []
    async def transcribe(*_):
        called.append(True)
        return response_words()
    monkeypatch.setattr(provider, 'transcribe', transcribe)
    settings = enabled_settings(tmp_path / 'restart.sqlite')
    db = Database(settings.db_path)
    import_records(db, records(2), 'UPLOAD')
    store = Store(db)
    first, second = store.enqueue(['call-0', 'call-1'], settings.stt_model)
    store.update(*first, status='running', step='download', progress=5)
    store.update(*second, status='running', step='transcribe', progress=45)
    with TestClient(create_app(settings)) as client:
        job = wait_jobs(client, 2)
        assert job['done'] == 1 and job['failed'] == 1 and len(called) == 1
        failed = client.get('/api/conversations/call-1/transcription').json()
        assert failed['turns'] == [] and failed['error'] == 'Расшифровка прервалась. Повторите её'


def test_stale_worker_cannot_publish_after_transcript_reimport(tmp_path, monkeypatch):
    install_audio(monkeypatch)
    settings = enabled_settings(tmp_path / 'stale.sqlite')
    db = Database(settings.db_path)
    import_records(db, records(), 'UPLOAD')

    async def scenario():
        queue = TranscriptionQueue(db, settings)
        began, release = asyncio.Event(), asyncio.Event()
        async def transcribe(*_):
            began.set()
            await release.wait()
            return response_words()
        monkeypatch.setattr(provider, 'transcribe', transcribe)
        await queue.start()
        queue.enqueue(['call-0'])
        await asyncio.wait_for(began.wait(), 2)
        updated = records()
        updated[0]['transcript'][0]['text'] = 'Обновлённый исходный разговор'
        import_records(db, updated, 'UPLOAD')
        assert queue.transcription('call-0')['status'] == 'not_queued'
        release.set()
        await asyncio.wait_for(queue.queue.join(), 2)
        assert queue.transcription('call-0')['turns'] == []
        await queue.close()
    asyncio.run(scenario())


def test_privacy_failure_never_persists_response_text(tmp_path, monkeypatch):
    from app.stt import processing
    install_audio(monkeypatch)
    async def transcribe(*_):
        return {**response_words(), 'text': 'Sensitive synthetic provider text'}
    def reject(_):
        raise processing.PrivacyError('Sensitive synthetic provider text')
    monkeypatch.setattr(provider, 'transcribe', transcribe)
    monkeypatch.setattr(processing, 'mask_prepared', reject)
    app = create_app(enabled_settings(tmp_path / 'privacy.sqlite'))
    with TestClient(app) as client:
        client.post('/api/conversations/upload', json=records())
        assert wait_jobs(client, 1)['failed'] == 1
        response = client.get('/api/conversations/call-0/transcription')
        assert response.json()['turns'] == [] and 'Sensitive' not in response.text
        with app.state.db.transaction() as conn:
            row = dict(conn.execute('SELECT * FROM transcriptions').fetchone())
            assert 'Sensitive' not in json.dumps(row)
            assert row['seconds_billed'] == 10 and row['cost_usd'] > 0


@pytest.mark.parametrize('status,expected_calls', [(429, 2), (500, 2), (400, 1)])
def test_provider_bounded_retry_and_safe_errors(tmp_path, monkeypatch, status, expected_calls):
    path = tmp_path / 'test.mp3'
    path.write_bytes(b'fake')
    requests, sleeps = [], []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, json={'error': 'private provider detail'})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(provider.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    async def sleep(seconds):
        sleeps.append(seconds)
    monkeypatch.setattr(provider.asyncio, 'sleep', sleep)
    with pytest.raises(provider.TranscriptionError, match='Сервис распознавания не ответил') as failure:
        asyncio.run(provider.transcribe(path, enabled_settings(tmp_path / 'unused.sqlite')))
    assert 'private' not in str(failure.value)
    assert len(requests) == expected_calls
    assert sleeps == ([3] if expected_calls == 2 else [])
    body = json.loads(requests[0].content)
    assert body['provider']['options']['elevenlabs']['diarize'] is True
    assert body['timestamp_granularities'] == ['segment', 'word']


def test_audio_full_decode_detects_truncation_and_missing_ffmpeg(tmp_path, monkeypatch):
    monkeypatch.setattr(audio.shutil, 'which', lambda name: name)
    calls = []
    async def command(*args):
        calls.append(args)
        return (0, '393.3\n', '') if args[0] == 'ffprobe' else (0, 'out_time_us=265754940\nprogress=end\n', 'invalid frame')
    monkeypatch.setattr(audio, 'command', command)
    info = asyncio.run(audio.inspect_audio(tmp_path / 'audio.mp3'))
    assert info.incomplete and info.declared == 393.3 and info.decoded == 265.75494
    assert '-f' in calls[-1] and 'null' in calls[-1]
    monkeypatch.setattr(audio.shutil, 'which', lambda name: None)
    skipped = asyncio.run(audio.inspect_audio(tmp_path / 'audio.mp3', 100))
    assert skipped.check == 'unavailable' and skipped.decoded is None and skipped.declared == 100


def test_audio_download_uses_checked_helper_for_both_hops(tmp_path, monkeypatch):
    visited = []
    async def audio_get(client, url, allowed_hosts, headers=None):
        visited.append((url, headers))
        request = httpx.Request('GET', url)
        body = b'<audio><source src="/audio.mp3" type="audio/mpeg"></audio>' if len(visited) == 1 else b'synthetic audio'
        return httpx.Response(200, content=body, request=request), url
    monkeypatch.setattr(audio, 'audio_get', audio_get)
    target = tmp_path / 'audio.mp3'
    asyncio.run(audio.download_audio('https://example.dynamics.com/page', ('dynamics.com',), target))
    assert [url for url, _ in visited] == ['https://example.dynamics.com/page', 'https://example.dynamics.com/audio.mp3']
    assert visited[-1][1] == {'Accept-Encoding': 'identity'}
    assert target.read_bytes() == b'synthetic audio'


def test_retained_raw_is_opt_in_and_cleared_when_disabled(tmp_path):
    db = Database(tmp_path / 'raw.sqlite')
    import_records(db, records(), 'UPLOAD')
    store = Store(db, keep_raw=True)
    cid, generation = store.enqueue(['call-0'], 'test-model')[0]
    store.finish(cid, generation, {'turns': [{'text': '[Персональные данные скрыты]'}], 'speakers': []},
                 {'text': 'synthetic private raw'})
    with db.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM transcriptions_raw').fetchone()[0] == 1
    Store(db, keep_raw=False)
    with db.transaction() as conn:
        assert conn.execute("SELECT name FROM sqlite_master WHERE name='transcriptions_raw'").fetchone() is None


def test_new_transcription_persists_distinct_roles_for_a_shared_provider_voice(tmp_path, monkeypatch):
    install_audio(monkeypatch)
    greeting = 'Здравствуйте вы позвонили в справочную службу нашей компании'
    request = 'Мне нужна помощь с настройкой приложения на телефоне сегодня пожалуйста и ещё хочу уточнить порядок получения подробного отчёта'
    payload = records()
    payload[0]['transcript'] = [{'timestamp': '00:00', 'speaker': 'bot', 'text': greeting},
                                {'timestamp': '00:10', 'speaker': 'client', 'text': request}]
    async def transcribe(*_):
        groups = [(greeting, 0), (request, 10), ('Да', 25)]
        return {'words': [{'word': word, 'start': start + i * .3, 'end': start + i * .3 + .2,
                           'speaker': 'shared'} for text, start in groups for i, word in enumerate(text.split())]}
    monkeypatch.setattr(provider, 'transcribe', transcribe)
    app = create_app(enabled_settings(tmp_path / 'turn-roles.sqlite'))
    with TestClient(app) as client:
        client.post('/api/conversations/upload', json=payload)
        assert wait_jobs(client, 1)['done'] == 1
        saved = Store(app.state.db).get('call-0')
        assert saved['speakers'] == [{'speakerId': 'speaker_0', 'role': 'client'}]
        assert [(turn['role'], turn['roleSource']) for turn in saved['turns']] == [
            ('bot', 'aligned'), ('client', 'aligned'), ('client', 'speaker')]
        shown = client.get('/api/conversations/call-0/transcription').json()
        assert shown['turns'] == saved['turns']


def test_saved_transcription_roles_are_corrected_read_only_without_new_provider_call(tmp_path, monkeypatch):
    from app.translation_service import transcription_source_hash
    greeting = 'Здравствуйте вы позвонили в справочную службу нашей компании'
    payload = records()
    payload[0]['transcript'][0] = {'timestamp': '00:00', 'speaker': 'bot', 'text': greeting}
    settings = enabled_settings(tmp_path / 'legacy-roles.sqlite')
    db = Database(settings.db_path)
    import_records(db, payload, 'UPLOAD')
    store = Store(db)
    cid, generation = store.enqueue(['call-0'], settings.stt_model)[0]
    original = {'turns': [{'idx': 0, 'start': 0, 'end': 5, 'text': greeting,
                           'speakerId': 'shared', 'orgIdx': 0, 'doubtful': False},
                          {'idx': 7, 'start': 9, 'end': 10, 'text': 'Да',
                           'speakerId': 'shared', 'orgIdx': 0, 'doubtful': False}],
                'speakers': [{'speakerId': 'shared', 'role': 'client'}]}
    store.finish(cid, generation, original)
    before = store.get(cid)
    before_hash = transcription_source_hash({**original, 'transcriptHash': before['transcript_hash']})
    async def no_provider_call(*_):
        pytest.fail('Reading saved roles must not call the provider')
    monkeypatch.setattr(provider, 'transcribe', no_provider_call)
    with TestClient(create_app(settings)) as client:
        first = client.get('/api/conversations/call-0/transcription').json()
        second = client.get('/api/conversations/call-0/transcription').json()
        assert first == second
        assert [(turn['role'], turn['roleSource']) for turn in first['turns']] == [
            ('bot', 'aligned'), ('client', 'speaker')]
        assert [{key: value for key, value in turn.items() if key not in {'role', 'roleSource'}}
                for turn in first['turns']] == original['turns']
        assert first['sourceHash'] == before_hash
        assert first['speakers'] == original['speakers']
        assert store.get(cid) == before
