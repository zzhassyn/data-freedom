"""Exports keep the model's answer separate from the final reviewed answer."""
import csv
import io
import asyncio
import hashlib
import json
import math
import os
import re
import tempfile
import time
from decimal import Decimal, ROUND_HALF_UP, localcontext
from pathlib import Path

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


# The organizers' identifiers differ from the application's stable criterion IDs.
# Keep the mapping here; the API and command-line exporter share this conversion.
ORGANIZER_CRITERION_IDS = {
    "contact": "contact", "needs": "discovery", "identification": "identification",
    "consultation": "consultation", "empathy": "empathy", "dialogue": "dialogue",
    "closing": "closure", "gross": "critical",
}
ORGANIZER_RULES = {
    "contact": ("binary", 10, False, None),
    "discovery": ("binary", 15, True, None),
    "identification": ("binary", 20, True, None),
    "consultation": ("scale", 20, True, (0, 5, 10, 15, 20)),
    "empathy": ("binary", 15, False, None),
    "dialogue": ("scale", 15, False, (0, 4, 7, 10)),
    "closure": ("binary", 5, True, None),
    "critical": ("flag", 0, False, None),
}
TEAM_NAME = "DataAvengers"


def _export_error(message, code="invalid_results_export", status=400):
    raise ApiError(code, message, status)


