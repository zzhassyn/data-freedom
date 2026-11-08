"""Provider envelopes and actual dispatch/cancellation receipt boundaries."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.ai import workspace as provider
from app.errors import JudgeError


def settings():
    return SimpleNamespace(ai_model='google/gemini-3.8-flash', judge_model='',
                           openrouter_api_key='unit-test-key', model_timeout=10)


def envelope(**changes):
    return {'model': 'google/gemini-3.8-flash', 'provider': 'test',
        'usage': {'prompt_tokens': 10, 'completion_tokens': 20, 'cost': .003},
        'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({'answer': 'Ответ'})}}], **changes}


def client_with(monkeypatch, handler):
    client = httpx.AsyncClient
    monkeypatch.setattr(provider.httpx, 'AsyncClient', lambda **kwargs: client(
        **kwargs, transport=httpx.MockTransport(handler)))


def test_provider_sends_exact_profile_and_reports_known_usage(monkeypatch):
    seen, events = [], []
    def handler(request):
        assert events[0]['stage'] == 'sending'
        body = json.loads(request.content)
        assert body['model'] == 'google/gemini-3.8-flash'
        assert body['response_format']['json_schema']['strict'] is True
        assert body['reasoning'] == {'effort': 'low'}
        assert body['max_tokens'] == 8192
        assert 'untrusted data' in body['messages'][0]['content']
        seen.append(body)
        return httpx.Response(200, json=envelope())
    client_with(monkeypatch, handler)
    result = asyncio.run(provider.request_step(settings(), {'message': 'Вопрос'}, events.append))
    assert result['usage'].cost_usd == .003
    assert len(seen) == 1 and [e['stage'] for e in events] == ['sending', 'finished']
    assert events[-1]['status'] == 'received'


@pytest.mark.parametrize('raw_usage', [None, {}, {'prompt_tokens': 1, 'completion_tokens': 2},
    {'prompt_tokens': 1, 'completion_tokens': 2, 'cost': -1},
    {'prompt_tokens': True, 'completion_tokens': 2, 'cost': 0}])
def test_valid_answer_with_unknown_usage_does_not_invent_free_request(monkeypatch, raw_usage):
    events = []
    client_with(monkeypatch, lambda request: httpx.Response(200, json=envelope(usage=raw_usage)))
    result = asyncio.run(provider.request_step(settings(), {}, events.append))
    assert result['usage'] is None
    assert events[-1]['usage'] is None and events[-1]['status'] == 'received'


@pytest.mark.parametrize('choices', [None, [], [None], [{'message': None}],
    [{'finish_reason': 'stop', 'message': {'content': {}}}],
    [{'finish_reason': 'length', 'message': {'content': '{}'}}],
    [{'finish_reason': 'stop', 'message': {'content': 'not json'}}]])
def test_malformed_response_is_controlled_and_billed_usage_survives(monkeypatch, choices):
    events = []
    client_with(monkeypatch, lambda request: httpx.Response(200, json=envelope(choices=choices)))
    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {}, events.append))
    assert events[-1]['status'] == 'failed' and events[-1]['usage'].cost_usd == .003


def test_http429_is_not_exposed_for_shared_queue_retry(monkeypatch):
    events, requests = [], []
    def handler(request):
        requests.append(request)
        return httpx.Response(429, json={'error': {'message': 'busy'}})
    client_with(monkeypatch, handler)
    with pytest.raises(JudgeError) as failure:
        asyncio.run(provider.request_step(settings(), {}, events.append))
    assert not hasattr(failure.value, 'response') and not hasattr(failure.value, 'status_code')
    assert len(requests) == 1 and events[-1]['usage'] is None


def test_provider_cancellation_finishes_unknown_receipt(monkeypatch):
    events = []
    async def scenario():
        started = asyncio.Event()
        async def handler(request):
            started.set()
            await asyncio.Event().wait()
        client_with(monkeypatch, handler)
        task = asyncio.create_task(provider.request_step(settings(), {}, events.append))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(scenario())
    assert [event['stage'] for event in events] == ['sending', 'finished']
    assert events[-1]['status'] == 'interrupted' and events[-1]['usage'] is None


def test_before_send_receipt_failure_prevents_network(monkeypatch):
    def handler(request):
        pytest.fail('A missing durable receipt must prevent dispatch')
    client_with(monkeypatch, handler)
    def callback(event):
        raise JudgeError('storage unavailable')
    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {}, callback))


def test_unknown_nonfinite_cost_is_never_accepted():
    assert provider.known_usage({'prompt_tokens': 1, 'completion_tokens': 2, 'cost': float('inf')}) is None
    assert provider.known_usage({'prompt_tokens': 1, 'completion_tokens': 2, 'cost': float('nan')}) is None


KNOWN_USAGE = {'prompt_tokens': 10, 'completion_tokens': 20, 'cost': .003}


def sse(payload):
    return ('data: ' + json.dumps(payload, ensure_ascii=False) + '\n\n').encode('utf-8')


def chunk(text=None, finish=None, **extra):
    return {'choices': [{'index': 0, 'delta': {} if text is None else {'content': text},
                         'finish_reason': finish}], **extra}


class Stream(httpx.AsyncByteStream):
    def __init__(self, pieces):
        self.pieces = pieces
        self.closed = False

    async def __aiter__(self):
        for piece in self.pieces:
            if isinstance(piece, BaseException):
                raise piece
            yield piece

    async def aclose(self):
        self.closed = True


def streaming_client(monkeypatch, stream, requests=None, events=None):
    def handler(request):
        if events is not None:
            assert events[0]['stage'] == 'sending'
        if requests is not None:
            requests.append(json.loads(request.content))
        return httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=stream)
    client_with(monkeypatch, handler)


def test_stream_emits_before_next_provider_chunk_and_reads_trailing_usage(monkeypatch):
    events, deltas, requests = [], [], []

    async def scenario():
        first_delta = asyncio.Event()

        class GatedStream(Stream):
            async def __aiter__(self):
                yield b': keep-alive\n\n' + sse(chunk('{"answer":"При'))
                await asyncio.wait_for(first_delta.wait(), .5)
                assert deltas == ['При']
                yield sse(chunk('вет"}'))
                yield sse(chunk(finish='stop'))
                yield sse({'choices': [], 'provider': 'stream-test', 'usage': KNOWN_USAGE})
                yield b'data: [DONE]\n\n'

        async def on_delta(text):
            assert not stream.closed
            deltas.append(text)
            first_delta.set()

        stream = GatedStream([])
        streaming_client(monkeypatch, stream, requests, events)
        result = await provider.request_step(settings(), {}, events.append, on_delta)
        assert stream.closed
        assert result['value'] == {'answer': 'Привет'}
        assert result['usage'].cost_usd == .003

    asyncio.run(scenario())
    assert deltas == ['При', 'вет']  # No full-answer replay after completion.
    assert len(requests) == 1
    body = requests[0]
    assert body['stream'] is True and body['stream_options'] == {'include_usage': True}
    assert body['model'] == settings().ai_model and body['max_tokens'] == 8192
    assert body['reasoning'] == {'effort': 'low'} and body['temperature'] == 0
    assert body['response_format']['json_schema']['strict'] is True
    assert [event['stage'] for event in events] == ['sending', 'finished']
    assert events[-1]['status'] == 'received' and events[-1]['provider'] == 'stream-test'


@pytest.mark.parametrize('ascii_json', [False, True])
def test_stream_decodes_split_quotes_slashes_unicode_and_http_bytes(monkeypatch, ascii_json):
    answer = 'Казахша қазақша: "сәлем" \\ жол\n😀'
    raw = json.dumps({'toolCalls': [{'answer': 'do not emit nested text'}], 'answer': answer},
                     ensure_ascii=ascii_json)
    wire = b''.join(sse(chunk(character)) for character in raw)
    wire += sse(chunk(finish='stop')) + sse({'choices': [], 'usage': KNOWN_USAGE}) + b'data: [DONE]\n\n'
    # Arbitrary HTTP boundaries split UTF-8 sequences and the SSE envelope too.
    stream = Stream([wire[index:index + 7] for index in range(0, len(wire), 7)])
    streaming_client(monkeypatch, stream)
    deltas = []

    async def on_delta(text):
        assert text
        assert all(not 0xD800 <= ord(character) <= 0xDFFF for character in text)
        deltas.append(text)

    result = asyncio.run(provider.request_step(settings(), {}, lambda event: None, on_delta))
    assert ''.join(deltas) == answer == result['value']['answer']
    assert 'do not emit nested text' not in ''.join(deltas)


@pytest.mark.parametrize('raw_usage', [None, {}, {'prompt_tokens': 1, 'completion_tokens': 2},
    {'prompt_tokens': 1, 'completion_tokens': 2, 'cost': -1}])
def test_stream_missing_or_invalid_usage_remains_unknown(monkeypatch, raw_usage):
    events, deltas = [], []
    stream = Stream([sse(chunk('{"answer":"ok"}', finish='stop')),
                     sse({'choices': [], 'usage': raw_usage}), b'data: [DONE]\n\n'])
    streaming_client(monkeypatch, stream)

    async def on_delta(text):
        deltas.append(text)

    result = asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert deltas == ['ok'] and result['usage'] is None
    assert events[-1]['status'] == 'received' and events[-1]['usage'] is None


@pytest.mark.parametrize('ending', [
    [sse(chunk('"', finish='stop'))],  # Completed string, incomplete object.
    [sse(chunk('"}', finish='length'))],
    [sse(chunk('"}'))],  # EOF/[DONE] without a finish reason.
    [sse(chunk('"}')), sse({'choices': [{'index': 0, 'delta': {'refusal': 'no'}, 'finish_reason': 'stop'}]})],
])
def test_stream_invalid_final_keeps_partial_and_final_usage_without_fake_success(monkeypatch, ending):
    events, deltas, requests = [], [], []
    stream = Stream([sse(chunk('{"answer":"partial')), *ending,
                     sse({'choices': [], 'usage': KNOWN_USAGE}), b'data: [DONE]\n\n'])
    streaming_client(monkeypatch, stream, requests)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert deltas == ['partial'] and stream.closed and len(requests) == 1
    assert [event['stage'] for event in events] == ['sending', 'finished']
    assert events[-1]['status'] == 'failed' and events[-1]['usage'].cost_usd == .003


@pytest.mark.parametrize('bad_event', [b'data: not-json\n\n',
    sse({'error': {'message': 'upstream failed'}, 'usage': KNOWN_USAGE}),
    sse({'choices': [{'index': 0, 'delta': {'content': []}}]})])
def test_stream_malformed_or_error_event_is_controlled_and_never_retried(monkeypatch, bad_event):
    events, deltas, requests = [], [], []
    stream = Stream([sse(chunk('{"answer":"partial', usage=KNOWN_USAGE)), bad_event])
    streaming_client(monkeypatch, stream, requests)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError) as failure:
        asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert not hasattr(failure.value, 'response')
    assert deltas == ['partial'] and len(requests) == 1 and stream.closed
    assert events[-1]['status'] == 'failed' and events[-1]['usage'].cost_usd == .003


def test_stream_rejects_rewritten_answer_instead_of_appending_mixed_text(monkeypatch):
    events, deltas = [], []
    stream = Stream([sse(chunk('{"answer":"first"')),
                     sse(chunk(',"answer":"different"}', finish='stop'))])
    streaming_client(monkeypatch, stream)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert deltas == ['first'] and events[-1]['status'] == 'failed'


def test_stream_malformed_later_usage_does_not_erase_received_bill(monkeypatch):
    events, deltas = [], []
    stream = Stream([sse(chunk('{"answer":"partial', usage=KNOWN_USAGE)),
                     sse({'choices': [], 'usage': {}}), b'data: invalid-json\n\n'])
    streaming_client(monkeypatch, stream)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert deltas == ['partial']
    assert events[-1]['status'] == 'failed' and events[-1]['usage'].cost_usd == .003


def test_stream_cancellation_closes_response_and_preserves_unknown_receipt(monkeypatch):
    events, deltas = [], []

    async def scenario():
        partial_received = asyncio.Event()

        class WaitingStream(Stream):
            async def __aiter__(self):
                yield sse(chunk('{"answer":"partial'))
                await asyncio.Event().wait()

        async def on_delta(text):
            deltas.append(text)
            partial_received.set()

        stream = WaitingStream([])
        streaming_client(monkeypatch, stream)
        task = asyncio.create_task(provider.request_step(settings(), {}, events.append, on_delta))
        await asyncio.wait_for(partial_received.wait(), .5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert stream.closed

    asyncio.run(scenario())
    assert deltas == ['partial']
    assert [event['stage'] for event in events] == ['sending', 'finished']
    assert events[-1]['status'] == 'interrupted' and events[-1]['usage'] is None


@pytest.mark.parametrize('failure_type', [httpx.ReadError, httpx.ReadTimeout])
def test_stream_disconnect_or_timeout_keeps_partial_and_unknown_receipt(monkeypatch, failure_type):
    events, deltas, requests = [], [], []
    stream = Stream([sse(chunk('{"answer":"partial')), failure_type('connection ended')])
    streaming_client(monkeypatch, stream, requests)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError) as failure:
        asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert not hasattr(failure.value, 'response') and not hasattr(failure.value, 'status_code')
    assert deltas == ['partial'] and len(requests) == 1 and stream.closed
    assert events[-1]['status'] == 'failed' and events[-1]['usage'] is None


@pytest.mark.parametrize('excess', [
    [sse(chunk('{"answer":"' + 'a' * 8001))],
    [sse(chunk('{"other":"' + 'a' * 100000)), sse(chunk('a' * 100001))],
    [b'data: ' + b'a' * 200001 + b'\n\n'],
])
def test_stream_bounds_answer_response_and_sse_event_size(monkeypatch, excess):
    events, deltas = [], []
    streaming_client(monkeypatch, Stream(excess))

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert deltas == [] and events[-1]['status'] == 'failed'


def test_stream_http_error_preserves_billing_without_retry(monkeypatch):
    events, requests = [], []

    def handler(request):
        requests.append(request)
        return httpx.Response(429, json={'error': {'message': 'busy'}, 'usage': KNOWN_USAGE,
                                        'provider': 'stream-test'})

    async def on_delta(text):
        pytest.fail('HTTP errors cannot emit answer text')

    client_with(monkeypatch, handler)
    with pytest.raises(JudgeError) as failure:
        asyncio.run(provider.request_step(settings(), {}, events.append, on_delta))
    assert len(requests) == 1 and not hasattr(failure.value, 'response')
    assert events[-1]['status'] == 'failed' and events[-1]['usage'].cost_usd == .003
    assert events[-1]['provider'] == 'stream-test'


def test_stream_durable_receipt_failure_prevents_dispatch(monkeypatch):
    def handler(request):
        pytest.fail('A missing durable receipt must prevent streaming dispatch')

    def on_attempt(event):
        raise JudgeError('storage unavailable')

    async def on_delta(text):
        pytest.fail('No request was sent')

    client_with(monkeypatch, handler)
    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {}, on_attempt, on_delta))


FACT_AUDIT = {'unansweredQuestions': ['Private unresolved condition'],
              'unsupportedDraftClaims': ['Private unsupported claim'],
              'attributionCorrections': []}


@pytest.fixture
def review_prompt(monkeypatch, tmp_path):
    path = tmp_path / 'review.txt'
    path.write_text('Dedicated review prompt for the provider test.', encoding='utf-8')
    monkeypatch.setattr(provider, 'REVIEW_PROMPT', path)
    return path.read_text(encoding='utf-8')


def test_review_stream_requires_closed_audit_then_emits_early_answer_only(monkeypatch, review_prompt):
    events, deltas, requests = [], [], []

    async def scenario():
        received = asyncio.Event()

        class AuditStream(Stream):
            async def __aiter__(self):
                # All fields exist, but the audit object itself is still open.
                yield sse(chunk('{"factAudit":' + json.dumps(FACT_AUDIT)[:-1]))
                assert deltas == []
                yield sse(chunk('},'))
                assert deltas == []
                yield sse(chunk('"answer":"Уточните '))
                await asyncio.wait_for(received.wait(), .5)
                assert deltas == ['Уточните ']
                yield sse(chunk('условие."}', finish='stop'))
                yield sse({'choices': [], 'usage': KNOWN_USAGE})
                yield b'data: [DONE]\n\n'

        async def on_delta(text):
            deltas.append(text)
            received.set()

        stream = AuditStream([])
        streaming_client(monkeypatch, stream, requests, events)
        result = await provider.request_step(settings(), {'phase': 'final_review'}, events.append, on_delta)
        assert result['value']['factAudit'] == FACT_AUDIT
        assert result['value']['answer'] == 'Уточните условие.'
        assert result['usage'].cost_usd == .003 and stream.closed

    asyncio.run(scenario())
    assert deltas == ['Уточните ', 'условие.']
    assert requests[0]['messages'][0]['content'] == review_prompt
    assert events[-1]['status'] == 'received'
    assert [event['stage'] for event in events] == ['sending', 'finished']
    assert 'Private' not in ''.join(deltas)


@pytest.mark.parametrize('pieces', [
    ['{"answer":"blocked","factAudit":' + json.dumps(FACT_AUDIT) + '}'],
    ['{"ans', 'wer":'],
    ['{"nested":{"factAudit":' + json.dumps(FACT_AUDIT) + '},"answer":"blocked"}'],
])
def test_review_stream_rejects_answer_before_audit_without_buffered_replay(monkeypatch, review_prompt, pieces):
    events, deltas, requests = [], [], []
    stream = Stream([sse({'choices': [], 'usage': KNOWN_USAGE}),
                     *(sse(chunk(text)) for text in pieces), sse(chunk(finish='stop')),
                     b'data: [DONE]\n\n'])
    streaming_client(monkeypatch, stream, requests)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, events.append, on_delta))
    assert deltas == [] and len(requests) == 1 and stream.closed
    assert events[-1]['status'] == 'failed' and events[-1]['usage'].cost_usd == .003


@pytest.mark.parametrize('audit', [
    None, {},
    {**FACT_AUDIT, 'extra': []},
    {**FACT_AUDIT, 'unansweredQuestions': 'not a list'},
    {**FACT_AUDIT, 'unansweredQuestions': ['x'] * 9},
    {**FACT_AUDIT, 'unsupportedDraftClaims': ['x' * 501]},
    {**FACT_AUDIT, 'attributionCorrections': [1]},
])
def test_review_stream_rejects_invalid_audit_before_answer(monkeypatch, review_prompt, audit):
    events, deltas = [], []
    raw = json.dumps({'factAudit': audit, 'answer': 'must not appear'})
    stream = Stream([sse(chunk(raw, finish='stop', usage=KNOWN_USAGE)), b'data: [DONE]\n\n'])
    streaming_client(monkeypatch, stream)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, events.append, on_delta))
    assert deltas == [] and events[-1]['status'] == 'failed'
    assert events[-1]['usage'].cost_usd == .003


def test_review_stream_handles_escaped_audit_text_keys_and_answer_boundaries(monkeypatch, review_prompt):
    audit = {**FACT_AUDIT, 'unansweredQuestions': ['Quoted "answer": { } \\ and 😀 text']}
    answer = 'Сұрақ: "қалай"?\n😀'
    raw = json.dumps({'factAudit': audit, 'answer': answer}, ensure_ascii=True, indent=2)
    raw = raw.replace('"factAudit"', '"fact\\u0041udit"', 1)
    stream = Stream([*(sse(chunk(character)) for character in raw), sse(chunk(finish='stop')),
                     sse({'choices': [], 'usage': KNOWN_USAGE}), b'data: [DONE]\n\n'])
    streaming_client(monkeypatch, stream)
    deltas = []

    async def on_delta(text):
        assert all(not 0xD800 <= ord(character) <= 0xDFFF for character in text)
        deltas.append(text)

    result = asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, lambda event: None, on_delta))
    assert ''.join(deltas) == answer
    assert result['value']['factAudit'] == audit
    assert 'Quoted' not in ''.join(deltas)


@pytest.mark.parametrize('raw', [
    '{"factAudit":' + json.dumps(FACT_AUDIT) + ' "answer":"blocked"}',
    '{"factAudit":' + json.dumps(FACT_AUDIT)[:-1] + ',"answer":"nested, not user-facing"}',
    '{"toolCalls":[]}',
])
def test_review_stream_missing_or_unclosed_audit_never_emits_answer(monkeypatch, review_prompt, raw):
    events, deltas = [], []
    stream = Stream([sse(chunk(raw, finish='stop')),
                     sse({'choices': [], 'usage': KNOWN_USAGE}), b'data: [DONE]\n\n'])
    streaming_client(monkeypatch, stream)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, events.append, on_delta))
    assert deltas == [] and events[-1]['status'] == 'failed'


@pytest.mark.parametrize('duplicate', ['factAudit', 'answer'])
def test_review_final_duplicate_fields_fail_after_provisional_text(monkeypatch, review_prompt, duplicate):
    events, deltas = [], []
    prefix = '{"factAudit":' + json.dumps(FACT_AUDIT) + ',"answer":"partial"'
    value = FACT_AUDIT if duplicate == 'factAudit' else 'partial'
    tail = ',' + json.dumps(duplicate) + ':' + json.dumps(value) + '}'
    stream = Stream([sse(chunk(prefix)), sse(chunk(tail, finish='stop')),
                     sse({'choices': [], 'usage': KNOWN_USAGE}), b'data: [DONE]\n\n'])
    streaming_client(monkeypatch, stream)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, events.append, on_delta))
    assert deltas == ['partial']
    assert events[-1]['status'] == 'failed' and events[-1]['usage'].cost_usd == .003


def test_review_gate_error_keeps_earlier_bill_despite_invalid_later_usage(monkeypatch, review_prompt):
    events, deltas = [], []
    stream = Stream([sse({'choices': [], 'usage': KNOWN_USAGE}),
                     sse(chunk('{"factAudit":{},"answer":"blocked"}', usage={}))])
    streaming_client(monkeypatch, stream)

    async def on_delta(text):
        deltas.append(text)

    with pytest.raises(JudgeError):
        asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, events.append, on_delta))
    assert deltas == [] and events[-1]['status'] == 'failed'
    assert events[-1]['usage'].cost_usd == .003


@pytest.mark.parametrize('audit', [FACT_AUDIT, None])
def test_nonstream_review_uses_dedicated_prompt_and_validates_final_audit(monkeypatch, review_prompt, audit):
    events, requests = [], []

    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        assert body['stream'] is False and 'stream_options' not in body
        assert body['messages'][0]['content'] == review_prompt
        return httpx.Response(200, json=envelope(choices=[{'finish_reason': 'stop', 'message': {
            'content': json.dumps({'answer': 'Ответ', 'factAudit': audit})}}]))

    client_with(monkeypatch, handler)
    if audit is None:
        with pytest.raises(JudgeError):
            asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, events.append))
        assert events[-1]['status'] == 'failed'
    else:
        result = asyncio.run(provider.request_step(settings(), {'phase': 'final_review'}, events.append))
        assert result['value'] == {'answer': 'Ответ', 'factAudit': FACT_AUDIT}
        assert events[-1]['status'] == 'received'
    assert len(requests) == 1 and events[-1]['usage'].cost_usd == .003
