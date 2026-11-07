"""The single authoritative implementation of checklist scoring."""

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP, localcontext

from .errors import ApiError


def validate_answer(criterion: dict, answer) -> None:
    """Validate a model, appeal or gold answer against its checklist version."""
    title = criterion.get("title", criterion.get("id", ""))
    valid = False
    if answer == "na":
        valid = bool(criterion.get("naAllowed"))
    elif criterion.get("type") in ("binary", "flag"):
        valid = isinstance(answer, str) and answer in ("yes", "no")
    elif criterion.get("type") == "scale":
        valid = (
            isinstance(answer, (int, float, Decimal))
            and not isinstance(answer, bool)
            and Decimal(str(answer)).is_finite()
            and any(Decimal(str(answer)) == Decimal(str(step["value"]))
                    for step in criterion.get("scale") or [])
        )
    if not valid:
        raise ApiError("invalid_answer", f"Недопустимый ответ для критерия «{title}»", 400)


def _fraction(criterion: dict, answer):
    if answer is None or answer == "na":
        return None
    if answer == "yes":
        return Decimal(1)
    if answer == "no":
        return Decimal(0)
    maximum = max(Decimal(str(step["value"])) for step in criterion["scale"])
    return Decimal(str(answer)) / maximum


def score_evaluation(checklist: dict, items: list[dict]) -> dict:
    """Return scored copies; round only the final total, half upwards.

    Sections remain unrounded JSON numbers. When no weighted criterion applies,
    both total and sections are null, as specified in contract section 3.
    This calculation also supports an all-N/A artificial fixture; answer validity
    is enforced at model, appeal and gold boundaries using validate_answer.
    """
    criteria = sorted(checklist["criteria"], key=lambda criterion: criterion["order"])
    by_id = {item["criterionId"]: deepcopy(item) for item in items}
    complete = all(c["id"] in by_id and by_id[c["id"]].get("answer") is not None
                   and by_id[c["id"]].get("status", "done") == "done" for c in criteria)
    scored = []
    gross = {"flagged": False, "types": [], "criterionId": ""}
    with localcontext() as context:
        context.prec = 50
        weighted = {
            c["id"]: Decimal(str(c["weight"]))
            for c in criteria
            if c["type"] != "flag" and Decimal(str(c["weight"])) > 0
            and by_id.get(c["id"], {}).get("answer") not in ("na", None)
            and by_id.get(c["id"], {}).get("status", "done") == "done"
        }
        total_weight = sum(weighted.values(), Decimal(0))
        sections = {s["id"]: {"earned": Decimal(0), "max": Decimal(0)}
                    for s in checklist["sections"]}
        earned = Decimal(0)
        for criterion in criteria:
            item = by_id.get(criterion["id"], {"criterionId": criterion["id"], "answer": None})
            answer = item.get("answer")
            fraction = _fraction(criterion, answer)
            effective = (weighted[criterion["id"]] * Decimal(100) / total_weight
                         if criterion["id"] in weighted and total_weight else Decimal(0))
            points = (fraction or Decimal(0)) * effective
            item.update(fraction=None if fraction is None else float(fraction),
                        weight=criterion["weight"], effectiveWeight=float(effective), points=float(points))
            scored.append(item)
            sections[criterion["sectionId"]]["earned"] += points
            sections[criterion["sectionId"]]["max"] += effective
            earned += points
            if criterion["type"] == "flag":
                if not gross["criterionId"]:
                    gross["criterionId"] = criterion["id"]
                if answer == "yes":
                    gross["flagged"] = True
                    gross["criterionId"] = criterion["id"]
                    gross["types"] = list(dict.fromkeys(gross["types"] + (item.get("flagTypes") or [])))
        return {
            "items": scored,
            "sections": [
                {"sectionId": s["id"], "earned": float(sections[s["id"]]["earned"]),
                 "max": float(sections[s["id"]]["max"])}
                for s in sorted(checklist["sections"], key=lambda section: section["order"])
            ] if total_weight and complete else None,
            "total": float(earned.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            if total_weight and complete else None,
            "grossError": gross,
        }
