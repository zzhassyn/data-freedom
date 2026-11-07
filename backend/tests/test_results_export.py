import asyncio
import copy
import json
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest

from app import llm_switch
from app.checklists import prepare_checklist, seed_checklist
from app.conversations import import_records
from app.db import Database, utcnow
from app.errors import ApiError
from app.evaluations import empty_item
from app.export import (
    ORGANIZER_CRITERION_IDS, _original_checklist, build_organizer_results,
    organizer_score, organizer_snapshot, prepare_organizer_results,
    serialize_organizer_results, validate_organizer_results, write_organizer_results,
)
from scripts.export_results import export_from_server


def source_payload(group="CONTROL", size=10):
    return {"data": {"dataset_group_id": group, "total_records": size, "records": [
        {"conversation_id": f"case-{i:03d}", "channel": "voice call" if group == "DEV" and i >= 60 else "agent chat",
         "language": "RU", "audio_url": None, "transcript": [
             {"timestamp": "00:00", "speaker": "client", "text": "Нужна помощь с документом."},
             {"timestamp": "00:01", "speaker": "bot", "text": "Соединяю с оператором."},
             {"timestamp": "00:02", "speaker": "system", "text": "Личность клиента подтверждена."},
             {"timestamp": "00:03", "speaker": "operator", "text": "Здравствуйте, меня зовут Анна."},
             {"timestamp": "00:04", "speaker": "operator", "text": "Документ готов. До свидания."},
         ]} for i in range(size)
    ]}}


def make_evaluation(db, cid, answers=None, *, checklist_id="cl_1", model="provider/model-a", status="done"):
    checklist = db.get_checklist(checklist_id)
    conversation = db.get_conversation(cid)
    defaults = {"contact": "yes", "needs": "yes", "identification": "yes", "consultation": 20,
                "empathy": "yes", "dialogue": 10, "closing": "yes", "gross": "no"}
    defaults.update(answers or {})
    items = []
    for criterion in checklist["criteria"]:
        item = empty_item(criterion)
        item.update(status="done", answer=defaults[criterion["id"]], explanation="Действие подтверждено исходной перепиской.",
                    evidence=[{"turnIdx": idx, "quote": conversation["transcript"][idx]["text"], "kind": "supports"}
                              for idx in (0, 2, 3, 3)], model=model)
        items.append(item)
    with db.transaction() as conn:
        evaluation = {
            "id": db.next_id("ev", conn), "conversationId": cid, "checklistId": checklist["id"],
            "checklistVersion": checklist["version"], "transcriptHash": conversation["transcriptHash"],
            "status": status, "model": "last-finisher/not-authoritative", "items": items,
            "total": -1, "originalTotal": -1, "grossError": {"flagged": False, "types": []},
            "startedAt": utcnow(), "finishedAt": utcnow(), "durationMs": 0,
        }
        db.save_evaluation(evaluation, conn)
    return evaluation


@pytest.fixture
def export_db(tmp_path):
    db = Database(str(tmp_path / "export.sqlite"))
    seed_checklist(db)
    import_records(db, source_payload(), "CONTROL")
    for i in range(10):
        make_evaluation(db, f"case-{i:03d}")
    return db


@pytest.fixture
def valid_pair(export_db):
    manifest, conversations = organizer_snapshot(export_db, "CONTROL")
    document = build_organizer_results(export_db, conversations, _original_checklist(export_db))
    return document, manifest


