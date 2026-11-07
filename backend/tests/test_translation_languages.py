import asyncio
import copy
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from app import llm_switch, translation_service
from app.errors import JudgeError
from app.extras import translation
from app.models import Conversation, Usage
from starlette.requests import Request


def _provider(client, monkeypatch, transform=None, delay=0):
    calls = []
    client.app.state.settings.openrouter_api_key = 'test-translation-key'
    client.app.state.settings.translation_model = 'google/gemini-3.1-flash-lite'

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs['follow_redirects'] is False
            assert kwargs['trust_env'] is False

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, *, json, headers):
            calls.append(copy.deepcopy(json))
            assert url == 'https://openrouter.ai/api/v1/chat/completions'
            assert headers['Authorization'] == 'Bearer test-translation-key'
            if delay:
                await asyncio.sleep(delay)
            source = __import__('json').loads(json['messages'][1]['content'])
            result = {'targetLanguage': source['targetLanguage'],
                      'turns': [{'idx': t['idx'], 'text': source['targetLanguage'] + ': ' + t['text']}
                                for t in source['turns']]}
            payload = {'choices': [{'finish_reason': 'stop', 'message': {'content': __import__('json').dumps(result)}}],
                       'usage': {'prompt_tokens': 100, 'completion_tokens': 200, 'cost': .00123}}
            if transform:
                payload = transform(payload, result)
            return httpx.Response(200, json=payload, request=httpx.Request('POST', url))

    monkeypatch.setattr(translation_service.httpx, 'AsyncClient', FakeClient)
    return calls


def _cost(client):
    with client.app.state.db.transaction() as conn:
        return conn.execute("SELECT SUM(cost_usd), SUM(calls) FROM model_calls WHERE kind='extra'").fetchone()


def test_each_target_has_its_own_cached_batch_and_actual_usage(seeded_client, monkeypatch):
    calls = _provider(seeded_client, monkeypatch)
    cid = 'p1-ru-001'
    for target in ['EN', 'KZ', 'EN', 'KZ']:
        response = seeded_client.get(f'/api/conversations/{cid}/translation?targetLanguage={target}')
        assert response.status_code == 200, response.text
        result = response.json()
        source = seeded_client.app.state.db.get_conversation(cid)
        assert result['targetLanguage'] == target
        assert result['sourceHash'] == source['transcriptHash']
        assert [t['idx'] for t in result['turns']] == [t['idx'] for t in source['transcript']]
        assert result['turns'][0]['text'].startswith(target + ': ')
    assert len(calls) == 2
    for body in calls:
        assert body['model'] == 'google/gemini-3.1-flash-lite'
        assert body['usage'] == {'include': True}
        assert body['provider'] == {'require_parameters': True}
        assert body['response_format']['type'] == 'json_schema'
        assert len(json.loads(body['messages'][1]['content'])['turns']) == len(source['transcript'])
    cost, count = _cost(seeded_client)
    assert cost == pytest.approx(.00246) and count == 2


@pytest.mark.parametrize('cid,target', [('p1-ru-001', 'RU'), ('p1-kz-003', 'KZ'), ('p1-en-002', 'EN')])
def test_same_language_never_calls_provider(seeded_client, monkeypatch, cid, target):
    calls = _provider(seeded_client, monkeypatch)
    result = seeded_client.get(f'/api/conversations/{cid}/translation?targetLanguage={target}').json()
    source = seeded_client.app.state.db.get_conversation(cid)
    assert result == {'turns': [{'idx': t['idx'], 'text': t['text']} for t in source['transcript']],
                      'targetLanguage': target, 'source': 'canonical', 'sourceHash': source['transcriptHash']}
    assert calls == []
    assert _cost(seeded_client)[1] is None


def test_no_key_keeps_russian_compatibility_but_never_relabels_it(seeded_client, monkeypatch):
    calls = []
    original = llm_switch.get_ai().translate

    async def counted(conversation):
        calls.append(conversation.id)
        return await original(conversation)

    monkeypatch.setattr(llm_switch.get_ai(), 'translate', counted)
    response = seeded_client.get('/api/conversations/p1-kz-003/translation')
    assert response.status_code == 200
    assert response.json()['targetLanguage'] == 'RU'
    assert response.json()['turns'][0]['text'].startswith('Вчера')
    for target in ['EN', 'KZ']:
        response = seeded_client.get(f'/api/conversations/p1-ru-001/translation?targetLanguage={target}')
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'translation_unavailable'
    assert calls == ['p1-kz-003']
    assert seeded_client.get('/api/conversations/p1-ru-001/translation?targetLanguage=FR').status_code == 400


