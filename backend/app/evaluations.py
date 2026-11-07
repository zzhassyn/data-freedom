"""Durable evaluation steps and a bounded, in-process provider queue.

Only one application process owns this SQLite queue. Each criterion is saved
before a following step runs; after restart only unfinished steps are repeated.
"""

import asyncio
import copy
import itertools
import logging
import re
from datetime import datetime
from typing import Any, Callable

from fastapi import APIRouter, Request
from pydantic import Field, ValidationError

from app import llm_switch
from app.db import utcnow
from app.errors import ApiError, JudgeError
from app.models import ApiModel, Conversation, Criterion, JudgeResult, Usage
from app.scoring import score_evaluation, validate_answer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


def zero_usage() -> dict:
    return {"inputTokens": 0, "outputTokens": 0, "costUsd": 0.0, "calls": 0}


def sum_usage(usages) -> dict:
    result = zero_usage()
    for usage in usages:
        if usage:
            for key in result:
                result[key] += usage.get(key, 0)
    return result


def public_evaluation(evaluation: dict) -> dict:
    return {key: value for key, value in evaluation.items() if not key.startswith("_")}


def is_real_model(value) -> bool:
    """Known provider names, excluding fixture and missing-provenance labels."""
    if not isinstance(value, str):
        return False
    parts = [part.strip() for part in value.split(',')]
    return all(part and part.lower() not in {"unknown", "none", "не настроена"}
               and not re.match(r"(?:fake|mock|fixture)(?:$|\b|[-:/])", part, re.I) for part in parts)


def is_evaluation_visible(evaluation: dict) -> bool:
    """Hide fixture/unknown answers in real mode without deleting historical work.

    Genuine results from older models remain visible. Pending and failed real
    requests also remain visible, so configuration/provider errors can be retried.
    """
    if llm_switch.has_provider_overrides():
        return True
    completed = [item for item in evaluation.get("items", []) if item.get("status") == "done"]
    if completed:
        return all(is_real_model(item.get("model")) for item in completed)
    identity = evaluation.get("_judgeIdentity")
    return bool((isinstance(identity, str) and identity.startswith("openrouter:"))
                or is_real_model(evaluation.get("model")))


def reusable_judge_identities(target_identity) -> set[str]:
    """Permit only provider-certified migrations into its current identity.

    An older running evaluation can still reuse an exact matching provenance;
    it cannot borrow the current provider's migration permission.
    """
    if not isinstance(target_identity, str) or not target_identity.startswith('openrouter:'):
        return set()
    allowed = {target_identity}
    provider = llm_switch.get_judge()
    current = provider.cache_identity() if hasattr(provider, 'cache_identity') else None
    if target_identity == current and hasattr(provider, 'compatible_cache_identities'):
        certified = provider.compatible_cache_identities()
        allowed.update(identity for identity in certified
                       if isinstance(identity, str) and identity.startswith('openrouter:'))
    return allowed


def require_current_judge_compatibility(evaluation: dict) -> None:
    """Do not attach a fresh verdict with changed semantics to old provenance."""
    if llm_switch.has_provider_overrides():
        return
    provider = llm_switch.get_judge()
    current = provider.cache_identity() if hasattr(provider, 'cache_identity') else None
    if evaluation.get('_judgeIdentity') not in reusable_judge_identities(current):
        raise ApiError('provider_changed', 'Настройки модели изменились. Запустите новую оценку диалога.', 409)


def require_evaluation_visible(evaluation: dict) -> None:
    if not is_evaluation_visible(evaluation):
        raise ApiError("provider_changed",
                       "Эта оценка создана в тестовом режиме или без сведений о модели. Запустите новую оценку", 409)


def source_conversation(db, evaluation: dict, conn=None) -> dict:
    """Return the transcript used by this evaluation with its durable registry identity."""
    current = db.get_conversation(evaluation["conversationId"], conn)
    return source_conversation_payload(evaluation, current)