def test_dev_export_original_answers_original_gross_and_v1(tmp_path):
    db = Database(str(tmp_path / "dev.sqlite"))
    seed_checklist(db)
    import_records(db, source_payload("DEV", 65), "DEV")
    for i in range(65):
        make_evaluation(db, f"case-{i:03d}")
    first = db.all_evaluations()[-1]
    contact = next(item for item in first["items"] if item["criterionId"] == "contact")
    contact.update(answer="no", original={"answer": "yes", "points": 10, "effectiveWeight": 10})
    gross = next(item for item in first["items"] if item["criterionId"] == "gross")
    gross.update(answer="no", original={"answer": "yes", "points": 0, "effectiveWeight": 0}, model="provider/model-b")
    db.save_evaluation(first)
    original = db.get_checklist("cl_1")
    newer = prepare_checklist({**original, "isActive": True})
    newer.update(id="cl_2", version=2, createdAt=utcnow(), basedOnVersion=1)
    newer["criteria"][-2]["weight"] = 50
    original["isActive"] = False
    db.save_checklist(original)
    db.save_checklist(newer)
    make_evaluation(db, "case-000", {"contact": "no"}, checklist_id="cl_2")

    document, manifest = asyncio.run(prepare_organizer_results(db, None, "DEV"))
    assert len(document["results"]) == 65
    assert [row["conversation_id"] for row in document["results"]] == [f"case-{i:03d}" for i in range(65)]
    row = document["results"][0]
    assert row["status"] == "ok"
    assert [criterion["criterion_id"] for criterion in row["criteria"]] == list(ORGANIZER_CRITERION_IDS.values())
    assert row["criteria"][0]["value"] is True
    assert row["criteria"][-1]["value"] is True
    assert row["score"] == {"final_score": 100.0, "critical_flag": True}
    assert row["criteria"][0]["evidence_turns"] == [1, 3, 4]
    assert document["model"] == {"mode": "external_api", "name": "provider/model-a, provider/model-b"}
    assert b'"final_score": 100.00' in serialize_organizer_results(document, manifest)


def test_score_na_redistribution_and_half_up():
    values = {"contact": True, "discovery": None, "identification": True, "consultation": 15,
              "empathy": True, "dialogue": 7, "closure": False, "critical": False}
    assert organizer_score(values) == Decimal("82.94")
    values.update(contact=False, discovery=True, identification=None, consultation=0)
    assert organizer_score(values) == Decimal("50.63")  # exact unrounded value is 50.625
    values["critical"] = True
    assert organizer_score(values) == Decimal("50.63")


@pytest.mark.parametrize("change", [
    lambda doc: doc.update(extra=True),
    lambda doc: doc.update(schema_version="2.0"),
    lambda doc: doc["model"].update(extra=True),
    lambda doc: doc["model"].update(mode="local"),
    lambda doc: doc["model"].update(name="fake"),
    lambda doc: doc["model"].update(name="provider/model-a, fake"),
    lambda doc: doc["model"].update(name=""),
    lambda doc: doc["results"].pop(),
    lambda doc: doc["results"].append(copy.deepcopy(doc["results"][0])),
    lambda doc: doc["results"][0].update(conversation_id="absent"),
    lambda doc: doc["results"][0].update(extra=True),
    lambda doc: doc["results"][0]["criteria"].pop(),
    lambda doc: doc["results"][0]["criteria"][0].update(criterion_id="discovery"),
    lambda doc: doc["results"][0]["criteria"][0].update(criterion_id="unknown"),
    lambda doc: doc["results"][0]["criteria"][0].update(extra=1),
    lambda doc: doc["results"][0]["criteria"][0].update(value=None),
    lambda doc: doc["results"][0]["criteria"][0].update(value=1),
    lambda doc: doc["results"][0]["criteria"][0].update(value="yes"),
    lambda doc: doc["results"][0]["criteria"][3].update(value=True),
    lambda doc: doc["results"][0]["criteria"][3].update(value=7),
    lambda doc: doc["results"][0]["criteria"][5].update(value=None),
    lambda doc: doc["results"][0]["criteria"][5].update(value=5),
    lambda doc: doc["results"][0]["criteria"][0].update(rationale=" "),
    lambda doc: doc["results"][0]["criteria"][0].update(evidence_turns=[0]),
    lambda doc: doc["results"][0]["criteria"][0].update(evidence_turns=[6]),
    lambda doc: doc["results"][0]["criteria"][0].update(evidence_turns=[True]),
    lambda doc: doc["results"][0]["criteria"][0].update(evidence_turns=[1, 1]),
    lambda doc: doc["results"][0]["score"].update(final_score=99.99),
    lambda doc: doc["results"][0]["score"].update(final_score=True),
    lambda doc: doc["results"][0]["score"].update(final_score=float("nan")),
    lambda doc: doc["results"][0]["score"].update(critical_flag=True),
    lambda doc: doc["results"][0]["score"].update(critical_flag=0),
    lambda doc: doc["results"][0].update(status="error", criteria=[], score=None),
    lambda doc: doc["results"][0].update(status="error", error="Сбой модели", score=None),
])
def test_strict_document_validation_rejects_malformed_values(valid_pair, change):
    document, manifest = valid_pair
    change(document)
    with pytest.raises(ApiError):
        validate_organizer_results(document, manifest)


