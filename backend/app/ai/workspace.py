"""One bounded, structured assistant round with explicit transport receipts."""
import asyncio
import json
import math
from pathlib import Path

import httpx
from pydantic_core import from_json

from app.errors import JudgeError
from app.models import Usage

PROMPT = Path(__file__).with_name('prompts') / 'workspace' / 'assistant.txt'
REVIEW_PROMPT = PROMPT.with_name('review.txt')


def obj(properties):
    return {'type': 'object', 'additionalProperties': False,
            'properties': properties, 'required': list(properties)}


TEXT = {'type': 'string'}
NULL_TEXT = {'type': ['string', 'null']}
STEP_SCHEMA = obj({
    'factAudit': obj({
        'unansweredQuestions': {'type': 'array', 'maxItems': 8,
            'items': {'type': 'string', 'maxLength': 500}},
        'unsupportedDraftClaims': {'type': 'array', 'maxItems': 8,
            'items': {'type': 'string', 'maxLength': 500}},
        'attributionCorrections': {'type': 'array', 'maxItems': 8,
            'items': {'type': 'string', 'maxLength': 500}},
    }),
    'answer': {'type': 'string', 'maxLength': 8000},
    'toolCalls': {'type': 'array', 'maxItems': 3, 'items': obj({
        'name': {'type': 'string', 'enum': ['search_conversations', 'read_conversations',
                 'quality_overview', 'topic_breakdown', 'compare_checklists']},
        'useFocus': {'type': 'boolean'},
        'query': {'type': 'string', 'maxLength': 200},
        'filters': {'type': 'array', 'maxItems': 10, 'items': obj({
            'field': {'type': 'string', 'enum': ['scoreFrom', 'scoreTo', 'dateFrom', 'dateTo',
                       'languages', 'channels', 'status', 'attention', 'appealStatus']},
            'value': {'type': 'string', 'minLength': 1, 'maxLength': 200}})},
        'conversationIds': {'type': 'array', 'maxItems': 3, 'items': TEXT},
        'criterionId': NULL_TEXT,
        'topicId': NULL_TEXT,
        'resolutionStatus': {'type': 'string', 'enum': ['all', 'resolved', 'unresolved', 'unknown']},
        'limit': {'type': 'integer', 'minimum': 1, 'maximum': 15},
        'fromVersion': {'type': ['integer', 'null'], 'minimum': 1},
        'toVersion': {'type': ['integer', 'null'], 'minimum': 1},
    })},
    'sourceIds': {'type': 'array', 'maxItems': 10, 'items': TEXT},
    'actionIds': {'type': 'array', 'maxItems': 6, 'items': TEXT},
    'citations': {'type': 'array', 'maxItems': 8, 'items': obj({
        'sourceId': TEXT, 'turnIdx': {'type': 'integer', 'minimum': 0},
        'quote': {'type': 'string', 'minLength': 1, 'maxLength': 500},
    })},
})


def known_usage(raw):
    if not isinstance(raw, dict):
        return None
    if (type(raw.get('prompt_tokens')) is not int or type(raw.get('completion_tokens')) is not int
            or type(raw.get('cost')) not in (int, float) or not math.isfinite(raw['cost'])):
        return None
    try:
        return Usage(input_tokens=raw['prompt_tokens'], output_tokens=raw['completion_tokens'],
                     cost_usd=raw['cost'], calls=1)
    except ValueError:
        return None


def _partial_answer(raw):
    """Decode only a stable top-level answer prefix, including split escapes."""
    try:
        value = from_json(raw, allow_partial='trailing-strings')
    except ValueError:
        return None
    answer = value.get('answer') if isinstance(value, dict) else None
    return answer if isinstance(answer, str) else None


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('duplicate_json_field')
        value[key] = item
    return value


def _fact_audit(value):
    fields = {'unansweredQuestions', 'unsupportedDraftClaims', 'attributionCorrections'}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError('invalid_fact_audit')
    for items in value.values():
        if not isinstance(items, list) or len(items) > 8:
            raise ValueError('invalid_fact_audit')
        if any(not isinstance(item, str) or len(item) > 500 for item in items):
            raise ValueError('invalid_fact_audit')
    return value


