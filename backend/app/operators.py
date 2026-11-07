"""Operator aggregates from current evaluations and cached summary identities."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Request

from .extras import get_cached_summaries
from .read_views import latest_ready

router = APIRouter(prefix="/api")


def _mean(values):
    if not values:
        return None
    return float((sum(Decimal(str(v)) for v in values) / len(values)).quantize(Decimal(".01"), rounding=ROUND_HALF_UP))


@router.get("/operators")
def operators(request: Request, groupId: str | None = None, checklistId: str | None = None):
    db = request.app.state.db
    with db.read_connection() as conn:
        checklist = db.get_checklist(checklistId or "active", conn)
        conversations = {row['id']: row for row in db.all_conversations(conn)}
        evaluations = db.all_evaluations(conn)
        summaries = get_cached_summaries(db, conversations.values(), conn)
    criteria = {criterion["id"]: criterion for criterion in checklist["criteria"]}
    grouped = defaultdict(list)
    for evaluation in latest_ready(evaluations, conversations, checklist["id"], groupId or None):
        summary = summaries.get(evaluation['conversationId'])
        name = summary.get("operatorName") if summary else None
        grouped[name or "Имя не названо"].append(evaluation)
    items = []
    for name, evaluations in grouped.items():
        rates = defaultdict(list)
        for evaluation in evaluations:
            for item in evaluation["items"]:
                criterion = criteria[item["criterionId"]]
                if criterion["type"] != "flag" and item["fraction"] is not None:
                    rates[item["criterionId"]].append(item["fraction"])
        averages = {key: sum(values) / len(values) for key, values in rates.items()}
        weakest = min(averages, key=lambda key: (averages[key], -criteria[key]["weight"], criteria[key]["order"])) if averages else None
        items.append({
            "name": name, "conversations": len(evaluations),
            "avgTotal": _mean([e["total"] for e in evaluations if e["total"] is not None]),
            "weakestCriterionId": weakest, "weakestRate": averages[weakest] if weakest else None,
            "grossCount": sum(bool(e["grossError"]["flagged"]) for e in evaluations),
        })
    items.sort(key=lambda item: (item["name"] == "Имя не названо", -(item["avgTotal"] if item["avgTotal"] is not None else -1), item["name"]))
    return {"items": items}