def test_error_rows_keep_ids_and_are_not_zero_scores(valid_pair):
    document, manifest = valid_pair
    document["results"][0] = {"conversation_id": "case-000", "status": "error", "criteria": [],
                              "score": None, "error": "Не удалось получить ответ модели."}
    assert validate_organizer_results(document, manifest) is document


@pytest.mark.parametrize("broken_model", ["fake", "fake/fixture", None])
def test_fake_and_legacy_items_not_certified_from_real_evaluation_model(export_db, broken_model):
    evaluation = next(row for row in export_db.all_evaluations() if row["conversationId"] == "case-000")
    evaluation["model"] = "provider/real-last-finisher"
    evaluation["items"][0]["model"] = broken_model
    export_db.save_evaluation(evaluation)
    document, _ = asyncio.run(prepare_organizer_results(export_db, None, "CONTROL"))
    assert document["results"][0]["status"] == "error"
    assert document["results"][0]["score"] is None
    assert "fake" not in document["model"]["name"]


def test_incompatible_contact_na_is_explicit_error(export_db):
    evaluation = next(row for row in export_db.all_evaluations() if row["conversationId"] == "case-000")
    evaluation["items"][0]["answer"] = "na"
    export_db.save_evaluation(evaluation)
    document, _ = asyncio.run(prepare_organizer_results(export_db, None, "CONTROL"))
    assert document["results"][0]["status"] == "error"
    assert "contact" in document["results"][0]["error"]


def test_missing_and_failed_real_evaluations_are_attempted_once_without_reuse(export_db, monkeypatch):
    for cid in ("case-000", "case-001"):
        evaluation = next(row for row in export_db.all_evaluations() if row["conversationId"] == cid)
        evaluation.update(status="failed")
        evaluation["items"][0].update(status="failed", explanation="Модель недоступна")
        export_db.save_evaluation(evaluation)
    calls = []

    class Queue:
        async def submit(self, ids, checklist_id, reuse=True):
            calls.append((ids, checklist_id, reuse))
            evaluations = {cid: make_evaluation(export_db, cid)["id"] for cid in ids}
            return {"jobId": "export-job", "evaluationIds": evaluations}

    monkeypatch.setattr(llm_switch, "get_judge", lambda: SimpleNamespace(IS_FAKE=False))
    monkeypatch.setattr(llm_switch, "fallback_info", lambda: {"judge": False})
    document, _ = asyncio.run(prepare_organizer_results(export_db, Queue(), "CONTROL", evaluate_missing=True))
    assert calls == [(["case-000", "case-001"], "cl_1", False)]
    assert all(row["status"] == "ok" for row in document["results"])