def source_conversation_payload(evaluation: dict, current: dict) -> dict:
    """Build the same snapshot from records already loaded in a shared read."""
    source = {**(evaluation.get("_conversation") or current),
              "number": current["number"], "startedAt": current["startedAt"]}
    from .judge.hints import contextual_na_metadata
    result = Conversation.model_validate(source).model_dump(by_alias=True)
    result.update(contextual_na_metadata(result))
    return result


def empty_item(criterion: dict) -> dict:
    return {
        "criterionId": criterion["id"], "criterionHash": criterion["hash"],
        "status": "pending", "answer": None, "explanation": None,
        "evidence": [], "checkedRange": None, "naReason": None,
        "flagTypes": None, "reused": False, "needsReview": False,
        "usage": None, "fraction": None, "weight": criterion["weight"],
        "effectiveWeight": 0.0, "points": 0.0, "original": None,
        "appealId": None,
        "model": None,
        "latencyMs": None,
    }


def result_to_item(result: JudgeResult, criterion: dict) -> dict:
    item = empty_item(criterion)
    item.update(
        status="done", answer=result.answer, explanation=result.explanation,
        evidence=[entry.model_dump(by_alias=True) for entry in result.evidence],
        checkedRange=(
            {"fromIdx": result.checked_range[0], "toIdx": result.checked_range[1]}
            if result.checked_range is not None else None
        ),
        naReason=result.na_reason, flagTypes=result.flag_types,
        needsReview=result.needs_review, usage=result.usage.model_dump(by_alias=True),
        model=result.model,
        latencyMs=result.latency_ms,
    )
    return item


def judge_result_from_item(item: dict, model: str = "") -> JudgeResult:
    checked = item.get("checkedRange")
    return JudgeResult(
        answer=(item.get("original") or {}).get("answer", item["answer"]),
        explanation=item.get("explanation") or "",
        evidence=item.get("evidence", []),
        checked_range=(checked["fromIdx"], checked["toIdx"]) if checked else None,
        na_reason=item.get("naReason"), flag_types=item.get("flagTypes"),
        needs_review=item.get("needsReview", False), model=model,
        usage=Usage.model_validate(item.get("usage") or zero_usage()), latency_ms=0,
    )


def validate_judge_result(result: JudgeResult, criterion: dict, conversation: dict) -> None:
    """Reject malformed provider output without persisting an invented score."""
    validate_answer(criterion, result.answer, conversation)
    turns = {turn["idx"]: turn for turn in conversation["transcript"]}
    for evidence in result.evidence:
        turn = turns.get(evidence.turn_idx)
        if turn is None or not evidence.quote or evidence.quote not in turn["text"]:
            raise JudgeError("Цитата модели не найдена в указанной реплике")
    if result.checked_range is not None:
        start, end = result.checked_range
        if start not in turns or end not in turns or start > end:
            raise JudgeError("Модель вернула неверный участок диалога")
    if result.answer == "na" and not (result.na_reason or "").strip():
        raise JudgeError("Модель не объяснила, почему критерий неприменим")
    allowed_flags = {entry["id"] for entry in criterion.get("flagTypes") or []}
    if result.flag_types and (
        criterion["type"] != "flag" or result.answer != "yes"
        or any(flag not in allowed_flags for flag in result.flag_types)
    ):
        raise JudgeError("Модель вернула неизвестный тип грубой ошибки")