def _review_audit_prefix(raw):
    """Require a complete audit before the top-level answer key, never replay it.

    Partial-JSON parsing intentionally cannot open this gate: it accepts an
    unfinished audit object or array. raw_decode only accepts completed values.
    """
    decoder = json.JSONDecoder(object_pairs_hook=_unique_object)
    position, audit, seen = 0, None, set()

    def whitespace(index):
        while index < len(raw) and raw[index] in ' \t\r\n':
            index += 1
        return index

    position = whitespace(position)
    if position == len(raw):
        return None
    if raw[position] != '{':
        raise ValueError('invalid_review_object')
    position += 1
    while True:
        position = whitespace(position)
        if position == len(raw):
            return None
        if raw[position] == '}':
            return audit
        try:
            key, position = decoder.raw_decode(raw, position)
        except json.JSONDecodeError:
            return None
        if not isinstance(key, str) or key in seen:
            raise ValueError('invalid_review_key')
        seen.add(key)
        if key == 'answer' and audit is None:
            raise ValueError('answer_before_fact_audit')
        position = whitespace(position)
        if position == len(raw):
            return None
        if raw[position] != ':':
            raise ValueError('invalid_review_separator')
        position = whitespace(position + 1)
        if key == 'answer':
            return audit
        try:
            value, position = decoder.raw_decode(raw, position)
        except json.JSONDecodeError:
            return None
        if key == 'factAudit':
            audit = _fact_audit(value)
        position = whitespace(position)
        if position == len(raw):
            return None
        if raw[position] == '}':
            return audit
        if raw[position] != ',':
            raise ValueError('invalid_review_separator')
        position += 1


async def _sse_data(lines):
    """Frame SSE events independently of HTTP chunks and content JSON."""
    data, size = [], 0
    async for line in lines:
        if line == '':
            if data:
                yield '\n'.join(data)
                data, size = [], 0
        elif line.startswith('data:'):
            value = line[5:]
            if value.startswith(' '):
                value = value[1:]
            data.append(value)
            size += len(value)
            if size > 200000:
                raise ValueError('event_too_large')
        # Comments, IDs and event names contain no completion text.
    if data:
        yield '\n'.join(data)