def test_read_only_and_unavailable_provider_never_submit(export_db, monkeypatch):
    for evaluation in export_db.all_evaluations():
        for item in evaluation["items"]:
            item["model"] = "fake"
        export_db.save_evaluation(evaluation)

    class Queue:
        async def submit(self, *args, **kwargs):
            pytest.fail("The export must not invoke a fake or read-only provider")

    monkeypatch.setattr(llm_switch, "get_judge", lambda: SimpleNamespace(IS_FAKE=True))
    for evaluate in (False, True):
        document, _ = asyncio.run(prepare_organizer_results(export_db, Queue(), "CONTROL", evaluate_missing=evaluate))
        assert len(document["results"]) == 10
        assert all(row["status"] == "error" and row["score"] is None for row in document["results"])
        assert document["model"]["name"] == ""


def test_failed_evaluation_keeps_safe_provider_reason(export_db):
    old = next(row for row in export_db.all_evaluations() if row["conversationId"] == "case-000")
    for item in old["items"]:
        item["model"] = "fake"
    export_db.save_evaluation(old)
    make_evaluation(export_db, "case-000")
    evaluation = next(row for row in export_db.all_evaluations() if row["conversationId"] == "case-000")
    evaluation["status"] = "failed"
    evaluation["items"][0].update(status="failed", explanation="Модель не ответила за отведённое время.")
    export_db.save_evaluation(evaluation)
    document, _ = asyncio.run(prepare_organizer_results(export_db, None, "CONTROL"))
    assert document["results"][0]["error"] == "Модель не ответила за отведённое время."


def test_running_evaluation_timeout_does_not_repeat_or_cancel(export_db, monkeypatch):
    evaluation = next(row for row in export_db.all_evaluations() if row["conversationId"] == "case-000")
    evaluation.update(status="running", model="provider/model-a")
    export_db.save_evaluation(evaluation)

    class Queue:
        async def submit(self, *args, **kwargs):
            pytest.fail("Existing real work should be awaited, not repeated")

    monkeypatch.setattr(llm_switch, "get_judge", lambda: SimpleNamespace(IS_FAKE=False))
    monkeypatch.setattr(llm_switch, "fallback_info", lambda: {"judge": False})
    document, _ = asyncio.run(prepare_organizer_results(export_db, Queue(), "CONTROL", evaluate_missing=True, timeout_seconds=0.01))
    assert document["results"][0]["status"] == "error"
    assert "ещё выполняется" in document["results"][0]["error"]
    assert export_db.get_evaluation(evaluation["id"])["status"] == "running"


def test_roster_excludes_old_group_rows_and_rejects_stale_source(export_db):
    extra = source_payload("CONTROL", 1)["data"]["records"]
    extra[0]["conversation_id"] = "old-extra"
    import_records(export_db, extra, "CONTROL")
    manifest, conversations = organizer_snapshot(export_db, "CONTROL")
    assert len(conversations) == 10 and all(row["id"] != "old-extra" for row in conversations)
    changed = source_payload("CONTROL", 1)["data"]["records"]
    changed[0]["transcript"][0]["text"] = "Изменившийся вопрос."
    import_records(export_db, changed, "CONTROL")
    with pytest.raises(ApiError, match="Синхронизируйте"):
        organizer_snapshot(export_db, "CONTROL")


def test_source_change_during_evaluation_prevents_export(export_db, monkeypatch):
    evaluation = next(row for row in export_db.all_evaluations() if row["conversationId"] == "case-000")
    evaluation["status"] = "failed"
    export_db.save_evaluation(evaluation)

    class Queue:
        async def submit(self, ids, checklist_id, reuse):
            payload = source_payload()
            payload["data"]["records"][0]["transcript"][0]["text"] = "Обновлённый вопрос."
            import_records(export_db, payload, "CONTROL")
            return {"jobId": "job", "evaluationIds": {cid: make_evaluation(export_db, cid)["id"] for cid in ids}}

    monkeypatch.setattr(llm_switch, "get_judge", lambda: SimpleNamespace(IS_FAKE=False))
    monkeypatch.setattr(llm_switch, "fallback_info", lambda: {"judge": False})
    with pytest.raises(ApiError, match="изменился"):
        asyncio.run(prepare_organizer_results(export_db, Queue(), "CONTROL", evaluate_missing=True))


