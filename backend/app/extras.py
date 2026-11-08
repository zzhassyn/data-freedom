"""Cached AI operations with source checks and isolated provider adapters."""
import asyncio
from contextlib import aclosing, asynccontextmanager
import hashlib
import json
import logging
import time
from typing import Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import ConfigDict, Field, ValidationError

from . import llm_switch, translation_service
from .checklists import prepare_criterion
from .db import json_dumps
from .errors import ApiError, JudgeError
from .models import (
    ApiModel, AssistantReply, Conversation, Criterion, CriterionSuggestion, JudgeResult,
    SecondOpinion, Summary, Tip, Usage,
)
from .scoring import validate_answer

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def _digest(value):
    return hashlib.sha256(json_dumps(value).encode("utf-8")).hexdigest()


def _conversation_hash(conversation):
    return conversation.get("transcriptHash") or _digest(conversation["transcript"])


def _provider_identity(kind):
    module = llm_switch.get_judge() if kind == "trial" else llm_switch.get_ai()
    identity = getattr(module, "cache_identity", None)
    return identity() if identity else getattr(module, "__name__", type(module).__name__)


def _cache_identity(app, kind):
    if kind == "translation" and app.state.settings.openrouter_api_key:
        return "openrouter:translation:" + app.state.settings.translation_model
    return _provider_identity(kind)


def _cached_result(db, kind, key, source_hash, identity):
    cached = db.get_cache(kind, key)
    if (cached and cached["body"].get("sourceHash") == source_hash
            and cached["body"].get("providerIdentity") == identity):
        return cached["body"]["result"]
    return None


def get_cached_summary(db, conversation):
    """Read a current summary without invoking any provider."""
    try:
        identity = _provider_identity("summary")
    except JudgeError:
        return None
    return _cached_result(db, "summary", conversation["id"], _conversation_hash(conversation), identity)


def get_cached_summaries(db, conversations, conn=None):
    """One cache read and one provider fingerprint for an entire screen."""
    try:
        identity = _provider_identity('summary')
    except JudgeError:
        return {}
    cached = db.get_caches('summary', conn)
    result = {}
    for conversation in conversations:
        item = cached.get(conversation['id'])
        if (item and item['body'].get('sourceHash') == _conversation_hash(conversation)
                and item['body'].get('providerIdentity') == identity):
            result[conversation['id']] = item['body']['result']
    return result


def visible_appeal(appeal):
    """Old provider opinions remain in history storage, never masquerade as current AI."""
    result = {key: value for key, value in appeal.items() if not key.startswith("_")}
    try:
        current = _provider_identity("second-opinion")
    except JudgeError:
        current = None
    if not current or appeal.get("_secondOpinionIdentity") != current:
        result["secondOpinion"] = None
    return result


def _usage(value):
    usage = getattr(value, "usage", None)
    if usage is None and isinstance(value, dict):
        usage = value.get("usage")
    if usage is None and isinstance(value, tuple) and len(value) == 2:
        usage = value[1]
    if usage is None:
        # Some section 6 functions return a plain list without token usage.
        return {"inputTokens": 0, "outputTokens": 0, "costUsd": 0.0, "calls": 1}
    return Usage.model_validate(usage).model_dump(by_alias=True)


async def _call(app, function, *args, priority=0):
    settings = app.state.settings
    if function is translation_service.translate:
        configured = bool(settings.openrouter_api_key and settings.translation_model)
    else:
        kind = 'judge' if (getattr(function, '__module__', '').startswith('app.judge')
                           and getattr(function, '__name__', '') != 'second_opinion') else 'ai'
        configured = llm_switch.provider_configured(kind, settings)
    if not configured:
        raise ApiError('model_unavailable', 'Функция ИИ недоступна: настройте ключ и модель OpenRouter', 503)
    started = time.monotonic()
    try:
        from .cache_coordination import active_cache_lease
        cache_lease = active_cache_lease.get()
        async def invoke(*values):
            guard = getattr(app.state, 'background_guard', None)
            if guard:
                guard()
            if cache_lease:
                cache_lease.before_call()
            return await function(*values)
        result = await app.state.queue.call_model(invoke, *args, priority=priority)
        usage = _usage(result)
        app.state.db.record_usage(usage, latency_ms=int((time.monotonic() - started) * 1000), kind="extra")
        return result, usage
    except JudgeError as exc:
        billed = getattr(exc, "usage", None)
        if billed is not None:
            app.state.db.record_usage(Usage.model_validate(billed),
                latency_ms=int((time.monotonic() - started) * 1000), kind="extra")
        raise ApiError("model_failed", f"Модель не ответила: {exc}. Повторите через минуту", 502) from exc
    except asyncio.TimeoutError as exc:
        raise ApiError("model_failed", "Модель не ответила за 90 секунд. Повторите через минуту", 502) from exc
    except ValidationError as exc:
        logger.warning("Invalid AI usage result: %s", type(exc).__name__)
        raise ApiError("model_failed", "Модель вернула некорректный ответ. Повторите через минуту", 502) from exc