@pytest.mark.parametrize('refresh', ['', '&refresh=true'])
def test_concurrent_same_target_joins_one_request(seeded_client, monkeypatch, refresh):
    calls = _provider(seeded_client, monkeypatch, delay=.1)
    path = '/api/conversations/p1-ru-001/translation?targetLanguage=EN' + refresh
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = list(pool.map(lambda _: seeded_client.get(path), range(3)))
    assert all(r.status_code == 200 for r in responses)
    assert len(calls) == 1
    assert responses[0].json() == responses[1].json() == responses[2].json()


def test_cancelled_waiter_does_not_restart_paid_request(seeded_client, monkeypatch):
    calls = _provider(seeded_client, monkeypatch, delay=.1)

    async def run():
        request = Request({'type': 'http', 'app': seeded_client.app})
        first = asyncio.create_task(translation('p1-ru-001', request, target_language='EN', source_name='canonical', expected_hash=None))
        while not calls:
            await asyncio.sleep(.001)
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        second = await translation('p1-ru-001', request, target_language='EN', source_name='canonical', expected_hash=None)
        assert second['targetLanguage'] == 'EN'
        await asyncio.sleep(0)
        assert not seeded_client.app.state.translation_tasks

    seeded_client.portal.call(run)
    assert len(calls) == 1


def test_changed_transcript_generates_new_target_cache(seeded_client, monkeypatch, dev_payload):
    calls = _provider(seeded_client, monkeypatch)
    path = '/api/conversations/p1-ru-001/translation?targetLanguage=EN'
    first = seeded_client.get(path).json()
    record = next(r for r in dev_payload['data']['records'] if r['conversation_id'] == 'p1-ru-001')
    record['transcript'][0]['text'] += ' Новый вопрос.'
    assert seeded_client.post('/api/conversations/upload', json=[record]).status_code == 200
    second = seeded_client.get(path).json()
    assert second['sourceHash'] != first['sourceHash']
    assert second['turns'][0]['text'] != first['turns'][0]['text']
    assert len(calls) == 2


def test_source_changed_during_translation_is_rejected(seeded_client, monkeypatch, dev_payload):
    started = threading.Event()
    release = threading.Event()
    seeded_client.app.state.settings.openrouter_api_key = 'test-translation-key'

    async def slow(conversation, target, settings):
        started.set()
        while not release.is_set():
            await asyncio.sleep(.005)
        return translation_service.TranslationResult(
            [{'idx': t.idx, 'text': 'EN: ' + t.text} for t in conversation.transcript], target, Usage(calls=1))

    monkeypatch.setattr(translation_service, 'translate', slow)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(seeded_client.get, '/api/conversations/p1-ru-001/translation?targetLanguage=EN')
        assert started.wait(2)
        record = next(r for r in dev_payload['data']['records'] if r['conversation_id'] == 'p1-ru-001')
        record['transcript'][0]['text'] += ' Новое содержание.'
        try:
            assert seeded_client.post('/api/conversations/upload', json=[record]).status_code == 200
        finally:
            release.set()
        response = future.result(timeout=3)
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'stale_source'
    with seeded_client.app.state.db.transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM ai_cache WHERE kind='translation'").fetchone()[0] == 0


@pytest.mark.parametrize('defect', ['missing', 'duplicate', 'unknown', 'bool_id', 'blank', 'html', 'wrong_language', 'invalid_json', 'truncated'])
def test_invalid_completion_is_rejected_and_billing_survives(seeded_client, monkeypatch, defect):
    def transform(payload, result):
        if defect == 'missing':
            result['turns'].pop()
        elif defect == 'duplicate':
            result['turns'].append(result['turns'][0])
        elif defect == 'unknown':
            result['turns'][0]['idx'] = 98765
        elif defect == 'bool_id':
            result['turns'][0]['idx'] = False
        elif defect == 'blank':
            result['turns'][0]['text'] = ' '
        elif defect == 'html':
            result['turns'][0]['text'] = '<script>alert(1)</script>'
        elif defect == 'wrong_language':
            result['targetLanguage'] = 'RU'
        elif defect == 'truncated':
            payload['choices'][0]['finish_reason'] = 'length'
        payload['choices'][0]['message']['content'] = '{' if defect == 'invalid_json' else json.dumps(result)
        return payload

    calls = _provider(seeded_client, monkeypatch, transform)
    path = '/api/conversations/p1-ru-001/translation?targetLanguage=EN'
    response = seeded_client.get(path)
    assert response.status_code == 502
    assert response.json()['error']['code'] == 'model_failed'
    cost, count = _cost(seeded_client)
    assert cost == pytest.approx(.00123) and count == 1
    assert seeded_client.get(path).status_code == 502
    assert len(calls) == 2  # Rejected output never becomes a reusable cache hit.


