"""Exports keep the model's answer separate from the final reviewed answer."""
import csv
import io
import re

from fastapi import APIRouter, Request, Response

from .db import json_dumps, latest_evaluations
from .errors import ApiError
from .scoring import score_evaluation

router = APIRouter(prefix="/api")


def original_scores(db, evaluation):
    checklist = db.get_checklist(evaluation["checklistId"])
    items = [{**item, "answer": item["original"]["answer"] if item.get("original") else item["answer"]}
             for item in evaluation["items"]]
    return score_evaluation(checklist, items)


@router.get("/export")
def export_results(request: Request, groupId: str | None = None,
                   checklistId: str | None = None, format: str = "csv"):
    if format not in {"csv", "json"}:
        raise ApiError("invalid_format", "Выберите формат csv или json", 400)
    db = request.app.state.db
    checklist = db.get_checklist(checklistId or "active")
    evaluations = latest_evaluations(db, checklist["id"], groupId or None)
    filename_group = re.sub(r"[^a-zA-Z0-9_-]", "_", groupId or "ALL")
    filename = f"dataavengers-{filename_group}-v{checklist['version']}.{format}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if format == "json":
        records = []
        for evaluation in evaluations:
            scored = original_scores(db, evaluation)
            original_by_id = {i["criterionId"]: i for i in scored["items"]}
            records.append({
                "conversationId": evaluation["conversationId"],
                "checklistVersion": evaluation["checklistVersion"], "total": scored["total"],
                "finalTotal": evaluation["total"], "grossError": evaluation["grossError"],
                "items": [{
                    "criterionId": item["criterionId"],
                    "answer": original_by_id[item["criterionId"]]["answer"], "finalAnswer": item["answer"],
                    "points": original_by_id[item["criterionId"]]["points"],
                    "explanation": item["explanation"], "evidence": item["evidence"],
                } for item in evaluation["items"]],
            })
        return Response(json_dumps(records), media_type="application/json", headers=headers)

    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["conversation_id", "criterion_id", "answer", "points", "effective_weight", "total",
                     "gross_flagged", "final_answer", "final_total"])
    for evaluation in evaluations:
        scored = original_scores(db, evaluation)
        original_by_id = {i["criterionId"]: i for i in scored["items"]}
        for item in evaluation["items"]:
            before = original_by_id[item["criterionId"]]
            writer.writerow([evaluation["conversationId"], item["criterionId"], before["answer"],
                             before["points"], before["effectiveWeight"], scored["total"],
                             str(evaluation["grossError"]["flagged"]).lower(), item["answer"], evaluation["total"]])
    return Response(stream.getvalue().encode("utf-8-sig"), media_type="text/csv; charset=utf-8", headers=headers)
