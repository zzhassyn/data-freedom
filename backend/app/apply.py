"""Compare the latest completed evaluations of two immutable checklist versions."""

from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Request

from .db import latest_evaluations


router = APIRouter(prefix="/api", tags=["checklists"])


def compare_evaluations(before_evaluations: list[dict], after_evaluations: list[dict]) -> dict:
    """Keep unpaired results visible, without treating missing scores as zero.

    The summary's total is the union of evaluated conversations. Its numeric
    change count and average use only conversations with scores on both sides.
    """
    before = {item["conversationId"]: item for item in before_evaluations}
    after = {item["conversationId"]: item for item in after_evaluations}
    items = []
    deltas = []
    changed_count = 0
    for conversation_id in sorted(before.keys() | after.keys()):
        old = before.get(conversation_id)
        new = after.get(conversation_id)
        old_total = old["total"] if old else None
        new_total = new["total"] if new else None
        old_answers = {item["criterionId"]: item["answer"] for item in old["items"]} if old else {}
        new_answers = {item["criterionId"]: item["answer"] for item in new["items"]} if new else {}
        # Preserve the new checklist's order, then append removed criteria.
        criterion_ids = list(new_answers) + [key for key in old_answers if key not in new_answers]
        changed = [
            {"criterionId": key, "before": old_answers.get(key), "after": new_answers.get(key)}
            for key in criterion_ids
            if old_answers.get(key) != new_answers.get(key)
        ] if old and new else []
        items.append({
            "conversationId": conversation_id,
            "before": old_total,
            "after": new_total,
            "changed": changed,
        })
        if old_total is not None and new_total is not None:
            delta = Decimal(str(new_total)) - Decimal(str(old_total))
            deltas.append(delta)
            changed_count += int(delta != 0)
    average = (
        float((sum(deltas) / len(deltas)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        if deltas else None
    )
    return {
        "items": items,
        "summary": {"changedCount": changed_count, "total": len(items), "avgDelta": average},
    }


@router.get("/checklists/{checklist_id}/compare")
async def compare_checklists(
    checklist_id: str, request: Request, against: str, groupId: str | None = None
) -> dict:
    db = request.app.state.db
    # Resolve both versions even for an empty dataset, so typos return a 404.
    target = db.get_checklist(checklist_id)
    source = db.get_checklist(against)
    return compare_evaluations(
        latest_evaluations(db, source["id"], groupId),
        latest_evaluations(db, target["id"], groupId),
    )