def _exact_keys(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        _export_error(f"{label}: неверный набор полей")


def _text(value, label, allow_empty=False):
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        _export_error(f"{label}: требуется непустая строка")
    return value


def _real_model(value):
    return (isinstance(value, str) and bool(value.strip())
            and not re.search(r"(?:^|,)\s*(?:fake|mock|fixture)(?:$|\b|[-:/])", value, re.I))


def _check_value(criterion_id, value):
    kind, _, nullable, scale = ORGANIZER_RULES[criterion_id]
    if value is None:
        if nullable:
            return
    elif kind in {"binary", "flag"}:
        if type(value) is bool:
            return
    elif type(value) in {int, float, Decimal} and value in scale:
        return
    _export_error(f"Критерий {criterion_id}: значение не соответствует формату выгрузки")


def organizer_score(values):
    """Recompute the fixed submission score without intermediate float rounding."""
    with localcontext() as context:
        context.prec = 50
        weight_sum, earned = Decimal(0), Decimal(0)
        for criterion_id, value in values.items():
            _check_value(criterion_id, value)
            kind, weight, _, scale = ORGANIZER_RULES[criterion_id]
            if kind == "flag" or value is None:
                continue
            weight = Decimal(weight)
            fraction = (Decimal(str(value)) / max(scale) if kind == "scale"
                        else Decimal(1 if value else 0))
            weight_sum += weight
            earned += weight * fraction
        if not weight_sum:
            _export_error("Нет применимых критериев для итогового балла")
        return (earned * 100 / weight_sum).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def validate_organizer_manifest(manifest):
    rows = manifest.get("conversations") if isinstance(manifest, dict) else None
    if not isinstance(rows, list) or not rows:
        _export_error("Нет полного списка диалогов набора")
    ids = []
    for row in rows:
        if not isinstance(row, dict):
            _export_error("Неверный список диалогов набора")
        ids.append(_text(row.get("id"), "ID диалога"))
        if type(row.get("turns")) is not int or row["turns"] < 1:
            _export_error("Неизвестно число исходных реплик диалога")
    if len(set(ids)) != len(ids):
        _export_error("В исходном наборе повторяются ID диалогов")
    group = _text(manifest.get("groupId"), "Набор")
    if not isinstance(manifest.get("sourceHash"), str) or not re.fullmatch(r"[a-f0-9]{64}", manifest["sourceHash"]):
        _export_error("Нет проверенного идентификатора версии набора")
    expected_count = 65 if group == "DEV" else 10
    if len(rows) != expected_count:
        _export_error(f"В наборе {group} должно быть {expected_count} диалогов, найдено {len(rows)}")
    if group != "DEV" and any(row.get("channel") != "agent chat" for row in rows):
        _export_error("Контрольный набор должен содержать только чаты")
    if group == "DEV" and (sum(row.get("channel") == "agent chat" for row in rows) != 60
                           or sum(row.get("channel") == "voice call" for row in rows) != 5):
        _export_error("В DEV должны быть 60 чатов и 5 звонков")
    return {row["id"]: row for row in rows}


def validate_organizer_results(document, manifest):
    """Strict JSON 1.0 validation, including source coverage and independent scoring."""
    expected = validate_organizer_manifest(manifest)
    _exact_keys(document, {"schema_version", "team_name", "model", "results"}, "Файл результатов")
    if document["schema_version"] != "1.0" or document["team_name"] != TEAM_NAME:
        _export_error("Неверная версия формата или название команды")
    _exact_keys(document["model"], {"mode", "name"}, "Модель")
    if document["model"]["mode"] != "external_api":
        _export_error("Для этой выгрузки mode должен быть external_api")
    names = _text(document["model"]["name"], "Название модели", allow_empty=True)
    if names and not _real_model(names):
        _export_error("Демонстрационная модель не допускается в результатах оценки")
    if not isinstance(document["results"], list):
        _export_error("results должен быть массивом")
    seen = set()
    any_ok = False
    for result in document["results"]:
        if not isinstance(result, dict):
            _export_error("Результат диалога должен быть объектом")
        status = result.get("status")
        fields = {"conversation_id", "status", "criteria", "score"}
        if status == "error":
            fields.add("error")
        elif status != "ok":
            _export_error("У результата должен быть status ok или error")
        _exact_keys(result, fields, "Результат диалога")
        cid = _text(result["conversation_id"], "conversation_id")
        if cid not in expected or cid in seen:
            _export_error(f"Диалог {cid}: ID отсутствует в наборе или повторяется")
        seen.add(cid)
        if status == "error":
            if result["criteria"] != [] or result["score"] is not None:
                _export_error(f"Диалог {cid}: ошибка должна иметь пустые criteria и score null")
            _text(result["error"], f"Диалог {cid}, причина ошибки")
            continue
        any_ok = True
        criteria = result["criteria"]
        if not isinstance(criteria, list) or len(criteria) != 8:
            _export_error(f"Диалог {cid}: нужны ровно восемь критериев")
        values = {}
        for criterion in criteria:
            _exact_keys(criterion, {"criterion_id", "value", "rationale", "evidence_turns"}, f"Диалог {cid}, критерий")
            criterion_id = criterion["criterion_id"]
            if not isinstance(criterion_id, str) or criterion_id not in ORGANIZER_RULES or criterion_id in values:
                _export_error(f"Диалог {cid}: неизвестный или повторный код критерия")
            _check_value(criterion_id, criterion["value"])
            values[criterion_id] = criterion["value"]
            _text(criterion["rationale"], f"Диалог {cid}, обоснование {criterion_id}")
            evidence = criterion["evidence_turns"]
            if (not isinstance(evidence, list)
                    or any(type(turn) is not int or not 1 <= turn <= expected[cid]["turns"] for turn in evidence)
                    or len(evidence) != len(set(evidence))):
                _export_error(f"Диалог {cid}: неверные номера исходных реплик")
        _exact_keys(result["score"], {"final_score", "critical_flag"}, f"Диалог {cid}, итог")
        final = result["score"]["final_score"]
        if type(final) not in {int, float, Decimal}:
            _export_error(f"Диалог {cid}: итог должен быть числом")
        actual = Decimal(str(final))
        if not actual.is_finite() or not 0 <= actual <= 100 or actual != organizer_score(values):
            _export_error(f"Диалог {cid}: итог не совпадает с пересчётом и округлением половиной вверх")
        flag = result["score"]["critical_flag"]
        if type(flag) is not bool or flag is not values["critical"]:
            _export_error(f"Диалог {cid}: critical_flag не совпадает с критерием critical")
    if seen != set(expected):
        _export_error("В результатах пропущены диалоги выбранного набора")
    if any_ok and not names.strip():
        _export_error("Для готовых результатов не указана фактически использованная модель")
    return document


def organizer_snapshot(db, group_id):
    """Use the last complete source roster, never the accumulating registry group."""
    if not isinstance(group_id, str) or not group_id.strip() or len(group_id) > 100:
        _export_error("Укажите непустой groupId длиной до 100 символов", "bad_group")
    group_id = group_id.strip()
    roster = db.get_setting("datasetRoster:" + group_id)
    if not isinstance(roster, dict):
        _export_error("Синхронизируйте полный набор перед выгрузкой результатов", "export_roster_missing", 409)
    ids, hashes = roster.get("ids"), roster.get("transcriptHashes")
    if (not isinstance(ids, list) or any(not isinstance(cid, str) or not cid for cid in ids)
            or len(ids) != len(set(ids)) or not isinstance(hashes, dict) or set(hashes) != set(ids)):
        _export_error("Сохранённый список набора повреждён. Повторите синхронизацию", "export_roster_invalid", 409)
    with db.transaction() as conn:
        current = {conversation["id"]: conversation for conversation in db.all_conversations(conn)}
    conversations = []
    for cid in ids:
        conversation = current.get(cid)
        if (not conversation or conversation.get("datasetGroupId") != group_id
                or conversation.get("transcriptHash") != hashes[cid]):
            _export_error("Диалоги изменились после полной синхронизации. Синхронизируйте набор ещё раз", "export_source_changed", 409)
        turns = conversation.get("transcript")
        if not isinstance(turns, list) or any(turn.get("idx") != idx for idx, turn in enumerate(turns)):
            _export_error(f"Диалог {cid}: нарушена исходная нумерация реплик")
        conversations.append(conversation)
    source_hash = hashlib.sha256(json_dumps({"groupId": group_id, "ids": ids, "hashes": hashes}).encode("utf-8")).hexdigest()
    manifest = {
        "groupId": group_id, "sourceHash": source_hash,
        "conversations": [{"id": row["id"], "turns": len(row["transcript"]), "channel": row["channel"]}
                          for row in conversations],
    }
    validate_organizer_manifest(manifest)
    return manifest, conversations


def _original_checklist(db):
    versions = [checklist for checklist in db.all_checklists() if checklist.get("version") == 1]
    if len(versions) != 1:
        _export_error("Не найден исходный чек-лист версии 1", "export_checklist_missing", 409)
    checklist = versions[0]
    criteria = checklist.get("criteria", [])
    if len(criteria) != 8 or {criterion["id"] for criterion in criteria} != set(ORGANIZER_CRITERION_IDS):
        _export_error("Чек-лист должен содержать восемь исходных критериев", "export_checklist_invalid", 409)
    for criterion in criteria:
        kind, weight, _, scale = ORGANIZER_RULES[ORGANIZER_CRITERION_IDS[criterion["id"]]]
        if (criterion.get("type") != kind or criterion.get("weight") != weight
                or (scale is not None and sorted(step["value"] for step in criterion.get("scale") or []) != list(scale))):
            _export_error("Типы, шкалы или веса версии 1 не совпадают с форматом выгрузки", "export_checklist_invalid", 409)
    return checklist


def _model_value(answer, criterion_id):
    kind = ORGANIZER_RULES[criterion_id][0]
    if kind in {"binary", "flag"} and answer not in ("yes", "no", "na"):
        _export_error(f"Критерий {criterion_id}: исходный ответ модели имеет неверный тип")
    if kind == "scale" and answer != "na" and type(answer) not in {int, float, Decimal}:
        _export_error(f"Критерий {criterion_id}: исходный ответ модели имеет неверный тип")
    if answer == "yes":
        value = True
    elif answer == "no":
        value = False
    elif answer == "na":
        value = None
    else:
        value = answer
    _check_value(criterion_id, value)
    return value


def _record_from_evaluation(conversation, checklist, evaluation):
    cid = conversation["id"]
    if evaluation.get("status") == "failed":
        failure = next((item.get("explanation") for item in evaluation.get("items", [])
                        if item.get("status") == "failed" and isinstance(item.get("explanation"), str)
                        and item["explanation"].strip()), None)
        _export_error(failure or "Не удалось оценить диалог по исходному чек-листу")
    if evaluation.get("status") != "done":
        _export_error("Оценка по исходному чек-листу не завершена")
    items = evaluation.get("items")
    if (not isinstance(items, list) or len(items) != 8
            or {item.get("criterionId") for item in items} != set(ORGANIZER_CRITERION_IDS)):
        _export_error("В оценке нет ровно восьми исходных критериев")
    by_id = {item["criterionId"]: item for item in items}
    criterion_hashes = {criterion["id"]: criterion["hash"] for criterion in checklist["criteria"]}
    criteria, models = [], set()
    for internal_id, export_id in ORGANIZER_CRITERION_IDS.items():
        item = by_id[internal_id]
        if item.get("status") != "done" or item.get("criterionHash") != criterion_hashes[internal_id]:
            _export_error("Один из критериев не оценён по исходной версии чек-листа")
        # Legacy evaluation.model is the last finisher, not trustworthy provenance
        # for all eight items. Fresh/reused items must each carry their own model.
        model = item.get("model")
        if not _real_model(model):
            _export_error("Нет подтверждённой оценки реальной модели для каждого критерия. Запустите оценку заново")
        models.add(model.strip())
        original = item.get("original")
        if original is not None and (not isinstance(original, dict) or "answer" not in original):
            _export_error("Не удалось восстановить исходный ответ модели до апелляции")
        source = {**item, **(original or {})}
        value = _model_value(source.get("answer"), export_id)
        rationale = _text(source.get("explanation"), "Обоснование модели").strip()
        evidence = source.get("evidence", [])
        if not isinstance(evidence, list):
            _export_error("Доказательства модели имеют неверный формат")
        evidence_turns = []
        for entry in evidence:
            turn_idx = entry.get("turnIdx") if isinstance(entry, dict) else None
            if type(turn_idx) is not int or not 0 <= turn_idx < len(conversation["transcript"]):
                _export_error("Доказательство модели ссылается на неизвестную исходную реплику")
            quote = entry.get("quote")
            if not isinstance(quote, str) or not quote or quote not in conversation["transcript"][turn_idx]["text"]:
                _export_error("Цитата модели не найдена в исходном транскрипте")
            evidence_turns.append(turn_idx + 1)
        criteria.append({"criterion_id": export_id, "value": value, "rationale": rationale,
                         "evidence_turns": list(dict.fromkeys(evidence_turns))})
    values = {criterion["criterion_id"]: criterion["value"] for criterion in criteria}
    return {
        "conversation_id": cid, "status": "ok", "criteria": criteria,
        "score": {"final_score": float(organizer_score(values)), "critical_flag": values["critical"]},
    }, models


def _matching_evaluations(db, conversations, checklist):
    by_id = {conversation["id"]: [] for conversation in conversations}
    hashes = {conversation["id"]: conversation["transcriptHash"] for conversation in conversations}
    for evaluation in db.all_evaluations():
        cid = evaluation.get("conversationId")
        if (cid in by_id and evaluation.get("checklistId") == checklist["id"]
                and evaluation.get("checklistVersion") == 1 and evaluation.get("transcriptHash") == hashes[cid]):
            by_id[cid].append(evaluation)
    return by_id


def build_organizer_results(db, conversations, checklist, failures=None):
    """Serialize every roster ID; unsuccessful model work remains an error row."""
    by_id = _matching_evaluations(db, conversations, checklist)
    rows, models = [], set()
    for conversation in conversations:
        cid = conversation["id"]
        reason = (failures or {}).get(cid, "Нет готовой оценки по исходному чек-листу версии 1")
        reason_set = bool((failures or {}).get(cid))
        record = None
        for evaluation in by_id[cid]:
            try:
                record, used_models = _record_from_evaluation(conversation, checklist, evaluation)
                models.update(used_models)
                break
            except ApiError as exc:
                if not reason_set:
                    reason = exc.message
                    reason_set = True
        if record is None:
            record = {"conversation_id": cid, "status": "error", "criteria": [], "score": None, "error": reason}
            # A failed call may still have a known real model; never report fake.
            for evaluation in by_id[cid][:1]:
                models.update(item["model"].strip() for item in evaluation.get("items", [])
                              if _real_model(item.get("model")) and item.get("status") in {"done", "failed"})
        rows.append(record)
    return {"schema_version": "1.0", "team_name": TEAM_NAME,
            "model": {"mode": "external_api", "name": ", ".join(sorted(models))}, "results": rows}


async def _wait_for_export_evaluations(db, evaluation_ids, timeout_seconds):
    deadline = time.monotonic() + timeout_seconds
    placeholders = ",".join("?" for _ in evaluation_ids)
    while evaluation_ids:
        with db.transaction() as conn:
            unfinished = conn.execute(
                f"SELECT COUNT(*) FROM evaluations WHERE id IN ({placeholders}) AND status IN ('queued','running')",
                tuple(evaluation_ids),
            ).fetchone()[0]
        if not unfinished:
            return True
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        await asyncio.sleep(min(0.25, remaining))
    return True


async def prepare_organizer_results(db, queue, group_id, *, evaluate_missing=False, timeout_seconds=600, source_hash=None):
    manifest, conversations = organizer_snapshot(db, group_id)
    if source_hash is not None and source_hash != manifest["sourceHash"]:
        _export_error("Набор изменился. Повторите выгрузку", "export_source_changed", 409)
    checklist = _original_checklist(db)
    document = build_organizer_results(db, conversations, checklist)
    missing = [row["conversation_id"] for row in document["results"] if row["status"] == "error"]
    failures = {}
    if evaluate_missing and missing:
        from . import llm_switch
        try:
            provider = llm_switch.get_judge()
            unavailable = getattr(provider, "IS_FAKE", False)
        except Exception:
            unavailable = True
        if unavailable:
            failures = {cid: "Реальная модель недоступна. Демонстрационные оценки в выгрузку не включены" for cid in missing}
        elif queue is None:
            failures = {cid: "Сервис оценки недоступен. Повторите выгрузку после запуска сервера" for cid in missing}
        else:
            matching = _matching_evaluations(db, conversations, checklist)
            waiting, to_submit = [], []
            for cid in missing:
                running = next((evaluation for evaluation in matching[cid]
                                if evaluation.get("status") in {"queued", "running"}
                                and _real_model(evaluation.get("model"))), None)
                if running:
                    waiting.append(running["id"])
                else:
                    to_submit.append(cid)
            try:
                if to_submit:
                    accepted = await queue.submit(to_submit, checklist["id"], reuse=False)
                    waiting.extend(accepted["evaluationIds"].values())
                finished = await _wait_for_export_evaluations(db, waiting, timeout_seconds)
                if not finished:
                    failures = {cid: "Оценка ещё выполняется. Повторите выгрузку после её завершения" for cid in missing}
            except ApiError as exc:
                failures = {cid: exc.message for cid in missing}
            except Exception:
                failures = {cid: "Не удалось запустить оценку. Повторите выгрузку после проверки модели" for cid in missing}
        document = build_organizer_results(db, conversations, checklist, failures)
    latest, _ = organizer_snapshot(db, group_id)
    if latest["sourceHash"] != manifest["sourceHash"]:
        _export_error("Набор изменился во время выгрузки. Повторите её", "export_source_changed", 409)
    validate_organizer_results(document, manifest)
    return document, manifest


def serialize_organizer_results(document, manifest):
    validate_organizer_results(document, manifest)
    payload = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False)
    # Keep numeric JSON scores visibly at two decimal places, including 100.00.
    payload = re.sub(r'^(\s*"final_score": )([0-9]+(?:\.[0-9]+)?)(,?)$',
                     lambda match: match[1] + format(Decimal(match[2]), ".2f") + match[3], payload, flags=re.M)
    encoded = (payload + "\n").encode("utf-8")
    validate_organizer_results(json.loads(encoded.decode("utf-8")), manifest)
    return encoded