def _validate(model, result):
    try:
        return model.model_validate(result)
    except ValidationError as exc:
        logger.warning("Invalid AI result for %s", model.__name__)
        raise ApiError("model_failed", "Модель вернула некорректный ответ. Повторите через минуту", 502) from exc


@asynccontextmanager
async def _cache_lock(app, kind, key):
    if getattr(app.state.settings, 'worker_mode', 'standalone') == 'standalone':
        locks = getattr(app.state, "ai_locks", None)
        if locks is None:
            app.state.ai_locks = locks = {}
        async with locks.setdefault((kind, key), asyncio.Lock()):
            yield None
    else:
        from .cache_coordination import shared_cache_lock
        async with shared_cache_lock(app, kind, key) as lease:
            yield lease


def _save_cached(app, lease, kind, key, body, usage):
    guard = getattr(app.state, 'background_guard', None)
    with app.state.db.transaction() as conn:
        if guard:
            guard(conn)
        if lease:
            lease.check(conn)
        app.state.db.set_cache(kind, key, body, usage, conn)


async def _cached(app, kind, key, source_hash, producer, is_current, refresh=False):
    """Serialize identical requests and refuse to persist results for changed input."""
    db = app.state.db
    try:
        identity = _cache_identity(app, kind)
    except JudgeError as exc:
        raise ApiError("model_unavailable", str(exc), 503) from exc
    async with _cache_lock(app, kind, key) as lease:
        if not is_current():
            raise ApiError("stale_source", "Данные изменились. Повторите запрос", 409)
        cached = _cached_result(db, kind, key, source_hash, identity)
        if cached is not None and not refresh:
            return cached
        result, usage = await producer()
        if not is_current() or _cache_identity(app, kind) != identity:
            raise ApiError("stale_source", "Данные изменились во время обработки. Повторите запрос", 409)
        _save_cached(app, lease, kind, key, {"sourceHash": source_hash, "providerIdentity": identity, "result": result}, usage)
        return result