class EvaluationQueue:
    def __init__(self, db, settings):
        self.db = db
        self.settings = settings
        self._calls: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._sequence = itertools.count()
        self._workers: list[asyncio.Task] = []
        self._evaluations: dict[str, asyncio.Task] = {}
        self._jobs_by_evaluation: dict[str, set[str]] = {}
        self._closing = False
        self.background_guard = None

    async def start(self) -> None:
        if self._workers:
            return
        self._closing = False
        for _ in range(max(1, self.settings.judge_concurrency)):
            self._workers.append(asyncio.create_task(self._model_worker()))
        # Functions may serve request-bound extras, but only the daemon owns
        # durable evaluations. A cold API start must never replay paid work.
        if getattr(self.settings, 'worker_mode', 'standalone') == 'api':
            return
        with self.db.read_connection() as conn:
            jobs = self.db.all_jobs(conn)
            pending = self.db.all_evaluations(conn, statuses=('queued', 'running'))
        for job in jobs:
            for item in job["items"]:
                self._jobs_by_evaluation.setdefault(item["evaluationId"], set()).add(job["id"])
        for evaluation in reversed(pending):
            if not is_evaluation_visible(evaluation):
                continue
            with self.db.transaction() as conn:
                if self.background_guard:
                    self.background_guard(conn)
                evaluation = self.db.get_evaluation(evaluation["id"], conn)
                for item in evaluation["items"]:
                    if item["status"] == "running":
                        if getattr(self.settings, 'worker_mode', 'standalone') == 'worker':
                            item.update(status="failed", explanation="Обработка прервалась. Повторите критерий.")
                        else:
                            item["status"] = "pending"
                evaluation["status"] = "queued"
                evaluation["total"] = None
                self.db.save_evaluation(evaluation, conn)
            self._schedule(evaluation["id"])
        # A process can stop between final criterion persistence and job update.
        for job in self.db.all_jobs():
            self._refresh_job(job["id"])

    async def close(self) -> None:
        self._closing = True
        tasks = list(self._evaluations.values()) + self._workers
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._evaluations.clear()
        self._workers.clear()
        while not self._calls.empty():
            _, _, _, _, _, future = self._calls.get_nowait()
            if not future.done():
                future.cancel()
            self._calls.task_done()

    async def call_model(self, fn: Callable, *args, priority: int = 0, **kwargs):
        if self._closing:
            raise JudgeError("Сервер завершает работу; повторите запрос после запуска")
        if not self._workers:
            raise RuntimeError("EvaluationQueue.start() must run before provider calls")
        future = asyncio.get_running_loop().create_future()
        await self._calls.put((priority, next(self._sequence), fn, args, kwargs, future))
        return await future

    async def _model_worker(self) -> None:
        while True:
            _, _, fn, args, kwargs, future = await self._calls.get()
            invoke_task = None
            cancel_callback = None
            try:
                if future.cancelled():
                    continue
                invoke_task = asyncio.create_task(self._invoke_with_retries(fn, args, kwargs))
                # E.g. a trial request times out while waiting for a busy worker.
                # Cancellation must also stop its provider call, freeing capacity.
                def cancel_callback(completed, task=invoke_task):
                    if completed.cancelled() and not task.done():
                        task.cancel()
                future.add_done_callback(cancel_callback)
                result = await asyncio.wait_for(
                    invoke_task,
                    timeout=getattr(self.settings, "model_timeout", 90.0),
                )
                if not future.done():
                    future.set_result(result)
            except asyncio.CancelledError:
                if future.cancelled() and not self._closing:
                    continue
                if not future.done():
                    future.cancel()
                raise
            except Exception as exc:
                if not future.done():
                    future.set_exception(exc)
            finally:
                if cancel_callback is not None:
                    future.remove_done_callback(cancel_callback)
                self._calls.task_done()

    async def _invoke_with_retries(self, fn, args, kwargs):
        for attempt in range(4):
            try:
                return await fn(*args, **kwargs)
            except Exception as exc:
                status = getattr(exc, "status_code", None)
                if status is None:
                    status = getattr(getattr(exc, "response", None), "status_code", None)
                if status != 429 or attempt == 3:
                    raise
                await asyncio.sleep(2 ** (attempt + 1))

    async def submit(self, conversation_ids: list[str], checklist_id: str, reuse: bool = True) -> dict:
        if not llm_switch.provider_configured('judge', self.settings):
            raise ApiError('model_unavailable', 'Оценка недоступна: настройте ключ и модель OpenRouter', 503)
        if not conversation_ids:
            raise ApiError("invalid_request", "Выберите хотя бы один диалог", 400)
        conversation_ids = list(dict.fromkeys(conversation_ids))
        checklist = self.db.get_checklist(checklist_id)
        conversations = [self.db.get_conversation(id) for id in conversation_ids]
        judge = llm_switch.get_judge()
        model = judge.configured_model() if hasattr(judge, "configured_model") else self.settings.llm_model
        identity = judge.cache_identity() if hasattr(judge, "cache_identity") else model
        job_id = None
        evaluation_ids = {}
        with self.db.transaction() as conn:
            job_id = self.db.next_id("job", conn)
            job_items = []
            for conversation in conversations:
                evaluation_id = self.db.next_id("ev", conn)
                evaluation_ids[conversation["id"]] = evaluation_id
                flag = next((c["id"] for c in checklist["criteria"] if c["type"] == "flag"), "")
                evaluation = {
                    "id": evaluation_id, "conversationId": conversation["id"],
                    "checklistId": checklist["id"], "checklistVersion": checklist["version"],
                    "transcriptHash": conversation["transcriptHash"], "status": "queued",
                    "model": model, "_judgeIdentity": identity,
                    "usage": zero_usage(), "needsReviewCount": 0,
                    "startedAt": None, "finishedAt": None, "durationMs": None,
                    "items": [empty_item(c) for c in sorted(checklist["criteria"], key=lambda c: c["order"])],
                    "sections": [], "total": None, "originalTotal": None,
                    "grossError": {"flagged": False, "types": [], "criterionId": flag},
                    "_conversation": conversation, "_reuse": reuse,
                }
                self.db.save_evaluation(evaluation, conn)
                job_items.append({"conversationId": conversation["id"], "evaluationId": evaluation_id, "status": "queued"})
                self._jobs_by_evaluation.setdefault(evaluation_id, set()).add(job_id)
            self.db.save_job({
                "id": job_id, "status": "running", "total": len(job_items),
                "done": 0, "failed": 0, "startedAt": utcnow(),
                "items": job_items, "usage": zero_usage(),
            }, conn)
        for evaluation_id in evaluation_ids.values():
            self._schedule(evaluation_id)
        return {"jobId": job_id, "evaluationIds": evaluation_ids}

    async def retry(self, evaluation_id: str, criterion_id: str) -> dict:
        with self.db.transaction() as conn:
            evaluation = self.db.get_evaluation(evaluation_id, conn)
            require_evaluation_visible(evaluation)
            if not llm_switch.provider_configured('judge', self.settings):
                raise ApiError('model_unavailable', 'Оценка недоступна: настройте ключ и модель OpenRouter', 503)
            if evaluation["status"] in {"queued", "running"}:
                raise ApiError("evaluation_running", "Оценка ещё выполняется", 409)
            item = next((i for i in evaluation["items"] if i["criterionId"] == criterion_id), None)
            if item is None:
                raise ApiError("not_found", f"Критерий {criterion_id} не найден в оценке", 404)
            if item["status"] != "failed":
                raise ApiError("criterion_not_failed", "Повтор доступен только для критерия с ошибкой", 409)
            require_current_judge_compatibility(evaluation)
            item.update(status="pending", explanation=None, answer=None, reused=False)
            evaluation.update(status="queued", total=None, finishedAt=None, durationMs=None)
            # A retry must invoke the provider for the failed step, even if a
            # different evaluation completed while the original was failing.
            evaluation["_retryCriterion"] = criterion_id
            self.db.save_evaluation(evaluation, conn)
        self._refresh_jobs(evaluation_id)
        self._schedule(evaluation_id)
        return public_evaluation(evaluation)

    def _schedule(self, evaluation_id: str) -> None:
        if getattr(self.settings, 'worker_mode', 'standalone') == 'api' or self._closing:
            return
        existing = self._evaluations.get(evaluation_id)
        if existing is not None and not existing.done():
            return
        task = asyncio.create_task(self._run_evaluation(evaluation_id))
        self._evaluations[evaluation_id] = task
        def finished_callback(finished):
            if self._evaluations.get(evaluation_id) is finished:
                self._evaluations.pop(evaluation_id, None)
        task.add_done_callback(finished_callback)

    def poll_pending(self) -> None:
        """Discover API-created rows; called only by the leased daemon."""
        if getattr(self.settings, 'worker_mode', 'standalone') != 'worker' or self._closing:
            return
        with self.db.read_connection() as conn:
            jobs = self.db.all_jobs(conn)
            pending = self.db.all_evaluations(conn, statuses=('queued',))
        for job in jobs:
            for item in job['items']:
                self._jobs_by_evaluation.setdefault(item['evaluationId'], set()).add(job['id'])
        for evaluation in reversed(pending):
            if is_evaluation_visible(evaluation):
                self._schedule(evaluation['id'])

    async def _run_evaluation(self, evaluation_id: str) -> None:
        try:
            with self.db.transaction() as conn:
                if self.background_guard:
                    self.background_guard(conn)
                evaluation = self.db.get_evaluation(evaluation_id, conn)
                evaluation["status"] = "running"
                evaluation["startedAt"] = evaluation["startedAt"] or utcnow()
                self.db.save_evaluation(evaluation, conn)
            self._refresh_jobs(evaluation_id)
            checklist = self.db.get_checklist(evaluation["checklistId"])
            conversation = evaluation.get("_conversation") or self.db.get_conversation(evaluation["conversationId"])
            if conversation["transcriptHash"] != evaluation["transcriptHash"]:
                raise JudgeError("Транскрипт изменился; запустите новую оценку")
            criteria = {criterion["id"]: criterion for criterion in checklist["criteria"]}
            pending = [item["criterionId"] for item in evaluation["items"] if item["status"] in {"pending", "running"}]
            outcomes = await asyncio.gather(*[
                self._run_criterion(evaluation_id, criteria[criterion_id], conversation)
                for criterion_id in pending
            ], return_exceptions=True)
            for outcome in outcomes:
                if isinstance(outcome, BaseException):
                    raise outcome
            with self.db.transaction() as conn:
                if self.background_guard:
                    self.background_guard(conn)
                evaluation = self.db.get_evaluation(evaluation_id, conn)
                self._aggregate(evaluation)
                if all(item["status"] == "done" for item in evaluation["items"]):
                    evaluation.update(score_evaluation(checklist, evaluation["items"]))
                    evaluation["status"] = "done"
                    evaluation["originalTotal"] = evaluation["total"]
                else:
                    evaluation.update(status="failed", total=None, sections=[])
                evaluation["finishedAt"] = utcnow()
                evaluation["durationMs"] = max(0, round((
                    datetime.fromisoformat(evaluation["finishedAt"].replace("Z", "+00:00"))
                    - datetime.fromisoformat(evaluation["startedAt"].replace("Z", "+00:00"))
                ).total_seconds() * 1000))
                evaluation.pop("_retryCriterion", None)
                self.db.save_evaluation(evaluation, conn)
            self._refresh_jobs(evaluation_id)
        except asyncio.CancelledError:
            # Durable queued/running state is resumed by start().
            raise
        except Exception:
            # A replaced daemon must not overwrite the new owner's state.
            if self.background_guard:
                self.background_guard()
            logger.exception("Не удалось завершить оценку %s", evaluation_id)
            with self.db.transaction() as conn:
                if self.background_guard:
                    self.background_guard(conn)
                evaluation = self.db.get_evaluation(evaluation_id, conn)
                for item in evaluation["items"]:
                    if item["status"] in {"pending", "running"}:
                        item.update(status="failed", explanation="Не удалось завершить оценку. Повторите критерий.")
                evaluation.update(status="failed", total=None, finishedAt=utcnow())
                self._aggregate(evaluation)
                self.db.save_evaluation(evaluation, conn)
            self._refresh_jobs(evaluation_id)

    def _find_reusable(self, evaluation: dict, criterion: dict):
        real = not llm_switch.has_provider_overrides()
        allowed_identities = reusable_judge_identities(evaluation.get('_judgeIdentity')) if real else set()
        for previous in self.db.all_evaluations():
            if previous["id"] == evaluation["id"] or previous["conversationId"] != evaluation["conversationId"]:
                continue
            if previous.get("transcriptHash") != evaluation["transcriptHash"]:
                continue
            if real and not is_evaluation_visible(previous):
                continue
            if real and previous.get("_judgeIdentity") not in allowed_identities:
                continue
            old_criterion = next((
                c for c in self.db.get_checklist(previous["checklistId"])["criteria"]
                if c["id"] == criterion["id"]
            ), None)
            if old_criterion is None or old_criterion["contentHash"] != criterion["contentHash"]:
                continue
            source = next((i for i in previous["items"] if i["criterionId"] == criterion["id"] and i["status"] == "done"), None)
            if source is not None:
                model = source.get("model") if real else (source.get("model") or previous["model"])
                if real and not is_real_model(model):
                    continue
                item = copy.deepcopy(source)
                item.update(
                    criterionHash=criterion["hash"], weight=criterion["weight"],
                    answer=(source.get("original") or {}).get("answer", source["answer"]),
                    original=None, appealId=None, fraction=None, effectiveWeight=0.0, points=0.0,
                    reused=True, usage=zero_usage(),
                    model=model,
                    latencyMs=0,
                )
                return item, model
        return None

    async def _run_criterion(self, evaluation_id: str, criterion: dict, conversation: dict) -> None:
        evaluation = self.db.get_evaluation(evaluation_id)
        previous_usage = next(i.get("usage") for i in evaluation["items"] if i["criterionId"] == criterion["id"])
        reusable = None
        if evaluation.get("_reuse") and evaluation.get("_retryCriterion") != criterion["id"]:
            reusable = self._find_reusable(evaluation, criterion)
        if reusable:
            item, model = reusable
        else:
            self._save_item(evaluation_id, criterion["id"], {"status": "running"})
            model = None
            result = None
            try:
                async def compatible_judge(source, rule):
                    # Check when a worker actually starts, including resumed
                    # jobs and work that waited behind another provider call.
                    require_current_judge_compatibility(evaluation)
                    if self.background_guard:
                        self.background_guard()
                    return await llm_switch.get_judge().judge(source, rule)

                raw = await self.call_model(
                    compatible_judge,
                    Conversation.model_validate(conversation), Criterion.model_validate(criterion),
                )
                result = raw if isinstance(raw, JudgeResult) else JudgeResult.model_validate(raw)
                model = result.model
                # The provider already incurred this usage, even if its answer
                # is rejected below. Retried failures keep their incurred usage.
                self.db.record_usage(result.usage.model_dump(by_alias=True), latency_ms=result.latency_ms, kind="evaluation")
                validate_judge_result(result, criterion, conversation)
                item = result_to_item(result, criterion)
                item["usage"] = sum_usage([previous_usage, item["usage"]])
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                item = empty_item(criterion)
                failure_usage = getattr(exc, "usage", None) if result is None else None
                if failure_usage is not None:
                    failure_usage = Usage.model_validate(failure_usage).model_dump(by_alias=True)
                    self.db.record_usage(failure_usage, latency_ms=getattr(exc, "latency_ms", 0), kind="evaluation")
                    model = getattr(exc, "model", None) or model
                    item["latencyMs"] = getattr(exc, "latency_ms", None)
                if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
                    message = "Модель не ответила вовремя. Повторите критерий."
                elif isinstance(exc, JudgeError):
                    message = str(exc)
                elif isinstance(exc, ApiError) and exc.code == 'provider_changed':
                    message = exc.message
                elif isinstance(exc, (ValidationError, ApiError)):
                    message = "Модель вернула недопустимый ответ. Повторите критерий."
                    logger.warning("Неверный ответ модели в %s/%s: %s", evaluation_id, criterion["id"], type(exc).__name__)
                else:
                    message = "Не удалось получить ответ модели. Повторите критерий."
                    logger.exception("Ошибка модели в %s/%s", evaluation_id, criterion["id"])
                item.update(status="failed", explanation=message)
                if previous_usage or result is not None or failure_usage:
                    item["usage"] = sum_usage([previous_usage, result.usage.model_dump(by_alias=True) if result else failure_usage])
        self._save_item(evaluation_id, criterion["id"], item, model)

    def _save_item(self, evaluation_id: str, criterion_id: str, changes: dict, model: str | None = None) -> None:
        with self.db.transaction() as conn:
            if self.background_guard:
                self.background_guard(conn)
            evaluation = self.db.get_evaluation(evaluation_id, conn)
            item = next(i for i in evaluation["items"] if i["criterionId"] == criterion_id)
            item.update(changes)
            if model:
                evaluation["model"] = model
                item["model"] = model
            self._aggregate(evaluation)
            self.db.save_evaluation(evaluation, conn)
        self._refresh_jobs(evaluation_id)

    @staticmethod
    def _aggregate(evaluation: dict) -> None:
        evaluation["usage"] = sum_usage(i.get("usage") for i in evaluation["items"] if not i.get("reused"))
        evaluation["needsReviewCount"] = sum(bool(i.get("needsReview")) for i in evaluation["items"] if i["status"] == "done")

    def _refresh_jobs(self, evaluation_id: str) -> None:
        for job_id in self._jobs_by_evaluation.get(evaluation_id, ()):
            self._refresh_job(job_id)

    def _refresh_job(self, job_id: str) -> dict:
        with self.db.transaction() as conn:
            job = self.db.get_job(job_id, conn)
            usages = []
            for item in job["items"]:
                evaluation = self.db.get_evaluation(item["evaluationId"], conn)
                item["status"] = evaluation["status"]
                usages.append(evaluation.get("usage"))
            job["done"] = sum(item["status"] == "done" for item in job["items"])
            job["failed"] = sum(item["status"] == "failed" for item in job["items"])
            job["status"] = (
                ("failed" if job["failed"] else "done")
                if job["done"] + job["failed"] == job["total"] else "running"
            )
            job["usage"] = sum_usage(usages)
            self.db.save_job(job, conn)
        return job


