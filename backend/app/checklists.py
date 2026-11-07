"""Immutable checklist versions, content hashes, validation and seed."""

from copy import deepcopy
from hashlib import sha1
import json
from math import isfinite
from pathlib import Path

from fastapi import APIRouter, Body, Request

from .db import utcnow
from .errors import ApiError

router = APIRouter(prefix="/api")
HASH_FIELDS = ("title", "description", "type", "weight", "naAllowed", "naCondition", "scale", "flagTypes")
DIFF_FIELDS = ("title", "description", "type", "weight", "naAllowed", "naCondition", "scale", "flagTypes",
               "sectionId", "order")


def invalid(message: str):
    raise ApiError("invalid_checklist", message, 400)


def _text(value, field: str):
    if not isinstance(value, str) or not value.strip():
        invalid(f"Поле {field} должно содержать непустой текст")
    return value


def _order(value, field: str):
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        invalid(f"Поле {field} должно быть целым неотрицательным числом")
    return value


def _number(value, field: str):
    try:
        valid = not isinstance(value, bool) and isinstance(value, (int, float)) and isfinite(value)
    except OverflowError:
        valid = False
    if not valid:
        invalid(f"Поле {field} должно быть конечным числом")
    return int(value) if value == int(value) else value


def prepare_criterion(body: dict) -> dict:
    if not isinstance(body, dict):
        invalid("Критерий должен быть объектом")
    criterion = {key: deepcopy(body.get(key)) for key in
                 ("id", "sectionId", "order", *HASH_FIELDS)}
    for field in ("id", "sectionId", "title", "description"):
        _text(criterion[field], field)
    _order(criterion["order"], "order")
    title = criterion["title"]
    if criterion["type"] not in ("binary", "scale", "flag"):
        invalid(f"У критерия «{title}» неизвестный тип")
    if not isinstance(criterion["naAllowed"], bool):
        invalid(f"У критерия «{title}» naAllowed должно быть true или false")
    if criterion["naAllowed"]:
        if not isinstance(criterion["naCondition"], str) or not criterion["naCondition"].strip():
            invalid(f"У критерия «{title}» укажите условие N/A")
    elif criterion["naCondition"] is not None and not isinstance(criterion["naCondition"], str):
        invalid(f"У критерия «{title}» условие N/A должно быть текстом или null")
    weight = _number(criterion["weight"], "weight")
    criterion["weight"] = weight
    if criterion["type"] == "flag":
        if weight != 0:
            invalid(f"У критерия «{title}» типа flag вес должен быть 0")
        flags = criterion["flagTypes"]
        if not isinstance(flags, list) or not flags:
            invalid(f"У критерия «{title}» укажите хотя бы один тип нарушения")
        seen_flags = set()
        for flag in flags:
            if not isinstance(flag, dict):
                invalid(f"У критерия «{title}» неверный тип нарушения")
            flag_id = _text(flag.get("id"), "flagTypes.id")
            _text(flag.get("title"), "flagTypes.title")
            if flag_id in seen_flags:
                invalid(f"Два типа нарушения с id {flag_id}")
            seen_flags.add(flag_id)
        criterion["flagTypes"] = [{"id": f["id"], "title": f["title"]} for f in flags]
    else:
        if weight <= 0:
            invalid(f"У критерия «{title}» вес должен быть больше 0")
        if criterion["flagTypes"] is not None:
            invalid(f"У критерия «{title}» flagTypes допустимы только для типа flag")
    if criterion["type"] == "scale":
        scale = criterion["scale"]
        if not isinstance(scale, list) or len(scale) < 2:
            invalid(f"У критерия «{title}» должно быть минимум две ступени шкалы")
        normalized = []
        for step in scale:
            if not isinstance(step, dict):
                invalid(f"У критерия «{title}» неверная ступень шкалы")
            value = _number(step.get("value"), "scale.value")
            if value < 0:
                invalid(f"У критерия «{title}» ступень шкалы меньше 0")
            normalized.append({"value": value, "description": _text(step.get("description"), "scale.description")})
        values = [step["value"] for step in normalized]
        if 0 not in values:
            invalid(f"У критерия «{title}» шкала без ступени 0")
        if len(set(values)) != len(values):
            invalid(f"У критерия «{title}» повторяются ступени шкалы")
        criterion["scale"] = sorted(normalized, key=lambda step: step["value"], reverse=True)
    elif criterion["scale"] is not None:
        invalid(f"У критерия «{title}» scale допустима только для типа scale")
    for key, fields in (("hash", HASH_FIELDS), ("contentHash", tuple(f for f in HASH_FIELDS if f != "weight"))):
        canonical = json.dumps({field: criterion[field] for field in fields}, ensure_ascii=False,
                               sort_keys=True, separators=(",", ":"), allow_nan=False)
        criterion[key] = sha1(canonical.encode("utf-8")).hexdigest()
    return criterion


