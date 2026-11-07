"""Cached AI operations; model prompts and transport stay in judge/ and ai/."""
import asyncio
import hashlib
import logging
import time
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import Field, ValidationError

from . import llm_switch
from .checklists import prepare_criterion
from .db import json_dumps
from .errors import ApiError, JudgeError
from .models import (
    ApiModel, Conversation, Criterion, CriterionSuggestion, JudgeResult,
    SecondOpinion, Summary, Tip, TranslatedTurn, Usage,
)
from .scoring import validate_answer

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def _digest(value):
    return hashlib.sha256(json_dumps(value).encode("utf-8")).hexdigest()


def _conversation_hash(conversation):
    return conversation.get("transcriptHash") or _digest(conversation["transcript"])


def _cached_result(db, kind, key, source_hash):
    cached = db.get_cache(kind, key)
    if cached and cached["body"].get("sourceHash") == source_hash:
        return cached["body"]["result"]
    return None


def get_cached_summary(db, conversation):
    """Read a current summary without invoking any provider."""
    return _cached_result(db, "summary", conversation["id"], _conversation_hash(conversation))


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
    started = time.monotonic()
    try:
        result = await app.state.queue.call_model(function, *args, priority=priority)
        usage = _usage(result)
        app.state.db.record_usage(usage, latency_ms=int((time.monotonic() - started) * 1000), kind="extra")
        return result, usage
    except JudgeError as exc:
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


async def _cached(app, kind, key, source_hash, producer, is_current, refresh=False):
    """Serialize identical requests and refuse to persist results for changed input."""
    db = app.state.db
    locks = getattr(app.state, "ai_locks", None)
    if locks is None:
        app.state.ai_locks = locks = {}
    lock = locks.setdefault((kind, key), asyncio.Lock())
    async with lock:
        if not is_current():
            raise ApiError("stale_source", "Данные изменились. Повторите запрос", 409)
        cached = _cached_result(db, kind, key, source_hash)
        if cached is not None and not refresh:
            return cached
        result, usage = await producer()
        if not is_current():
            raise ApiError("stale_source", "Данные изменились во время обработки. Повторите запрос", 409)
        db.set_cache(kind, key, {"sourceHash": source_hash, "result": result}, usage)
        return result


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
            # Missing fake fixtures and unavailable real providers are expected here.
            logger.info("Summary unavailable for %s (%s)", conversation_id, exc.code)


@router.get("/conversations/{conversation_id}/summary")
async def summary(conversation_id: str, request: Request, refresh: bool = False):
    return await _summary(request.app, conversation_id, refresh)


@router.get("/conversations/{conversation_id}/translation")
async def translation(conversation_id: str, request: Request, refresh: bool = False):
    db = request.app.state.db
    conversation = db.get_conversation(conversation_id)
    if conversation["language"] == "RU":
        return {"turns": []}
    source_hash = _conversation_hash(conversation)

    async def produce():
        result, usage = await _call(request.app, llm_switch.get_ai().translate,
                                    Conversation.model_validate(conversation))
        if hasattr(result, "turns"):
            turns = result.turns
        elif isinstance(result, dict):
            turns = result.get("turns")
        elif isinstance(result, tuple) and len(result) == 2:
            turns = result[0]
        else:
            turns = result
        if not isinstance(turns, list):
            raise ApiError("model_failed", "Модель вернула некорректный перевод. Повторите через минуту", 502)
        translated = [_validate(TranslatedTurn, turn).model_dump(by_alias=True) for turn in turns]
        indices = [turn["idx"] for turn in translated]
        allowed = {turn["idx"] for turn in conversation["transcript"]}
        if len(indices) != len(set(indices)) or not set(indices).issubset(allowed):
            raise ApiError("model_failed", "Перевод ссылается на неизвестные реплики. Повторите через минуту", 502)
        return {"turns": translated}, usage

    return await _cached(request.app, "translation", conversation_id, source_hash, produce,
                         lambda: _conversation_hash(db.get_conversation(conversation_id)) == source_hash,
                         refresh)


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
async def coaching(evaluation_id: str, request: Request, refresh: bool = False):
    db = request.app.state.db
    evaluation = db.get_evaluation(evaluation_id)
    if evaluation["status"] != "done":
        raise ApiError("evaluation_not_ready", "Дождитесь завершения оценки", 409)
    conversation = db.get_conversation(evaluation["conversationId"])
    if evaluation.get("transcriptHash") != _conversation_hash(conversation):
        raise ApiError("stale_evaluation", "Диалог изменился после оценки. Оцените его заново", 409)
    checklist = db.get_checklist(evaluation["checklistId"])
    criteria = {criterion["id"]: criterion for criterion in checklist["criteria"]}
    source_hash = _evaluation_hash(evaluation)

    async def produce():
        pairs = [(Criterion.model_validate(criteria[item["criterionId"]]),
                  _judge_result(item, evaluation["model"])) for item in evaluation["items"]]
        result, usage = await _call(request.app, llm_switch.get_ai().coach,
                                    Conversation.model_validate(conversation), pairs)
        if not isinstance(result, list):
            raise ApiError("model_failed", "Модель вернула некорректные советы. Повторите через минуту", 502)
        tips = [_validate(Tip, tip).model_dump(by_alias=True) for tip in result]
        if any(tip["criterionId"] not in criteria for tip in tips):
            raise ApiError("model_failed", "Совет ссылается на неизвестный критерий. Повторите через минуту", 502)
        return {"tips": tips}, usage

    return await _cached(request.app, "coaching", evaluation_id, source_hash, produce,
                         lambda: _evaluation_hash(db.get_evaluation(evaluation_id)) == source_hash
                         and _conversation_hash(db.get_conversation(conversation["id"])) == _conversation_hash(conversation),
                         refresh)


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
        validate_answer(criterion, result.answer)
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
    db = request.app.state.db
    appeal = db.get_appeal(appeal_id)
    evaluation = db.get_evaluation(appeal["evaluationId"])
    conversation = db.get_conversation(evaluation["conversationId"])
    if evaluation.get("transcriptHash") != _conversation_hash(conversation):
        raise ApiError("stale_evaluation", "Диалог изменился после оценки. Оцените его заново", 409)
    checklist = db.get_checklist(evaluation["checklistId"])
    criterion = next(c for c in checklist["criteria"] if c["id"] == appeal["criterionId"])
    item = next(i for i in evaluation["items"] if i["criterionId"] == appeal["criterionId"])
    original = _judge_result(item, evaluation["model"], original=True)
    source_hash = _digest([_conversation_hash(conversation), criterion["hash"],
                           original.model_dump(by_alias=True), appeal["comment"]])

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
        db.save_appeal(current, conn)
    return result