def test_atomic_utf8_file_and_invalid_preserves_destination(valid_pair, tmp_path):
    document, manifest = valid_pair
    output = tmp_path / "results.json"
    write_organizer_results(document, manifest, output)
    raw = output.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf")
    assert b'"final_score": 100.00' in raw
    assert "исходной" in raw.decode("utf-8")
    assert json.loads(raw) == document
    document["results"][0]["score"]["final_score"] = 1
    with pytest.raises(ApiError):
        write_organizer_results(document, manifest, output)
    assert output.read_bytes() == raw
    missing = tmp_path / "not-created" / "results.json"
    with pytest.raises(ApiError):
        write_organizer_results(document, manifest, missing)
    assert not missing.parent.exists()
    assert not list(tmp_path.glob("*.tmp"))


def test_http_manifest_and_read_only_download(client, monkeypatch):
    db = client.app.state.db
    import_records(db, source_payload(), "CONTROL")
    make_evaluation(db, "case-000")

    async def prohibited(*args, **kwargs):
        pytest.fail("HTTP read-only export must perform zero provider submissions")

    monkeypatch.setattr(client.app.state.queue, "submit", prohibited)
    manifest = client.get("/api/export/organizers/manifest", params={"groupId": "CONTROL"})
    assert manifest.status_code == 200
    response = client.post("/api/export/organizers", json={"groupId": "CONTROL", "evaluateMissing": False})
    assert response.status_code == 200, response.text
    assert response.headers["content-disposition"] == 'attachment; filename="results.json"'
    document = response.json()
    assert document["results"][0]["status"] == "ok"
    assert sum(row["status"] == "error" for row in document["results"]) == 9
    validate_organizer_results(document, manifest.json())
    stale = client.post("/api/export/organizers", json={"groupId": "CONTROL", "sourceHash": "0" * 64})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "export_source_changed"
    invalid = client.post("/api/export/organizers", json={"groupId": "CONTROL", "evaluateMissing": "false"})
    assert invalid.status_code == 400


def test_cli_uses_same_endpoint_manifest_and_validates_before_write(valid_pair, tmp_path):
    document, manifest = valid_pair
    calls = []

    def handler(request):
        calls.append(request)
        if request.method == "GET":
            return httpx.Response(200, json=manifest)
        body = json.loads(request.content)
        assert body == {"groupId": "CONTROL", "evaluateMissing": True, "sourceHash": manifest["sourceHash"], "timeoutSeconds": 600}
        return httpx.Response(200, json=document)

    output = tmp_path / "results.json"
    with httpx.Client(base_url="http://export.test", transport=httpx.MockTransport(handler)) as http:
        assert export_from_server(http, "CONTROL", output) == document
    assert [request.url.path for request in calls] == ["/api/export/organizers/manifest", "/api/export/organizers"]
    original_bytes = output.read_bytes()
    document["results"].pop()
    with httpx.Client(base_url="http://export.test", transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(ApiError):
            export_from_server(http, "CONTROL", output)
    assert output.read_bytes() == original_bytes


@pytest.mark.parametrize("payload", [b'{"schema_version":"1.0","schema_version":"1.0"}', b'{"score":NaN}', b'\xff'])
def test_cli_rejects_malformed_response_without_file(valid_pair, tmp_path, payload):
    _, manifest = valid_pair

    def handler(request):
        return httpx.Response(200, json=manifest) if request.method == "GET" else httpx.Response(200, content=payload, headers={"Content-Type": "application/json"})

    output = tmp_path / "results.json"
    with httpx.Client(base_url="http://export.test", transport=httpx.MockTransport(handler)) as http:
        with pytest.raises((ValueError, UnicodeError)):
            export_from_server(http, "CONTROL", output)
    assert not output.exists()