def test_redactions_are_preserved_per_turn(seeded_client, monkeypatch, dev_payload):
    record = next(r for r in dev_payload['data']['records'] if r['conversation_id'] == 'p1-ru-001')
    record['transcript'][0]['text'] = 'Телефон [Телефон скрыт], код ***. [Имя скрыто] подтвердил.'
    assert seeded_client.post('/api/conversations/upload', json=[record]).status_code == 200
    _provider(seeded_client, monkeypatch)
    path = '/api/conversations/p1-ru-001/translation?targetLanguage=EN'
    response = seeded_client.get(path)
    assert response.status_code == 200
    assert '[Телефон скрыт]' in response.json()['turns'][0]['text']

    def remove_mask(payload, result):
        result['turns'][0]['text'] = re.sub(r'__DA_MASK_[0-9a-f]+_[0-9]+__', '[Phone hidden]',
                                           result['turns'][0]['text'], count=1)
        payload['choices'][0]['message']['content'] = json.dumps(result)
        return payload

    _provider(seeded_client, monkeypatch, remove_mask)
    response = seeded_client.get(path + '&refresh=true')
    assert response.status_code == 502
    assert response.json()['error']['code'] == 'model_failed'
    assert _cost(seeded_client)[1] == 2


def test_provider_failure_is_safe_and_not_automatically_retried(seeded_client, monkeypatch):
    calls = []
    seeded_client.app.state.settings.openrouter_api_key = 'test-translation-key'
    seeded_client.app.state.settings.translation_model = 'google/gemini-3.1-flash-lite'

    class FailedClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            calls.append(1)
            return httpx.Response(429, text='provider-private-body test-translation-key', request=httpx.Request('POST', url))

    monkeypatch.setattr(translation_service.httpx, 'AsyncClient', FailedClient)
    response = seeded_client.get('/api/conversations/p1-ru-001/translation?targetLanguage=EN')
    assert response.status_code == 502
    assert 'private' not in response.text and 'test-translation-key' not in response.text
    assert calls == [1]


def test_out_of_order_valid_turns_are_restored_to_source_order(seeded_client):
    conversation = Conversation.model_validate(seeded_client.app.state.db.get_conversation('p1-en-002'))
    turns = [{'idx': t.idx, 'text': t.text} for t in reversed(conversation.transcript)]
    assert [t['idx'] for t in translation_service.validate_turns(turns, conversation)] == [t.idx for t in conversation.transcript]


def _sanitized_call(client):
    """Store-only synthetic completion; the STT queue is never started."""
    record = {'conversation_id': 'translation-call', 'channel': 'voice call', 'language': 'EN',
              'audio_url': 'https://example.dynamics.com/recording',
              'transcript': [{'timestamp': '00:00', 'speaker': 'operator', 'text': 'Canonical greeting.'},
                             {'timestamp': '00:03', 'speaker': 'client', 'text': 'Canonical question.'}]}
    assert client.post('/api/conversations/upload', json=[record]).status_code == 200
    client.app.state.settings.stt_enabled = True
    store = client.app.state.stt.store
    [(cid, generation)] = store.enqueue(['translation-call'], 'synthetic-stt')
    result = {
        'turns': [{'idx': 41, 'speakerId': 'one', 'text': 'Sanitized spoken greeting.', 'start': 0, 'end': 2,
                   'orgIdx': 0, 'doubtful': False},
                  {'idx': 52, 'speakerId': 'two', 'text': 'My code is [Код скрыт].', 'start': 3, 'end': 4,
                   'orgIdx': 1, 'doubtful': False}],
        'speakers': [{'speakerId': 'one', 'role': 'operator'}, {'speakerId': 'two', 'role': 'unknown'}],
    }
    assert store.finish(cid, generation, result)
    payload = client.app.state.stt.transcription(cid)
    return cid, generation, result, translation_service.transcription_source_hash(payload)