async def request_step(settings, data, on_attempt, on_delta=None):
    """The callback writes before sending and on every exit, including cancellation.

    Missing billing metadata remains None. A provider error is wrapped without an
    HTTP status attribute so the shared queue cannot silently retry it. Optional
    answer deltas are transient until the caller validates the final result.
    """
    model = getattr(settings, 'ai_model', '') or getattr(settings, 'judge_model', '')
    if not settings or not settings.openrouter_api_key or not model:
        raise JudgeError('Функция ИИ недоступна: настройте ключ и модель OpenRouter')
    reviewing = data.get('phase') == 'final_review'
    prompt = REVIEW_PROMPT if reviewing else PROMPT
    body = {'model': model, 'messages': [
        {'role': 'system', 'content': prompt.read_text(encoding='utf-8')},
        {'role': 'user', 'content': json.dumps(data, ensure_ascii=False, allow_nan=False)}],
        'temperature': 0, 'reasoning': {'effort': 'low'}, 'max_tokens': 8192,
        'stream': on_delta is not None, 'usage': {'include': True},
        'provider': {'require_parameters': True},
        **({'stream_options': {'include_usage': True}} if on_delta is not None else {}),
        'response_format': {'type': 'json_schema', 'json_schema': {
            'name': 'quality_workspace_assistant', 'strict': True, 'schema': STEP_SCHEMA}}}
    usage, sent, status, provider = None, False, 'failed', None

    def capture_metadata(payload):
        nonlocal usage, provider
        if isinstance(payload, dict):
            if payload.get('usage') is not None:
                received_usage = known_usage(payload['usage'])
                if received_usage is not None:
                    usage = received_usage  # A malformed later event cannot erase a bill.
            if isinstance(payload.get('provider'), str):
                provider = payload['provider']

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.model_timeout, connect=15),
                                     follow_redirects=False, trust_env=False) as client:
            on_attempt({'stage': 'sending', 'model': model})
            sent = True
            url = 'https://openrouter.ai/api/v1/chat/completions'
            headers = {'Authorization': 'Bearer ' + settings.openrouter_api_key}
            emitted = ''
            if on_delta is None:
                response = await client.post(url, json=body, headers=headers)
                # Error envelopes can also report a bill. Parse it before status.
                try:
                    payload = response.json()
                except ValueError:
                    payload = None
                capture_metadata(payload)
                response.raise_for_status()
                if not isinstance(payload, dict):
                    raise ValueError('invalid_payload')
                choice = payload['choices'][0]
                if not isinstance(choice, dict) or not isinstance(choice.get('message'), dict):
                    raise ValueError('invalid_choice')
                message = choice['message']
                if choice.get('finish_reason') != 'stop' or message.get('refusal'):
                    raise ValueError('incomplete_response')
                raw = message.get('content')
                if not isinstance(raw, str):
                    raise ValueError('invalid_content')
            else:
                raw, finish_reason, finished, refused = '', None, False, False
                async with client.stream('POST', url, json=body, headers=headers) as response:
                    if not response.is_success or 'application/json' in response.headers.get('content-type', ''):
                        await response.aread()
                        try:
                            capture_metadata(response.json())
                        except ValueError:
                            pass
                        response.raise_for_status()
                        raise ValueError('invalid_stream_response')
                    async for content in _sse_data(response.aiter_lines()):
                        if content.strip() == '[DONE]':
                            break
                        payload = json.loads(content)
                        if not isinstance(payload, dict):
                            raise ValueError('invalid_payload')
                        capture_metadata(payload)
                        if payload.get('error'):
                            raise ValueError('provider_error')
                        choices = payload.get('choices', [])
                        if not isinstance(choices, list):
                            raise ValueError('invalid_choices')
                        for choice in choices:
                            if not isinstance(choice, dict):
                                raise ValueError('invalid_choice')
                            if choice.get('index', 0) != 0:
                                continue
                            delta = choice.get('delta')
                            if delta is None:
                                delta = {}
                            if not isinstance(delta, dict):
                                raise ValueError('invalid_delta')
                            refused = refused or bool(delta.get('refusal'))
                            text = delta.get('content')
                            if text is not None:
                                if not isinstance(text, str) or finished and text:
                                    raise ValueError('invalid_delta')
                                raw += text
                                if len(raw) > 200000:
                                    raise ValueError('response_too_large')
                                audit_ready = not reviewing or _review_audit_prefix(raw) is not None
                                answer = _partial_answer(raw) if audit_ready else None
                                if answer is not None and not refused:
                                    if len(answer) > STEP_SCHEMA['properties']['answer']['maxLength']:
                                        raise ValueError('answer_too_large')
                                    if not answer.startswith(emitted):
                                        raise ValueError('answer_prefix_changed')
                                    if len(answer) > len(emitted):
                                        new_text, emitted = answer[len(emitted):], answer
                                        await on_delta(new_text)
                            if choice.get('finish_reason') is not None:
                                if finished and finish_reason != choice['finish_reason']:
                                    raise ValueError('conflicting_finish_reason')
                                finish_reason, finished = choice['finish_reason'], True
                if not finished or finish_reason != 'stop' or refused:
                    raise ValueError('interrupted_stream')
            value = json.loads(raw, object_pairs_hook=_unique_object) if reviewing else json.loads(raw)
            if not isinstance(value, dict):
                raise ValueError('invalid_response')
            if reviewing:
                audit = _fact_audit(value.get('factAudit'))
                if on_delta is not None and _review_audit_prefix(raw) != audit:
                    raise ValueError('missing_review_prefix')
            if emitted and (not isinstance(value.get('answer'), str) or not value['answer'].startswith(emitted)):
                raise ValueError('answer_prefix_changed')
            status = 'received'
            return {'value': value, 'usage': usage}
    except asyncio.CancelledError:
        status = 'interrupted'
        raise
    except httpx.HTTPError as exc:
        raise JudgeError('Сервис ИИ не ответил. Повторите запрос позже') from exc
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        raise JudgeError('Сервис ИИ вернул незавершённый или некорректный ответ') from exc
    finally:
        if sent:
            on_attempt({'stage': 'finished', 'status': status, 'usage': usage,
                        'model': model, 'provider': provider})
