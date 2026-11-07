"""Summary and model accuracy against independently supplied annotations."""

from __future__ import annotations

import csv
import io
import json
from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from math import isfinite

from fastapi import APIRouter, Request

from .db import json_dumps, latest_evaluations
from .errors import ApiError
from .scoring import score_evaluation, validate_answer


router = APIRouter(prefix="/api")


def _mean(values: list[float | int], rounded: bool = False) -> float | None:
    if not values:
        return None
    value = sum((Decimal(str(item)) for item in values), Decimal(0)) / len(values)
    if rounded:
        value = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(value)


def _bucket(criterion: dict, answer: str | int | float) -> str:
    if answer == "na":
        return "na"
    if criterion["type"] == "scale":
        return "yes" if answer == max(step["value"] for step in criterion["scale"]) else "no"
    return answer


@router.get("/stats")
def stats(request: Request, checklistId: str | None = None, groupId: str | None = None):
    db = request.app.state.db
    checklist = db.get_checklist(checklistId or "active")
    evaluations = latest_evaluations(db, checklist["id"], groupId or None)
    conversations = {conversation["id"]: conversation for conversation in db.all_conversations()}
    totals = [evaluation["total"] for evaluation in evaluations if evaluation["total"] is not None]
    by_criterion = []
    for criterion in sorted(checklist["criteria"], key=lambda item: item["order"]):
        counts = {"yes": 0, "no": 0, "na": 0}
        by_language = {language: {"yes": 0, "no": 0, "na": 0} for language in ("RU", "KZ", "EN")}
        fractions = []
        for evaluation in evaluations:
            item = next((item for item in evaluation["items"] if item["criterionId"] == criterion["id"]), None)
            if item is None or item["status"] != "done":
                continue
            bucket = _bucket(criterion, item["answer"])
            counts[bucket] += 1
            by_language[conversations[evaluation["conversationId"]]["language"]][bucket] += 1
            if item.get("fraction") is not None:
                fractions.append(item["fraction"])
        by_criterion.append({
            "criterionId": criterion["id"], **counts,
            "avgFraction": _mean(fractions), "byLanguage": by_language,
        })
    evaluation_ids = {
        evaluation["id"] for evaluation in db.all_evaluations()
        if evaluation["checklistId"] == checklist["id"]
        and (not groupId or conversations.get(evaluation["conversationId"], {}).get("datasetGroupId") == groupId)
    }
    appeals = {"open": 0, "confirmed": 0, "changed": 0}
    for appeal in db.all_appeals():
        if appeal["evaluationId"] in evaluation_ids:
            appeals[appeal["status"]] += 1
    return {
        "evaluated": len(evaluations), "avgTotal": _mean(totals, rounded=True),
        "grossCount": sum(bool(evaluation["grossError"]["flagged"]) for evaluation in evaluations),
        "byCriterion": by_criterion,
        "totals": [{"conversationId": evaluation["conversationId"], "total": evaluation["total"]} for evaluation in evaluations],
        "appeals": appeals,
    }


def _parse_answer(value: str):
    value = value.strip()
    if value in {"yes", "no", "na"}:
        return value
    try:
        number = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("Недопустимый ответ") from exc
    if not number.is_finite():
        raise ValueError("Ответ должен быть конечным числом")
    numeric = float(number)
    if not isfinite(numeric) or Decimal(str(numeric)) != number:
        raise ValueError("Числовой ответ не совпадает со ступенью шкалы")
    return int(number) if number == number.to_integral_value() else numeric