def _stream_cached(app, kind, key, source_hash, factory, serialize, is_current, refresh=False):
    """One bounded model call; partials stream immediately, only validated results persist."""
    try:
        identity = _cache_identity(app, kind)
    except JudgeError as exc:
        raise ApiError("model_unavailable", str(exc), 503) from exc
    settings = app.state.settings
    if (not llm_switch.has_provider_overrides() and settings.judge in {"openrouter", "real"}
            and not (settings.openrouter_api_key and (settings.ai_model or settings.judge_model))):
        raise ApiError("model_unavailable", "Укажите ключ OpenRouter и модель в настройках сервера", 503)
    if not is_current():
        raise ApiError("stale_source", "Данные изменились. Повторите запрос", 409)

    async def events():
        messages = asyncio.Queue(maxsize=32)

        async def consume():
            async with aclosing(factory()) as upstream:
                async for event in upstream:
                    if event.get("type") == "partial":
                        if not is_current():
                            raise ApiError("stale_source", "Данные изменились во время обработки. Повторите запрос", 409)
                        await messages.put({"type": "partial", "value": event["value"]})
                    elif event.get("type") == "done":
                        return event["result"], event["usage"]
            raise JudgeError("Поток ответа прервался до завершения")

        async def produce():
            try:
                async with _cache_lock(app, kind, key) as lease:
                    if not is_current():
                        raise ApiError("stale_source", "Данные изменились. Повторите запрос", 409)
                    result = _cached_result(app.state.db, kind, key, source_hash, identity)
                    if result is not None and not refresh:
                        await messages.put({"type": "done", "result": result})
                        return
                    pair, usage = await _call(app, consume)
                    result = serialize(pair[0])
                    if not is_current() or _cache_identity(app, kind) != identity:
                        raise ApiError("stale_source", "Данные изменились во время обработки. Повторите запрос", 409)
                    _save_cached(app, lease, kind, key,
                        {"sourceHash": source_hash, "providerIdentity": identity, "result": result}, usage)
                    await messages.put({"type": "done", "result": result})
            except ApiError as exc:
                await messages.put({"type": "error", "error": {"code": exc.code, "message": exc.message}})
            except Exception:
                logger.exception("AI stream failed")
                await messages.put({"type": "error", "error": {"code": "model_failed",
                    "message": "Не удалось получить ответ модели. Повторите через минуту"}})

        task = asyncio.create_task(produce())
        app.state.background_tasks.add(task)
        try:
            while True:
                event = await messages.get()
                yield json.dumps(event, ensure_ascii=False, allow_nan=False) + "\n"
                if event["type"] in {"done", "error"}:
                    break
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            app.state.background_tasks.discard(task)

    return StreamingResponse(events(), media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


async def _summary(app, conversation_id, refresh=False, priority=0):
    db = app.state.db
    conversation = db.get_conversation(conversation_id)
    source_hash = _conversation_hash(conversation)

    async def produce():
        result, usage = await _call(app, llm_switch.get_ai().summarize,
                                    Conversation.model_validate(conversation), priority=priority)
        summary = _validate(Summary, result)
        return summary.model_dump(by_alias=True, exclude={"usage"}), usage

    return await _cached(app, "summary", conversation_id, source_hash, produce,
                         lambda: _conversation_hash(db.get_conversation(conversation_id)) == source_hash,
                         refresh)


async def prefetch_summaries(app, conversation_ids):
    """Import side job: at most one low-priority request is submitted at a time."""
    for conversation_id in dict.fromkeys(conversation_ids):
        try:
            await _summary(app, conversation_id, priority=10)
        except ApiError as exc:
            # Unavailable providers do not prevent importing or viewing records.
            logger.info("Summary unavailable for %s (%s)", conversation_id, exc.code)


@router.get("/conversations/{conversation_id}/summary")
async def summary(conversation_id: str, request: Request, refresh: bool = False, stream: bool = False):
    if stream:
        app = request.app
        conversation = app.state.db.get_conversation(conversation_id)
        source_hash = _conversation_hash(conversation)
        try:
            module = llm_switch.get_ai()
        except JudgeError as exc:
            raise ApiError("model_unavailable", str(exc), 503) from exc
        source = Conversation.model_validate(conversation)
        factory = (lambda: module.summarize_stream(source)) if hasattr(module, "summarize_stream") else (
            lambda: _completed_stream(module.summarize, source))
        return _stream_cached(app, "summary", conversation_id, source_hash, factory,
            lambda value: _validate(Summary, value).model_dump(by_alias=True, exclude={"usage"}),
            lambda: _conversation_hash(app.state.db.get_conversation(conversation_id)) == source_hash, refresh)
    return await _summary(request.app, conversation_id, refresh)


async def _completed_stream(function, *args):
    """Non-streaming adapters produce one terminal value without invented deltas."""
    result = await function(*args)
    yield {"type": "done", "result": result, "usage": _usage(result)}


class AssistantMessage(ApiModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=6000)


class AssistantRequest(ApiModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=2000)
    history: list[AssistantMessage] = Field(default_factory=list, max_length=12)
    language: Literal['RU', 'KZ', 'EN']
    transcript_hash: str = Field(min_length=1, max_length=128)
    evaluation_id: str | None = Field(default=None, min_length=1, max_length=128)


def _assistant_context(db, conversation_id, body):
    from .evaluations import public_evaluation, require_evaluation_visible, source_conversation

    with db.transaction() as conn:
        current = db.get_conversation(conversation_id, conn)
        assessment = None
        if body.evaluation_id:
            evaluation = db.get_evaluation(body.evaluation_id, conn)
            if evaluation['conversationId'] != conversation_id:
                raise ApiError('invalid_request', 'Оценка относится к другому диалогу', 400)
            require_evaluation_visible(evaluation)
            snapshot = evaluation.get('_conversation') or current
            if (snapshot['id'] != conversation_id
                    or evaluation.get('transcriptHash') != _conversation_hash(snapshot)):
                raise ApiError('stale_source', 'Исходный диалог оценки недоступен. Откройте карточку заново', 409)
            source_hash = _conversation_hash(snapshot)
            source = source_conversation(db, evaluation, conn)
            assessment = {'evaluation': public_evaluation(evaluation),
                          'checklist': db.get_checklist(evaluation['checklistId'], conn)}
        else:
            source, source_hash = current, _conversation_hash(current)
        if body.transcript_hash != source_hash:
            raise ApiError('stale_source', 'Отображаемый диалог изменился. Откройте карточку заново', 409)
        conversation = Conversation.model_validate(source)
        fingerprint = _digest([source_hash, conversation.model_dump(by_alias=True), assessment])
        return conversation, assessment, fingerprint


@router.post('/conversations/{conversation_id}/assistant')
async def assistant(conversation_id: str, body: AssistantRequest, request: Request):
    app = request.app
    conversation, assessment, fingerprint = _assistant_context(app.state.db, conversation_id, body)
    try:
        module = llm_switch.get_ai()
    except JudgeError as exc:
        raise ApiError('model_unavailable', str(exc), 503) from exc
    result, usage = await _call(app, module.assistant, conversation, body.message,
        [message.model_dump() for message in body.history], body.language, assessment)
    try:
        _, _, current_fingerprint = _assistant_context(app.state.db, conversation_id, body)
    except ApiError as exc:
        raise ApiError('stale_source', 'Контекст изменился во время ответа. Откройте карточку заново', 409) from exc
    if current_fingerprint != fingerprint:
        raise ApiError('stale_source', 'Оценка или диалог изменились во время ответа. Повторите запрос', 409)
    result = _validate(AssistantReply, result)
    try:
        result.validate_citations(conversation)
    except ValueError as exc:
        raise ApiError('model_failed', 'Модель указала цитату, которой нет в диалоге', 502) from exc
    result.usage = Usage.model_validate(usage)
    return result.model_dump(by_alias=True)


def _translation_input(app, conversation, source_name):
    if source_name == "canonical":
        return Conversation.model_validate(conversation), _conversation_hash(conversation)
    payload = app.state.stt.transcription(conversation["id"])
    if (payload["status"] != "done" or payload["transcriptHash"] != _conversation_hash(conversation)
            or not payload["turns"]):
        raise ApiError("stale_source", "Расшифровка изменилась или ещё не готова. Повторите запрос", 409)
    roles = {speaker["speakerId"]: speaker.get("role", "unknown") for speaker in payload["speakers"]}
    source = translation_service.TranslationSource(conversation["language"], [
        translation_service.SourceTurn(turn["idx"], turn.get("role") or roles.get(turn["speakerId"], "unknown"), turn["text"])
        for turn in payload["turns"]
    ])
    return source, translation_service.transcription_source_hash(payload)


@router.get("/conversations/{conversation_id}/translation")
async def translation(conversation_id: str, request: Request, refresh: bool = False,
                      target_language: Literal["RU", "KZ", "EN"] = Query("RU", alias="targetLanguage"),
                      source_name: Literal["canonical", "transcription"] = Query("canonical", alias="source"),
                      expected_hash: str | None = Query(None, alias="sourceHash", max_length=128)):
    app = request.app
    db = app.state.db
    conversation = db.get_conversation(conversation_id)
    source, source_hash = _translation_input(app, conversation, source_name)
    if expected_hash is not None and expected_hash != source_hash:
        raise ApiError("stale_source", "Отображаемый диалог изменился. Откройте его заново", 409)
    metadata = {"targetLanguage": target_language, "source": source_name, "sourceHash": source_hash}
    if conversation["language"] == target_language:
        return {"turns": [{"idx": turn.idx, "text": turn.text} for turn in source.transcript], **metadata}
    settings = app.state.settings
    if not settings.openrouter_api_key:
        raise ApiError("translation_unavailable", "Перевод на этот язык пока недоступен", 503)

    async def produce():
        result, usage = await _call(app, translation_service.translate, source, target_language, settings)
        if result.target_language != target_language:
            raise ApiError("model_failed", "Модель вернула перевод на другой язык. Повторите через минуту", 502)
        if hasattr(result, "turns"):
            turns = result.turns
        elif isinstance(result, dict):
            turns = result.get("turns")
        elif isinstance(result, tuple) and len(result) == 2:
            turns = result[0]
        else:
            turns = result
        try:
            translated = translation_service.validate_turns(turns, source)
        except JudgeError as exc:
            raise ApiError("model_failed", f"Некорректный перевод: {exc}. Повторите через минуту", 502) from exc
        return {"turns": translated, **metadata}, usage

    key = _digest([conversation_id, source_name, source_hash, target_language, _cache_identity(app, "translation")])
    tasks = getattr(app.state, "translation_tasks", None)
    if tasks is None:
        app.state.translation_tasks = tasks = {}
    task = tasks.get(key)
    if task is None:
        def is_current():
            current = db.get_conversation(conversation_id)
            try:
                _, current_hash = _translation_input(app, current, source_name)
            except ApiError:
                return False
            return current_hash == source_hash and current["language"] == conversation["language"]

        task = asyncio.create_task(_cached(app, "translation", key, source_hash, produce, is_current, refresh))
        tasks[key] = task
        app.state.background_tasks.add(task)

        def completed(done):
            if tasks.get(key) is done:
                tasks.pop(key, None)
            app.state.background_tasks.discard(done)
            if not done.cancelled():
                done.exception()  # Retrieve an error if every HTTP waiter disconnected.

        task.add_done_callback(completed)
    # UI language switches must not cancel the shared request or bill it twice.
    return await asyncio.shield(task)


def _judge_result(item, model, original=False):
    answer = item["answer"]
    if original and item.get("original"):
        answer = item["original"]["answer"]
    checked = item.get("checkedRange")
    return JudgeResult(
        answer=answer, explanation=item.get("explanation") or "",
        evidence=item.get("evidence", []),
        checked_range=(checked["fromIdx"], checked["toIdx"]) if checked else None,
        na_reason=item.get("naReason"), flag_types=item.get("flagTypes"),
        needs_review=item.get("needsReview", False), model=model,
        usage=item.get("usage") or {"inputTokens": 0, "outputTokens": 0, "costUsd": 0, "calls": 0},
        latency_ms=0,
    )


def _evaluation_hash(evaluation):
    return _digest({"transcriptHash": evaluation.get("transcriptHash"),
                    "items": evaluation["items"], "status": evaluation["status"]})


@router.get("/evaluations/{evaluation_id}/coaching")
async def coaching(evaluation_id: str, request: Request, refresh: bool = False, stream: bool = False):
    from .evaluations import require_evaluation_visible
    db = request.app.state.db
    evaluation = db.get_evaluation(evaluation_id)
    require_evaluation_visible(evaluation)
    if evaluation["status"] != "done":
        raise ApiError("evaluation_not_ready", "Дождитесь завершения оценки", 409)
    conversation = db.get_conversation(evaluation["conversationId"])
    if evaluation.get("transcriptHash") != _conversation_hash(conversation):
        raise ApiError("stale_evaluation", "Диалог изменился после оценки. Оцените его заново", 409)
    checklist = db.get_checklist(evaluation["checklistId"])
    criteria = {criterion["id"]: criterion for criterion in checklist["criteria"]}
    source_hash = _evaluation_hash(evaluation)
    pairs = [(Criterion.model_validate(criteria[item["criterionId"]]),
              _judge_result(item, evaluation["model"])) for item in evaluation["items"]]
    weak = {criterion.id for criterion, result in pairs
            if (criterion.type == "binary" and result.answer == "no")
            or (criterion.type == "scale" and isinstance(result.answer, (int, float))
                and result.answer < max(step.value for step in criterion.scale))}

    def serialize(result):
        if not isinstance(result, list):
            raise ApiError("model_failed", "Модель вернула некорректные советы. Повторите через минуту", 502)
        tips = [_validate(Tip, tip).model_dump(by_alias=True) for tip in result]
        if any(tip["criterionId"] not in weak for tip in tips):
            raise ApiError("model_failed", "Совет ссылается на критерий без замечаний. Повторите через минуту", 502)
        return {"tips": tips}

    def is_current():
        return (_evaluation_hash(db.get_evaluation(evaluation_id)) == source_hash
                and _conversation_hash(db.get_conversation(conversation["id"])) == _conversation_hash(conversation))

    if stream:
        try:
            module = llm_switch.get_ai()
        except JudgeError as exc:
            raise ApiError("model_unavailable", str(exc), 503) from exc
        source = Conversation.model_validate(conversation)
        factory = (lambda: module.coach_stream(source, pairs)) if hasattr(module, "coach_stream") else (
            lambda: _completed_stream(module.coach, source, pairs))
        return _stream_cached(request.app, "coaching", evaluation_id, source_hash, factory, serialize, is_current, refresh)

    async def produce():
        result, usage = await _call(request.app, llm_switch.get_ai().coach,
                                    Conversation.model_validate(conversation), pairs)
        return serialize(result), usage

    return await _cached(request.app, "coaching", evaluation_id, source_hash, produce,
                         is_current, refresh)


class TryRequest(ApiModel):
    criterion: dict
    conversation_ids: list[str]


def _trial_criterion(db, draft):
    body = dict(draft)
    if not body.get("id"):
        matches = [criterion for checklist in db.all_checklists() for criterion in checklist["criteria"]
                   if criterion["title"] == body.get("title")]
        body["id"] = matches[0]["id"] if matches else "trial"
    body.setdefault("sectionId", "trial")
    body.setdefault("order", 0)
    return prepare_criterion(body)


def _validate_evidence(result, conversation, criterion):
    try:
        validate_answer(criterion, result.answer, conversation)
    except ApiError as exc:
        raise ApiError("model_failed", "Модель вернула недопустимый ответ для критерия", 502) from exc
    turns = {turn["idx"]: turn for turn in conversation["transcript"]}
    for evidence in result.evidence:
        if evidence.turn_idx not in turns or evidence.quote not in turns[evidence.turn_idx]["text"]:
            raise ApiError("model_failed", "Модель вернула цитату, которой нет в диалоге", 502)
    checked = getattr(result, "checked_range", None)
    if checked is not None and (checked[0] not in turns or checked[1] not in turns or checked[0] > checked[1]):
        raise ApiError("model_failed", "Модель указала неверный участок диалога", 502)
    if isinstance(result, JudgeResult):
        allowed_flags = {flag["id"] for flag in criterion.get("flagTypes") or []}
        if result.flag_types and (criterion["type"] != "flag" or result.answer != "yes"
                                  or not set(result.flag_types).issubset(allowed_flags)):
            raise ApiError("model_failed", "Модель указала неизвестный тип нарушения", 502)


@router.post("/criteria/try")
async def try_criterion(body: TryRequest, request: Request, refresh: bool = False):
    ids = body.conversation_ids
    if len(ids) > 3:
        raise ApiError("too_many", "Можно проверить критерий не более чем на трёх диалогах", 400)
    if not ids or len(ids) != len(set(ids)):
        raise ApiError("invalid_request", "Выберите от одного до трёх разных диалогов", 400)
    db = request.app.state.db
    criterion = _trial_criterion(db, body.criterion)
    conversations = [db.get_conversation(conversation_id) for conversation_id in ids]

    async def one(conversation):
        source_hash = _conversation_hash(conversation)
        key = f"{conversation['id']}:{criterion['contentHash']}"

        async def produce():
            result, usage = await _call(request.app, llm_switch.get_judge().judge,
                                        Conversation.model_validate(conversation), Criterion.model_validate(criterion))
            result = _validate(JudgeResult, result)
            _validate_evidence(result, conversation, criterion)
            checked = result.checked_range
            item = {
                "criterionId": criterion["id"], "criterionHash": criterion["hash"], "status": "done",
                "answer": result.answer, "explanation": result.explanation,
                "evidence": [e.model_dump(by_alias=True) for e in result.evidence],
                "checkedRange": {"fromIdx": checked[0], "toIdx": checked[1]} if checked else None,
                "naReason": result.na_reason, "flagTypes": result.flag_types,
                "reused": False, "needsReview": result.needs_review,
                "usage": result.usage.model_dump(by_alias=True), "original": None, "appealId": None,
            }
            return item, usage

        result = await _cached(request.app, "trial", key, source_hash, produce,
                               lambda: _conversation_hash(db.get_conversation(conversation["id"])) == source_hash,
                               refresh)
        # The content hash intentionally excludes weight; return this request's full hash.
        result = {**result, "criterionId": criterion["id"], "criterionHash": criterion["hash"]}
        return {"conversationId": conversation["id"], "result": result}

    try:
        return {"items": await asyncio.wait_for(asyncio.gather(*(one(c) for c in conversations)), timeout=90)}
    except asyncio.TimeoutError as exc:
        raise ApiError("model_failed", "Пробная оценка не завершилась за 90 секунд. Повторите через минуту", 502) from exc


class SuggestRequest(ApiModel):
    title: str = Field(min_length=1, max_length=500)
    draft: str = Field(max_length=10000)
    type: Literal["binary", "scale", "flag"]


@router.post("/criteria/suggest")
async def suggest(body: SuggestRequest, request: Request, refresh: bool = False):
    if not body.title.strip():
        raise ApiError("invalid_request", "Введите название критерия", 400)
    key = _digest(body.model_dump())

    async def produce():
        result, usage = await _call(request.app, llm_switch.get_ai().suggest_criterion,
                                    body.title, body.draft, body.type)
        result = _validate(CriterionSuggestion, result)
        return result.model_dump(by_alias=True, exclude={"usage"}), usage

    return await _cached(request.app, "suggestion", key, key, produce, lambda: True, refresh)


@router.post("/appeals/{appeal_id}/second-opinion")
async def second_opinion(appeal_id: str, request: Request, refresh: bool = False):
    from .evaluations import require_evaluation_visible
    db = request.app.state.db
    appeal = db.get_appeal(appeal_id)
    evaluation = db.get_evaluation(appeal["evaluationId"])
    require_evaluation_visible(evaluation)
    conversation = db.get_conversation(evaluation["conversationId"])
    if evaluation.get("transcriptHash") != _conversation_hash(conversation):
        raise ApiError("stale_evaluation", "Диалог изменился после оценки. Оцените его заново", 409)
    checklist = db.get_checklist(evaluation["checklistId"])
    criterion = next(c for c in checklist["criteria"] if c["id"] == appeal["criterionId"])
    item = next(i for i in evaluation["items"] if i["criterionId"] == appeal["criterionId"])
    original = _judge_result(item, evaluation["model"], original=True)
    source_hash = _digest([_conversation_hash(conversation), criterion["hash"],
                           original.model_dump(by_alias=True), appeal["comment"]])
    identity = _provider_identity("second-opinion")

    async def produce():
        result, usage = await _call(request.app, llm_switch.get_judge().second_opinion,
                                    Conversation.model_validate(conversation), Criterion.model_validate(criterion),
                                    original, appeal["comment"])
        result = _validate(SecondOpinion, result)
        _validate_evidence(result, conversation, criterion)
        return result.model_dump(by_alias=True, exclude={"usage"}), usage

    result = await _cached(request.app, "second-opinion", appeal_id, source_hash, produce,
                           lambda: _conversation_hash(db.get_conversation(conversation["id"])) == _conversation_hash(conversation),
                           refresh)
    # Merge into the latest appeal so a simultaneous reviewer decision is preserved.
    with db.transaction() as conn:
        current = db.get_appeal(appeal_id, conn)
        current["secondOpinion"] = result
        current["_secondOpinionIdentity"] = identity
        db.save_appeal(current, conn)
    return result
