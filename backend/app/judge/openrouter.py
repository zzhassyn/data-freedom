"""Bounded OpenRouter judge: one criterion, validated evidence, actual billed usage."""
import asyncio
import hashlib
import json
import math
import time
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError

from app.errors import ApiError, JudgeError
from app.models import Answer, Conversation, Criterion, JudgeResult, Usage
from .hints import build_hints, contact_na_allowed, criterion_clarification

IS_FAKE = False
_settings = None
_PROMPTS = Path(__file__).with_name('prompts')


def configure(settings):
    global _settings
    _settings = settings


def configured_model():
    return getattr(_settings, 'judge_model', '')


def cache_identity():
    """Invalidate derived answers after a provider, model or instruction change."""
    parts = [configured_model(), getattr(_settings, 'judge_output_mode', 'tool'),
             str(getattr(_settings, 'judge_temperature', 0)),
             Path(__file__).read_text(encoding='utf-8'),
             Path(__file__).with_name('hints.py').read_text(encoding='utf-8')]
    parts.extend(path.read_text(encoding='utf-8') for path in sorted(_PROMPTS.glob('*.md')))
    return 'openrouter:' + hashlib.sha256('\n'.join(parts).encode('utf-8')).hexdigest()


class OpenRouterJudgeError(JudgeError):
    """A safe failure retaining charges from already completed provider calls."""
    def __init__(self, message, usage=None, latency_ms=0, model=''):
        super().__init__(message)
        self.usage = usage or Usage()
        self.latency_ms = latency_ms
        self.model = model


class _Evidence(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    turn_idx: StrictInt = Field(ge=0)
    quote: str = Field(min_length=1, max_length=200)
    kind: Literal['supports', 'expected_here']


class _Verdict(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    answer: Answer
    explanation: str = Field(min_length=1, max_length=3000)
    evidence: list[_Evidence]
    checked_range: list[StrictInt] | None = Field(min_length=2, max_length=2)
    na_reason: str | None
    flag_types: list[str] | None
    confidence: Literal['high', 'medium', 'low']


def verdict_schema(conversation, criterion):
    """The grammar follows the current rule, including newly authored criteria."""
    allow_na = criterion.na_allowed or contact_na_allowed(conversation, criterion)
    if criterion.type == 'scale':
        answer = {'type': 'number', 'enum': [step.value for step in criterion.scale or []]}
        if allow_na:
            answer = {'anyOf': [answer, {'type': 'string', 'enum': ['na']}]}
    else:
        answer = {'type': 'string', 'enum': ['yes', 'no'] + (['na'] if allow_na else [])}
    properties = {
        'answer': answer,
        'explanation': {'type': 'string'},
        'evidence': {'type': 'array', 'items': {
            'type': 'object', 'additionalProperties': False,
            'properties': {'turn_idx': {'type': 'integer'}, 'quote': {'type': 'string'},
                           'kind': {'type': 'string', 'enum': ['supports', 'expected_here']}},
            'required': ['turn_idx', 'quote', 'kind']}},
        'checked_range': {'type': ['array', 'null'], 'items': {'type': 'integer'}},
        'na_reason': {'type': ['string', 'null']},
        'flag_types': {'type': ['array', 'null'], 'items': {'type': 'string'}},
        'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']},
    }
    return {'type': 'object', 'additionalProperties': False, 'properties': properties,
            'required': list(properties)}


def _messages(conversation, criterion):
    return [
        {'role': 'system', 'content': (_PROMPTS / 'system.md').read_text(encoding='utf-8')},
        {'role': 'user', 'content': json.dumps({
            'criterion': criterion.model_dump(by_alias=True),
            'originalCriterionClarification': criterion_clarification(criterion),
            'contactNaAllowed': contact_na_allowed(conversation, criterion),
            'hints': build_hints(conversation),
            'conversation': {'channel': conversation.channel, 'language': conversation.language,
                             'transcript': [turn.model_dump(by_alias=True) for turn in conversation.transcript]},
        }, ensure_ascii=False)},
    ]