@router.post("/gold")
async def upload_gold(request: Request):
    db = request.app.state.db
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "text/csv":
        raise ApiError("invalid_gold", "Загрузите gold.csv с типом содержимого text/csv", 400)
    content = await request.body()
    if len(content) > 5 * 1024 * 1024:
        raise ApiError("invalid_gold", "Файл разметки превышает 5 МБ", 400)
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ApiError("invalid_gold", "Разметка должна быть в кодировке UTF-8", 400) from exc
    reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
    required_headers = {"conversation_id", "criterion_id", "answer", "note"}
    try:
        headers = reader.fieldnames
    except csv.Error as exc:
        raise ApiError("invalid_gold", "Не удалось прочитать заголовок CSV", 400) from exc
    if not headers or not required_headers.issubset(headers) or len(headers) != len(set(headers)):
        raise ApiError("invalid_gold", "Нужны столбцы conversation_id,criterion_id,answer,note", 400)
    checklist = db.get_checklist("active")
    criteria = {criterion["id"]: criterion for criterion in checklist["criteria"]}
    conversation_ids = {conversation["id"] for conversation in db.all_conversations()}
    accepted = {}
    skipped = 0
    try:
        for row in reader:
            if None in row or any(row.get(field) is None for field in required_headers):
                skipped += 1
                continue
            conversation_id = row["conversation_id"].strip()
            criterion_id = row["criterion_id"].strip()
            if conversation_id not in conversation_ids or criterion_id not in criteria:
                skipped += 1
                continue
            try:
                answer = _parse_answer(row["answer"])
                validate_answer(criteria[criterion_id], answer, db.get_conversation(conversation_id))
            except (ValueError, ApiError):
                skipped += 1
                continue
            key = (conversation_id, criterion_id)
            if key in accepted:
                skipped += 1
            accepted[key] = (answer, row["note"])
    except csv.Error as exc:
        raise ApiError("invalid_gold", "Не удалось прочитать CSV: проверьте кавычки и разделители", 400) from exc
    affected_conversations = {key[0] for key in accepted}
    with db.transaction() as conn:
        for conversation_id in affected_conversations:
            conn.execute("DELETE FROM gold WHERE conversation_id = ?", (conversation_id,))
        conn.executemany(
            "INSERT INTO gold (conversation_id, criterion_id, answer, note) VALUES (?, ?, ?, ?)",
            [(key[0], key[1], json_dumps(answer), note) for key, (answer, note) in accepted.items()],
        )
    return {"rows": len(accepted), "conversations": len(affected_conversations), "skipped": skipped}


@router.get("/accuracy")
def accuracy(request: Request, checklistId: str | None = None):
    db = request.app.state.db
    checklist = db.get_checklist(checklistId or "active")
    evaluations = latest_evaluations(db, checklist["id"])
    criteria = {criterion["id"]: criterion for criterion in checklist["criteria"]}
    with db.transaction() as conn:
        rows = conn.execute("SELECT conversation_id, criterion_id, answer FROM gold").fetchall()
    gold_by_conversation = {}
    for row in rows:
        if row["criterion_id"] not in criteria:
            continue
        answer = json.loads(row["answer"])
        try:
            validate_answer(criteria[row["criterion_id"]], answer, db.get_conversation(row["conversation_id"]))
        except ApiError:
            # A later checklist can remove a formerly valid scale step or N/A.
            continue
        gold_by_conversation.setdefault(row["conversation_id"], {})[row["criterion_id"]] = answer
    by_criterion = {
        criterion["id"]: {"criterionId": criterion["id"], "compared": 0, "match": 0, "rate": None, "confusion": {}}
        for criterion in sorted(criteria.values(), key=lambda item: item["order"])
    }
    mismatches = []
    compared_conversations = set()
    total_errors = []
    for evaluation in evaluations:
        conversation_id = evaluation["conversationId"]
        gold = gold_by_conversation.get(conversation_id, {})
        model_items = deepcopy(evaluation["items"])
        for item in model_items:
            if item.get("original") is not None:
                item["answer"] = item["original"]["answer"]
            criterion_id = item["criterionId"]
            if criterion_id not in gold or item["status"] != "done":
                continue
            row = by_criterion[criterion_id]
            row["compared"] += 1
            compared_conversations.add(conversation_id)
            if item["answer"] == gold[criterion_id]:
                row["match"] += 1
            else:
                confusion = f"{gold[criterion_id]}→{item['answer']}"
                row["confusion"][confusion] = row["confusion"].get(confusion, 0) + 1
                mismatches.append({"conversationId": conversation_id, "criterionId": criterion_id,
                                   "gold": gold[criterion_id], "model": item["answer"]})
        # A partial annotation cannot yield a comparable 100-point total.
        if set(criteria).issubset(gold):
            gold_items = [{"criterionId": criterion_id, "answer": answer, "status": "done"}
                          for criterion_id, answer in gold.items()]
            gold_total = score_evaluation(checklist, gold_items)["total"]
            model_total = score_evaluation(checklist, model_items)["total"]
            if gold_total is not None and model_total is not None:
                total_errors.append(abs(Decimal(str(gold_total)) - Decimal(str(model_total))))
    for row in by_criterion.values():
        if row["compared"]:
            row["rate"] = row["match"] / row["compared"]
    return {
        "conversations": len(compared_conversations), "byCriterion": list(by_criterion.values()),
        "totalMae": _mean(total_errors, rounded=True), "mismatches": mismatches,
    }
