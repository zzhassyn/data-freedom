"""Appeals preserve the judge's answer while applying a reviewer's decision."""

from typing import Any

from fastapi import APIRouter, Body, Request

from .db import utcnow
from .errors import ApiError
from .evaluations import public_evaluation, source_conversation
from .scoring import score_evaluation, validate_answer


router = APIRouter(prefix="/api")


def _required_text(body: dict[str, Any], field: str, label: str) -> str:
    value = body.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ApiError("invalid_request", f"Поле «{label}» обязательно", 400)
    return value.strip()


def _criterion_and_item(db, evaluation: dict, criterion_id: str, conn=None):
    checklist = db.get_checklist(evaluation["checklistId"], conn)
    criterion = next(
        (c for c in checklist["criteria"] if c["id"] == criterion_id), None
    )
    item = next(
        (i for i in evaluation["items"] if i["criterionId"] == criterion_id), None
    )
    if criterion is None or item is None:
        raise ApiError("not_found", f"Критерий {criterion_id} не найден в оценке", 404)
    return checklist, criterion, item


@router.post("/appeals", status_code=201)
async def create_appeal(request: Request, body: dict = Body(...)):
    evaluation_id = _required_text(body, "evaluationId", "Оценка")
    criterion_id = _required_text(body, "criterionId", "Критерий")
    comment = body.get("comment")
    if not isinstance(comment, str) or len(comment.strip()) < 10:
        raise ApiError(
            "comment_too_short", "Комментарий должен содержать не меньше 10 символов", 400
        )
    comment = comment.strip()
    proposed = body.get("proposedAnswer")
    db = request.app.state.db
    with db.transaction() as conn:
        evaluation = db.get_evaluation(evaluation_id, conn)
        if evaluation["status"] != "done":
            raise ApiError(
                "evaluation_not_ready", "Апелляцию можно подать после завершения оценки", 409
            )
        _, criterion, item = _criterion_and_item(db, evaluation, criterion_id, conn)
        if item["status"] != "done" or item.get("answer") is None:
            raise ApiError("evaluation_not_ready", "Критерий ещё не оценён", 409)
        if proposed is not None:
            validate_answer(criterion, proposed)
        if any(
            appeal["evaluationId"] == evaluation_id
            and appeal["criterionId"] == criterion_id
            and appeal["status"] == "open"
            for appeal in db.all_appeals(conn)
        ):
            raise ApiError("appeal_exists", "По этому критерию уже открыта апелляция", 409)
        appeal = {
            "id": db.next_id("ap", conn),
            "evaluationId": evaluation_id,
            "conversationId": evaluation["conversationId"],
            "criterionId": criterion_id,
            "comment": comment,
            "proposedAnswer": proposed,
            "createdAt": utcnow(),
            "status": "open",
            "originalAnswer": item["answer"],
            "originalPoints": item["points"],
            "decision": None,
            "totalBefore": evaluation["total"],
            "totalAfter": None,
            "secondOpinion": None,
        }
        item["appealId"] = appeal["id"]
        db.save_appeal(appeal, conn)
        db.save_evaluation(evaluation, conn)
    return appeal


@router.get("/appeals")
async def list_appeals(request: Request, status: str = "open"):
    if status not in {"open", "decided", "all"}:
        raise ApiError("invalid_filter", "Статус апелляций должен быть open, decided или all", 400)
    db = request.app.state.db
    with db.transaction() as conn:
        appeals = db.all_appeals(conn)
        counts = {
            "open": sum(a["status"] == "open" for a in appeals),
            "decided": sum(a["status"] != "open" for a in appeals),
        }
        opened = sorted(
            (a for a in appeals if a["status"] == "open"),
            key=lambda a: (a["createdAt"], int(a["id"].split("_")[-1])),
        )
        decided = sorted(
            (a for a in appeals if a["status"] != "open"),
            key=lambda a: (
                (a.get("decision") or {}).get("decidedAt", a["createdAt"]),
                int(a["id"].split("_")[-1]),
            ),
            reverse=True,
        )
        selected = opened if status == "open" else decided if status == "decided" else opened + decided
        items = []
        for appeal in selected:
            evaluation = db.get_evaluation(appeal["evaluationId"], conn)
            _, criterion, _ = _criterion_and_item(db, evaluation, appeal["criterionId"], conn)
            conversation = source_conversation(db, evaluation, conn)
            items.append(
                {
                    **appeal,
                    "criterionTitle": criterion["title"],
                    "conversationLanguage": conversation["language"],
                    "channel": conversation["channel"],
                }
            )
    return {"items": items, "counts": counts}


@router.get("/appeals/{appeal_id}")
async def get_appeal(request: Request, appeal_id: str):
    db = request.app.state.db
    with db.transaction() as conn:
        appeal = db.get_appeal(appeal_id, conn)
        evaluation = db.get_evaluation(appeal["evaluationId"], conn)
        _, criterion, _ = _criterion_and_item(db, evaluation, appeal["criterionId"], conn)
        conversation = source_conversation(db, evaluation, conn)
    return {**appeal, "evaluation": public_evaluation(evaluation), "conversation": conversation, "criterion": criterion}


@router.post("/appeals/{appeal_id}/decision")
async def decide_appeal(request: Request, appeal_id: str, body: dict = Body(...)):
    action = body.get("action")
    if action not in ("confirm", "change"):
        raise ApiError("invalid_decision", "Решение должно быть confirm или change", 400)
    reason = body.get("reason")
    if not isinstance(reason, str) or len(reason.strip()) < 10:
        raise ApiError(
            "reason_too_short", "Причина решения должна содержать не меньше 10 символов", 400
        )
    reason = reason.strip()
    db = request.app.state.db
    with db.transaction() as conn:
        appeal = db.get_appeal(appeal_id, conn)
        if appeal["status"] != "open":
            raise ApiError("appeal_decided", "Решение по этой апелляции уже принято", 409)
        evaluation = db.get_evaluation(appeal["evaluationId"], conn)
        checklist, criterion, item = _criterion_and_item(db, evaluation, appeal["criterionId"], conn)
        new_answer = body.get("newAnswer") if action == "change" else None
        if action == "change":
            validate_answer(criterion, new_answer)
            if item.get("original") is None:
                item["original"] = {
                    "answer": item["answer"],
                    "points": item["points"],
                    "effectiveWeight": item["effectiveWeight"],
                }
            item["answer"] = new_answer
            # Keep the original explanation/evidence: the reviewer's reason lives in the appeal.
            evaluation.update(score_evaluation(checklist, evaluation["items"]))
            appeal["status"] = "changed"
            appeal["totalAfter"] = evaluation["total"]
            db.save_evaluation(evaluation, conn)
            db.invalidate_cache("coaching", evaluation["id"], conn)
        else:
            appeal["status"] = "confirmed"
            appeal["totalAfter"] = evaluation["total"]
        appeal["decision"] = {
            "action": action,
            "newAnswer": new_answer,
            "reason": reason,
            "decidedAt": utcnow(),
        }
        db.save_appeal(appeal, conn)
    return {"appeal": appeal, "evaluation": public_evaluation(evaluation)}