def _usage(payload):
    raw = payload['usage']
    incoming, outgoing, cost = raw['prompt_tokens'], raw['completion_tokens'], raw['cost']
    if (type(incoming) is not int or type(outgoing) is not int or incoming < 0 or outgoing < 0
            or isinstance(cost, bool) or not isinstance(cost, (int, float))
            or not math.isfinite(cost) or cost < 0):
        raise ValueError('invalid_usage')
    return Usage(input_tokens=incoming, output_tokens=outgoing, cost_usd=cost, calls=1)


def _completion(payload, mode):
    choices = payload['choices']
    if not isinstance(choices, list) or len(choices) != 1:
        raise ValueError('invalid_choices')
    choice = choices[0]
    if not isinstance(choice, dict) or not isinstance(choice.get('message'), dict):
        raise ValueError('invalid_choice')
    if mode == 'schema':
        if choice.get('finish_reason') != 'stop':
            raise ValueError('incomplete')
        raw = choice['message']['content']
    else:
        if choice.get('finish_reason') not in ('tool_calls', 'stop'):
            raise ValueError('incomplete')
        calls = choice['message']['tool_calls']
        if (not isinstance(calls, list) or len(calls) != 1 or not isinstance(calls[0], dict)
                or calls[0].get('type') != 'function' or not isinstance(calls[0].get('function'), dict)
                or calls[0]['function'].get('name') != 'submit_verdict'):
            raise ValueError('invalid_tool')
        raw = calls[0]['function']['arguments']
    if not isinstance(raw, str):
        raise ValueError('invalid_arguments')
    return _Verdict.model_validate(json.loads(raw))