def test_translation_uses_only_selected_sanitized_source(seeded_client, monkeypatch):
    cid, generation, result, source_hash = _sanitized_call(seeded_client)
    calls = _provider(seeded_client, monkeypatch)
    path = f'/api/conversations/{cid}/translation?targetLanguage=KZ&source=transcription&sourceHash={source_hash}'
    response = seeded_client.get(path)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['source'] == 'transcription' and data['sourceHash'] == source_hash
    assert [turn['idx'] for turn in data['turns']] == [41, 52]
    assert data['turns'][0]['text'] == 'KZ: Sanitized spoken greeting.'
    assert '[Код скрыт]' in data['turns'][1]['text']
    sent = json.loads(calls[0]['messages'][1]['content'])
    assert sent['turns'][1]['speaker'] == 'unknown'
    assert 'Canonical' not in calls[0]['messages'][1]['content']
    assert seeded_client.get(path).json() == data
    canonical = seeded_client.get(f'/api/conversations/{cid}/translation?targetLanguage=KZ')
    assert canonical.status_code == 200
    assert canonical.json()['source'] == 'canonical'
    assert canonical.json()['turns'][0]['text'] == 'KZ: Canonical greeting.'
    assert len(calls) == 2


def test_stt_retry_content_hash_and_expected_hash_guard(seeded_client, monkeypatch):
    cid, generation, result, old_hash = _sanitized_call(seeded_client)
    calls = _provider(seeded_client, monkeypatch)
    path = f'/api/conversations/{cid}/translation?targetLanguage=KZ&source=transcription'
    first = seeded_client.get(path + '&sourceHash=' + old_hash).json()
    result['turns'][0]['text'] = 'Changed sanitized greeting after retry.'
    assert seeded_client.app.state.stt.store.update(cid, generation, turns=result['turns'])
    payload = seeded_client.app.state.stt.transcription(cid)
    new_hash = translation_service.transcription_source_hash(payload)
    assert new_hash != old_hash
    stale = seeded_client.get(path + '&sourceHash=' + old_hash)
    assert stale.status_code == 409 and stale.json()['error']['code'] == 'stale_source'
    assert len(calls) == 1
    second = seeded_client.get(path + '&sourceHash=' + new_hash)
    assert second.status_code == 200
    assert second.json()['sourceHash'] == new_hash
    assert second.json()['turns'][0]['text'] != first['turns'][0]['text']
    assert len(calls) == 2
    canonical = seeded_client.get(f'/api/conversations/{cid}/translation?targetLanguage=KZ&sourceHash=wrong')
    assert canonical.status_code == 409
    assert len(calls) == 2


@pytest.mark.parametrize('status', ['queued', 'running', 'failed'])
def test_unready_stt_never_falls_back_to_canonical(seeded_client, monkeypatch, status):
    cid, generation, result, source_hash = _sanitized_call(seeded_client)
    calls = _provider(seeded_client, monkeypatch)
    assert seeded_client.app.state.stt.store.update(cid, generation, status=status)
    response = seeded_client.get(f'/api/conversations/{cid}/translation?targetLanguage=KZ&source=transcription&sourceHash={source_hash}')
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'stale_source'
    assert calls == []


def test_stt_no_key_uses_original_only_when_target_already_matches(seeded_client, monkeypatch):
    cid, generation, result, source_hash = _sanitized_call(seeded_client)

    async def should_not_use_canonical_fake(*_):
        pytest.fail('Canonical fixture translation must never be used for STT turns')

    monkeypatch.setattr(llm_switch.get_ai(), 'translate', should_not_use_canonical_fake)
    base = f'/api/conversations/{cid}/translation?source=transcription&sourceHash={source_hash}'
    same = seeded_client.get(base + '&targetLanguage=EN')
    assert same.status_code == 200
    assert same.json()['turns'] == [{'idx': t['idx'], 'text': t['text']} for t in result['turns']]
    other = seeded_client.get(base + '&targetLanguage=RU')
    assert other.status_code == 503
    assert other.json()['error']['code'] == 'translation_unavailable'


def test_stt_changed_while_request_runs_rejects_old_result(seeded_client, monkeypatch):
    cid, generation, result, source_hash = _sanitized_call(seeded_client)
    started = threading.Event()
    release = threading.Event()
    seeded_client.app.state.settings.openrouter_api_key = 'test-translation-key'

    async def slow(source, target, settings):
        started.set()
        while not release.is_set():
            await asyncio.sleep(.005)
        return translation_service.TranslationResult(
            [{'idx': t.idx, 'text': target + ': ' + t.text} for t in source.transcript], target, Usage(calls=1))

    monkeypatch.setattr(translation_service, 'translate', slow)
    path = f'/api/conversations/{cid}/translation?targetLanguage=RU&source=transcription&sourceHash={source_hash}'
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(seeded_client.get, path)
        assert started.wait(2)
        try:
            result['turns'][0]['text'] = 'A newly sanitized turn.'
            assert seeded_client.app.state.stt.store.update(cid, generation, turns=result['turns'])
        finally:
            release.set()
        response = future.result(timeout=3)
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'stale_source'