def write_organizer_results(document, manifest, output):
    """Validate first, then atomically replace the explicitly requested UTF-8 file."""
    encoded = serialize_organizer_results(document, manifest)
    output = Path(output)
    if output.parent.name == "dev" and manifest["groupId"] != "DEV":
        _export_error("В results/dev нужно сохранить набор DEV")
    if output.parent.name == "prod" and manifest["groupId"] == "DEV":
        _export_error("В results/prod нужно сохранить контрольный набор из 10 чатов")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", prefix="." + output.name + ".", suffix=".tmp", dir=output.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, output)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


@router.get("/export/organizers/manifest")
async def organizer_manifest(request: Request, groupId: str):
    return organizer_snapshot(request.app.state.db, groupId)[0]


@router.post("/export/organizers")
async def export_organizer_results(request: Request):
    body = await request.json()
    if not isinstance(body, dict) or set(body) - {"groupId", "evaluateMissing", "sourceHash", "timeoutSeconds"}:
        _export_error("Неверные параметры выгрузки")
    evaluate_missing = body.get("evaluateMissing", False)
    timeout_seconds = body.get("timeoutSeconds", 600)
    if type(evaluate_missing) is not bool:
        _export_error("evaluateMissing должно быть true или false")
    if type(timeout_seconds) not in {int, float} or not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 1800:
        _export_error("Время ожидания должно быть больше 0 и не больше 1800 секунд")
    source_hash = body.get("sourceHash")
    if source_hash is not None and (not isinstance(source_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", source_hash)):
        _export_error("Неверный идентификатор версии набора")
    state = request.app.state
    if not hasattr(state, "organizer_export_lock"):
        state.organizer_export_lock = asyncio.Lock()
    # One evaluation-creating export at a time avoids duplicate paid work. A
    # read-only download remains immediate and may honestly contain error rows.
    async def prepare():
        return await prepare_organizer_results(state.db, state.queue, body.get("groupId"),
                                              evaluate_missing=evaluate_missing, timeout_seconds=timeout_seconds,
                                              source_hash=source_hash)
    if evaluate_missing:
        async with state.organizer_export_lock:
            document, manifest = await prepare()
    else:
        document, manifest = await prepare()
    return Response(serialize_organizer_results(document, manifest), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="results.json"', "Cache-Control": "no-store"})