async def judge(conversation: Conversation, criterion: Criterion) -> JudgeResult:
    settings = _settings
    if settings is None or not settings.openrouter_api_key or not settings.judge_model:
        raise OpenRouterJudgeError('Модель оценки не настроена. Проверьте ключ и название модели')
    mode = getattr(settings, 'judge_output_mode', 'tool')
    if mode not in ('tool', 'schema'):
        raise OpenRouterJudgeError('Формат ответа модели не настроен')
    if not math.isfinite(settings.model_timeout) or settings.model_timeout <= 0:
        raise OpenRouterJudgeError('Время ожидания модели оценки не настроено')
    started = time.monotonic()
    # Finish inside the queue's outer deadline so we can return prior billed
    # usage on timeout instead of losing it to the queue's cancellation.
    deadline = started + settings.model_timeout - min(.5, settings.model_timeout * .05)
    timeout_message = 'Истекло время ожидания сервиса оценки. Повторите критерий позже'
    usage = Usage()
    models = []
    messages = _messages(conversation, criterion)
    schema = verdict_schema(conversation, criterion)

    def fail(message):
        return OpenRouterJudgeError(message, usage.model_copy(), round((time.monotonic() - started) * 1000),
                                    ', '.join(models) or settings.judge_model)

    async def one(temperature):
        nonlocal usage
        retry_messages = list(messages)
        for attempt in range(2):
            body = {'model': settings.judge_model, 'messages': retry_messages, 'temperature': temperature,
                    'max_tokens': 4096, 'stream': False, 'usage': {'include': True},
                    'provider': {'require_parameters': True}}
            if mode == 'schema':
                body['response_format'] = {'type': 'json_schema', 'json_schema': {
                    'name': 'submit_verdict', 'strict': True, 'schema': schema}}
            else:
                body['tools'] = [{'type': 'function', 'function': {
                    'name': 'submit_verdict', 'description': 'Submit the evidence-based verdict for this criterion.',
                    'strict': True, 'parameters': schema}}]
                body['tool_choice'] = {'type': 'function', 'function': {'name': 'submit_verdict'}}
            # The existing primary/repair/check attempts share one finite budget.
            # Reserve no fixed quarter for calls that may never be needed.
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise fail(timeout_message)
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(remaining, connect=min(15, remaining)),
                                             follow_redirects=False, trust_env=False) as client:
                    response = await asyncio.wait_for(client.post(
                        'https://openrouter.ai/api/v1/chat/completions', json=body,
                        headers={'Authorization': 'Bearer ' + settings.openrouter_api_key}), timeout=remaining)
                response.raise_for_status()
            except (httpx.TimeoutException, asyncio.TimeoutError) as exc:
                raise fail(timeout_message) from exc
            except httpx.HTTPStatusError as exc:
                # Preserve only the status, never provider bodies, URLs or keys.
                # Do not expose status_code/response on our error: the shared
                # queue would otherwise automatically retry a wrapped HTTP 429.
                raise fail(f'Сервис оценки вернул ошибку HTTP {exc.response.status_code}. '
                           'Повторите критерий позже') from exc
            except httpx.HTTPError as exc:
                # No transport retry: the outcome of a paid call may be unknown.
                raise fail('Сбой соединения с сервисом оценки. Повторите критерий позже') from exc
            try:
                payload = response.json()
                billed = _usage(payload)
                usage = Usage(input_tokens=usage.input_tokens + billed.input_tokens,
                              output_tokens=usage.output_tokens + billed.output_tokens,
                              cost_usd=usage.cost_usd + billed.cost_usd, calls=usage.calls + billed.calls)
                actual_model = payload.get('model')
                if not isinstance(actual_model, str) or not actual_model.strip():
                    raise ValueError('missing_model')
                if actual_model not in models:
                    models.append(actual_model)
            except (ValueError, TypeError, KeyError, ValidationError) as exc:
                raise fail('Сервис оценки вернул некорректные сведения о вызове. Повторите критерий') from exc
            try:
                verdict = _completion(payload, mode)
                result = JudgeResult(**verdict.model_dump(exclude={'confidence'}), model=actual_model,
                                     usage=Usage(), latency_ms=0)
                if not result.explanation.strip():
                    raise JudgeError('Модель не объяснила оценку')
                from app.evaluations import validate_judge_result
                validate_judge_result(result, criterion.model_dump(by_alias=True),
                                      conversation.model_dump(by_alias=True))
                return result, verdict.confidence
            except (ValueError, TypeError, KeyError, IndexError, ValidationError, ApiError, JudgeError) as exc:
                error = str(exc) if isinstance(exc, JudgeError) else (
                    exc.message if isinstance(exc, ApiError) else 'Ответ не соответствует требуемой JSON-схеме')
                if attempt:
                    raise fail('Не удалось проверить ответ модели: ' + error + '. Повторите критерий') from exc
                retry_messages = [*messages, {'role': 'user', 'content':
                    'Предыдущий ответ не прошёл проверку сервера: ' + error +
                    '. Заново оцени исходные данные. Исправь только эту ошибку; верни полный структурный ответ.'}]

    async def complete():
        result, confidence = await one(settings.judge_temperature)
        result.needs_review = confidence == 'low'
        omitted_action = result.answer == 'no' and (
            result.checked_range is not None or any(e.kind == 'expected_here' for e in result.evidence))
        if criterion.type == 'scale' or omitted_action:
            verification, verification_confidence = await one(.3)
            result.needs_review |= verification.answer != result.answer or verification_confidence == 'low'
        result.usage = usage
        result.model = ', '.join(models)
        result.latency_ms = round((time.monotonic() - started) * 1000)
        return result

    try:
        return await asyncio.wait_for(complete(), timeout=max(0, deadline - time.monotonic()))
    except asyncio.TimeoutError as exc:
        raise fail(timeout_message) from exc


async def second_opinion(conversation, criterion, original, appeal_comment):
    from app.ai import openrouter as ai
    ai.configure(_settings)
    return await ai.second_opinion(conversation, criterion, original, appeal_comment)