def _synthetic_long_source(count=59):
    return translation_service.TranslationSource('RU', [
        translation_service.SourceTurn(100 + index * 3, 'operator' if index % 2 else 'client',
                                       f'Реплика {index}: [Имя скрыто], код [Код скрыт].')
        for index in range(count)
    ])


def test_provider_schema_stays_small_for_a_59_turn_transcript(seeded_client, monkeypatch):
    calls = _provider(seeded_client, monkeypatch)
    for count in (1, 59):
        source = _synthetic_long_source(count)
        result = asyncio.run(translation_service.translate(source, 'EN', seeded_client.app.state.settings))
        validated = translation_service.validate_turns(result.turns, source)
        assert [turn['idx'] for turn in validated] == [turn.idx for turn in source.transcript]
        assert len(validated) == count
        assert all('[Имя скрыто]' in turn['text'] and '[Код скрыт]' in turn['text'] for turn in validated)
    assert len(calls) == 2
    schemas = [call['response_format']['json_schema'] for call in calls]
    assert schemas[0] == schemas[1]  # Neither grammar size nor constraints grow with turn count.
    assert schemas[1]['strict'] is True
    turns = schemas[1]['schema']['properties']['turns']
    assert 'minItems' not in turns and 'maxItems' not in turns
    assert turns['items']['properties']['idx'] == {'type': 'integer'}
    assert turns['items']['required'] == ['idx', 'text']
    assert len(json.loads(calls[1]['messages'][1]['content'])['turns']) == 59


@pytest.mark.parametrize('defect', ['missing', 'duplicate', 'unknown', 'redaction'])
def test_long_response_still_requires_exact_ids_count_and_masks(defect):
    source = _synthetic_long_source()
    translated = [{'idx': turn.idx, 'text': 'EN: ' + turn.text} for turn in source.transcript]
    if defect == 'missing':
        translated.pop()
    elif defect == 'duplicate':
        translated[-1] = dict(translated[0])  # Length remains correct, identity does not.
    elif defect == 'unknown':
        translated[-1]['idx'] = 99999
    elif defect == 'redaction':
        translated[-1]['text'] = translated[-1]['text'].replace('[Код скрыт]', '[Code hidden]')
    with pytest.raises(JudgeError):
        translation_service.validate_turns(translated, source)


def test_opaque_tokens_preserve_labels_repeated_masks_and_source_marker_literals(seeded_client, monkeypatch):
    calls = _provider(seeded_client, monkeypatch)
    source = translation_service.TranslationSource('RU', [
        translation_service.SourceTurn(7, 'system', '[автоответчик] Оставьте сообщение после ***.'),
        translation_service.SourceTurn(29, 'client', 'ИИН [ИИН скрыт], снова [ИИН скрыт], код ****.'),
        translation_service.SourceTurn(83, 'operator',
                                       'Символы __DA_MASK_deadbeef_0__, __da_mask, [метка __DA_MASK_].'),
    ])
    first = asyncio.run(translation_service.translate(source, 'EN', seeded_client.app.state.settings))
    second = asyncio.run(translation_service.translate(source, 'EN', seeded_client.app.state.settings))
    expected = [{'idx': turn.idx, 'text': 'EN: ' + turn.text} for turn in source.transcript]
    assert translation_service.validate_turns(first.turns, source) == expected
    assert translation_service.validate_turns(second.turns, source) == expected
    sent = json.loads(calls[0]['messages'][1]['content'])['turns']
    all_sent_text = ' '.join(turn['text'] for turn in sent)
    assert '[автоответчик]' not in all_sent_text
    assert '[ИИН скрыт]' not in all_sent_text and '***' not in all_sent_text
    assert 'deadbeef' not in all_sent_text and '__da_mask' not in all_sent_text
    tokens = re.findall(r'__DA_MASK_[0-9a-f]+_[0-9]+__', all_sent_text)
    assert len(tokens) == 8 and len(set(tokens)) == 8
    assert all(token not in json.dumps(first.turns) for token in tokens)
    assert calls[0]['messages'][1]['content'] != calls[1]['messages'][1]['content']