class EvaluationRequest(ApiModel):
    conversation_ids: list[str] = Field(min_length=1, max_length=10000)
    checklist_id: str
    reuse: bool = True


@router.post("/evaluations", status_code=202)
async def create_evaluations(body: EvaluationRequest, request: Request):
    return await request.app.state.queue.submit(body.conversation_ids, body.checklist_id, body.reuse)


@router.get("/evaluations/{evaluation_id}")
async def get_evaluation(evaluation_id: str, request: Request):
    evaluation = request.app.state.db.get_evaluation(evaluation_id)
    require_evaluation_visible(evaluation)
    return public_evaluation(evaluation)


@router.get("/evaluations/{evaluation_id}/conversation")
async def get_evaluation_conversation(evaluation_id: str, request: Request):
    db = request.app.state.db
    with db.read_connection() as conn:
        evaluation = db.get_evaluation(evaluation_id, conn)
        require_evaluation_visible(evaluation)
        return source_conversation(db, evaluation, conn)


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    db = request.app.state.db
    job = db.get_job(job_id)
    for item in job["items"]:
        require_evaluation_visible(db.get_evaluation(item["evaluationId"]))
    return request.app.state.queue._refresh_job(job_id)


@router.get("/jobs")
async def list_jobs(request: Request, status: str = "active"):
    """Discover existing active work after reload; never submit or restart work."""
    if status != "active":
        raise ApiError("invalid_filter", "Доступен фильтр status=active", 400)
    db = request.app.state.db
    items = []
    with db.read_connection() as conn:
        jobs = [job for job in db.all_jobs(conn) if job['status'] in {'queued', 'running'} and job['items']]
        ids = {item['evaluationId'] for job in jobs for item in job['items']}
        records = {row['id']: row for row in db.all_evaluations(conn, ids=ids)}
    for job in jobs:
        missing = next((item['evaluationId'] for item in job['items'] if item['evaluationId'] not in records), None)
        if missing is not None:
            raise ApiError('not_found', f'Оценка {missing} не найдена', 404)
        evaluations = [records[item['evaluationId']] for item in job['items']]
        if not all(is_evaluation_visible(evaluation) for evaluation in evaluations):
            continue
        items.append({**job, "checklistId": evaluations[0]["checklistId"],
                      "checklistVersion": evaluations[0]["checklistVersion"]})
    items.sort(key=lambda job: (job.get("startedAt") or "", int(job["id"].split('_')[-1])), reverse=True)
    return {"items": items}


@router.post("/evaluations/{evaluation_id}/criteria/{criterion_id}/retry", status_code=202)
async def retry_criterion(evaluation_id: str, criterion_id: str, request: Request):
    return await request.app.state.queue.retry(evaluation_id, criterion_id)