def prepare_checklist(body: dict) -> dict:
    if not isinstance(body, dict):
        invalid("Чек-лист должен быть объектом")
    name = _text(body.get("name"), "name")
    sections = body.get("sections")
    if not isinstance(sections, list) or not sections:
        invalid("Добавьте хотя бы одну секцию")
    normalized_sections = []
    section_ids = set()
    for section in sections:
        if not isinstance(section, dict):
            invalid("Секция должна быть объектом")
        section_id = _text(section.get("id"), "sections.id")
        if section_id in section_ids:
            invalid(f"Две секции с id {section_id}")
        section_ids.add(section_id)
        normalized_sections.append({"id": section_id, "title": _text(section.get("title"), "sections.title"),
                                    "order": _order(section.get("order"), "sections.order")})
    criteria = body.get("criteria")
    if not isinstance(criteria, list) or not criteria:
        invalid("Добавьте хотя бы один критерий")
    normalized_criteria = []
    criterion_ids = set()
    for raw in criteria:
        criterion = prepare_criterion(raw)
        if criterion["id"] in criterion_ids:
            invalid(f"Два критерия с id {criterion['id']}")
        criterion_ids.add(criterion["id"])
        if criterion["sectionId"] not in section_ids:
            invalid(f"У критерия «{criterion['title']}» неизвестная секция {criterion['sectionId']}")
        normalized_criteria.append(criterion)
    active = body.get("isActive", False)
    if not isinstance(active, bool):
        invalid("Поле isActive должно быть true или false")
    return {"name": name, "isActive": active, "basedOnVersion": body.get("basedOnVersion"),
            "sections": sorted(normalized_sections, key=lambda s: s["order"]),
            "criteria": sorted(normalized_criteria, key=lambda c: c["order"])}


def seed_checklist(db) -> None:
    with db.transaction() as conn:
        if db.all_checklists(conn=conn):
            return
        raw = json.loads((Path(__file__).parent / "seed" / "checklist_v1.json").read_text(encoding="utf-8"))
        body = prepare_checklist(raw)
        body.update(id="cl_1", version=1, createdAt=utcnow(), basedOnVersion=None, isActive=True)
        db.save_checklist(body, conn=conn)


@router.get("/checklists")
def list_checklists(request: Request):
    from .evaluations import is_evaluation_visible
    db = request.app.state.db
    evaluations = [ev for ev in db.all_evaluations() if is_evaluation_visible(ev)]
    keys = ("id", "version", "name", "isActive", "createdAt", "basedOnVersion")
    return {"items": [{**{key: checklist[key] for key in keys},
                       "criteriaCount": len(checklist["criteria"]),
                       "evaluationsCount": sum(e["checklistId"] == checklist["id"] for e in evaluations)}
                      for checklist in sorted(db.all_checklists(), key=lambda c: c["version"], reverse=True)]}


@router.get("/checklists/active")
def active_checklist(request: Request):
    return request.app.state.db.get_checklist("active")


@router.get("/checklists/{checklist_id}")
def get_checklist(checklist_id: str, request: Request):
    return request.app.state.db.get_checklist(checklist_id)


@router.post("/checklists", status_code=201)
def create_checklist(request: Request, body: dict = Body(...)):
    checklist = prepare_checklist(body)
    base = checklist["basedOnVersion"]
    if not isinstance(base, int) or isinstance(base, bool) or base < 1:
        invalid("Укажите номер исходной версии в basedOnVersion")
    db = request.app.state.db
    with db.transaction() as conn:
        versions = db.all_checklists(conn=conn)
        if not any(v["version"] == base for v in versions):
            invalid(f"Исходная версия {base} не найдена")
        version = max(v["version"] for v in versions) + 1
        checklist.update(id=f"cl_{version}", version=version, createdAt=utcnow())
        if checklist["isActive"]:
            for old in versions:
                if old["isActive"]:
                    old["isActive"] = False
                    db.save_checklist(old, conn=conn)
        db.save_checklist(checklist, conn=conn)
    return checklist


@router.post("/checklists/{checklist_id}/activate")
def activate_checklist(checklist_id: str, request: Request):
    db = request.app.state.db
    with db.transaction() as conn:
        target = db.get_checklist(checklist_id, conn=conn)
        for checklist in db.all_checklists(conn=conn):
            if checklist["isActive"] and checklist["id"] != checklist_id:
                checklist["isActive"] = False
                db.save_checklist(checklist, conn=conn)
        target["isActive"] = True
        db.save_checklist(target, conn=conn)
    return target


@router.get("/checklists/{checklist_id}/diff")
def diff_checklists(checklist_id: str, against: str, request: Request):
    db = request.app.state.db
    current = db.get_checklist(checklist_id)
    previous = db.get_checklist(against)
    before = {criterion["id"]: criterion for criterion in previous["criteria"]}
    after = {criterion["id"]: criterion for criterion in current["criteria"]}
    added, removed, changed, unchanged = [], [], [], []
    for criterion_id, criterion in after.items():
        if criterion_id not in before:
            added.append(criterion_id)
            continue
        fields = [field for field in DIFF_FIELDS if criterion[field] != before[criterion_id][field]]
        if fields:
            changed.append({"criterionId": criterion_id, "fields": fields})
        else:
            unchanged.append(criterion_id)
    removed = [criterion_id for criterion_id in before if criterion_id not in after]
    return {"added": added, "removed": removed, "changed": changed, "unchanged": unchanged}