@pytest.mark.parametrize('defect', ['missing', 'duplicate', 'move', 'copy', 'wrong_nonce', 'unknown_index',
                                  'malformed', 'raw_label', 'case_change', 'invented_unmasked', 'partial_prefix'])
def test_damaged_or_moved_tokens_are_rejected_with_billing_and_no_cache(seeded_client, monkeypatch, defect):
    cid, generation, source, source_hash = _sanitized_call(seeded_client)

    def damage(payload, result):
        masked, plain = result['turns'][1], result['turns'][0]
        token, = re.findall(r'__DA_MASK_[0-9a-f]+_[0-9]+__', masked['text'])
        replacement = token
        if defect in ('missing', 'move'):
            replacement = ''
        elif defect == 'duplicate':
            replacement = token + token
        elif defect == 'wrong_nonce':
            replacement = re.sub(r'(?<=__DA_MASK_)[0-9a-f]', lambda m: '0' if m.group() != '0' else '1',
                                 token, count=1)
        elif defect == 'unknown_index':
            replacement = re.sub(r'_[0-9]+__$', '_999999__', token)
        elif defect == 'malformed':
            replacement = token[:-2]
        elif defect == 'raw_label':
            replacement = '[Код скрыт]'
        elif defect == 'case_change':
            replacement = token.lower()
        masked['text'] = masked['text'].replace(token, replacement)
        if defect in ('copy', 'move'):
            plain['text'] += token
        elif defect == 'invented_unmasked':
            plain['text'] += '__DA_MASK_deadbeef_0__'
        elif defect == 'partial_prefix':
            plain['text'] += '__DA_MASK_'
        payload['choices'][0]['message']['content'] = json.dumps(result)
        return payload

    calls = _provider(seeded_client, monkeypatch, damage)
    path = f'/api/conversations/{cid}/translation?targetLanguage=KZ&source=transcription&sourceHash={source_hash}'
    for _ in range(2):
        response = seeded_client.get(path)
        assert response.status_code == 502
        assert response.json()['error']['code'] == 'model_failed'
        assert '__DA_MASK' not in response.text
    assert len(calls) == 2
    cost, count = _cost(seeded_client)
    assert cost == pytest.approx(.00246) and count == 2
    with seeded_client.app.state.db.transaction() as conn:
        assert conn.execute("SELECT COUNT(*) FROM ai_cache WHERE kind='translation'").fetchone()[0] == 0


def test_source_token_collision_is_escaped_without_recursive_restoration(seeded_client, monkeypatch):
    colliding, fresh = 'a' * 24, 'b' * 24
    nonces = iter([colliding, fresh])
    monkeypatch.setattr(translation_service.secrets, 'token_hex', lambda length: next(nonces))
    source = translation_service.TranslationSource('RU', [
        translation_service.SourceTurn(9, 'client', f'Буквальная запись __DA_MASK_{colliding}_0__ и [ИИН скрыт].'),
    ])
    calls = _provider(seeded_client, monkeypatch)
    result = asyncio.run(translation_service.translate(source, 'EN', seeded_client.app.state.settings))
    assert translation_service.validate_turns(result.turns, source) == [
        {'idx': 9, 'text': 'EN: ' + source.transcript[0].text},
    ]
    assert f'__DA_MASK_{fresh}_0__' in calls[0]['messages'][1]['content']
    assert f'__DA_MASK_{fresh}_' not in result.turns[0]['text']


def test_literal_source_marker_cannot_gain_a_new_suffix_during_restoration(seeded_client, monkeypatch):
    source = translation_service.TranslationSource('RU', [
        translation_service.SourceTurn(9, 'client', 'Буквальная запись __DA_MASK_deadbeef_0__.'),
    ])

    def append_suffix(payload, result):
        result['turns'][0]['text'] = re.sub(r'(__DA_MASK_[0-9a-f]+_[0-9]+__)', r'\1_changed',
                                           result['turns'][0]['text'])
        payload['choices'][0]['message']['content'] = json.dumps(result)
        return payload

    calls = _provider(seeded_client, monkeypatch, append_suffix)
    result = asyncio.run(translation_service.translate(source, 'EN', seeded_client.app.state.settings))
    assert result.turns is None
    assert result.usage.calls == 1 and result.usage.cost_usd == pytest.approx(.00123)
    assert 'deadbeef' not in calls[0]['messages'][1]['content']
