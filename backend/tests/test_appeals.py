"""Contract examples and the review state transitions through HTTP."""

from copy import deepcopy

import pytest

from app.scoring import score_evaluation
from tests.helpers import evaluate


ANSWERS = {
    "contact": "yes", "needs": "na", "identification": "yes", "consultation": 15,
    "empathy": "yes", "dialogue": 7, "closing": "no", "gross": "no",
}


@pytest.fixture
def example_evaluation(seeded_client):
    evaluation = evaluate(seeded_client, ["p1-ru-001"])[0]
    checklist = seeded_client.get("/api/checklists/active").json()
    for item in evaluation["items"]:
        item["answer"] = ANSWERS[item["criterionId"]]
    evaluation.update(score_evaluation(checklist, evaluation["items"]))
    evaluation["originalTotal"] = evaluation["total"]
    stored = seeded_client.app.state.db.get_evaluation(evaluation["id"])
    stored.update(evaluation)
    seeded_client.app.state.db.save_evaluation(stored)
    assert evaluation["total"] == 82.94
    return evaluation


def open_appeal(client, evaluation, criterion_id="closing", answer="yes"):
    result = client.post("/api/appeals", json={
        "evaluationId": evaluation["id"], "criterionId": criterion_id,
        "comment": "Прошу проверить ответ с учётом последней реплики клиента.",
        "proposedAnswer": answer,
    })
    assert result.status_code == 201, result.text
    return result.json()


@pytest.mark.parametrize("criterion_id,expected", [("closing", 88.82), ("needs", 85.50)])
def test_change_recomputes_full_evaluation(seeded_client, example_evaluation, criterion_id, expected):
    before = deepcopy(example_evaluation)
    appeal = open_appeal(seeded_client, before, criterion_id)
    response = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json={
        "action": "change", "newAnswer": "yes", "reason": "Клиент подтвердил решение своего вопроса.",
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["evaluation"]["total"] == expected
    assert result["evaluation"]["originalTotal"] == 82.94
    assert result["appeal"]["totalBefore"] == 82.94
    assert result["appeal"]["totalAfter"] == expected
    assert result["appeal"]["status"] == "changed"
    changed = next(i for i in result["evaluation"]["items"] if i["criterionId"] == criterion_id)
    old = next(i for i in before["items"] if i["criterionId"] == criterion_id)
    assert changed["original"] == {
        "answer": old["answer"], "points": old["points"], "effectiveWeight": old["effectiveWeight"],
    }
    assert changed["explanation"] == old["explanation"]
    assert changed["evidence"] == old["evidence"]
    assert changed["appealId"] == appeal["id"]
    if criterion_id == "needs":
        assert sum(i["effectiveWeight"] for i in result["evaluation"]["items"]) == pytest.approx(100)
        assert next(i for i in result["evaluation"]["items"] if i["criterionId"] == "contact")["effectiveWeight"] == 10
    persisted = seeded_client.get(f"/api/evaluations/{before['id']}").json()
    assert persisted["total"] == expected


def test_duplicate_confirm_repeat_decision_and_response_shapes(seeded_client, example_evaluation):
    appeal = open_appeal(seeded_client, example_evaluation)
    assert set(appeal) == {
        "id", "evaluationId", "conversationId", "criterionId", "comment", "proposedAnswer",
        "createdAt", "status", "originalAnswer", "originalPoints", "decision", "totalBefore",
        "totalAfter", "secondOpinion",
    }
    duplicate = seeded_client.post("/api/appeals", json={
        "evaluationId": example_evaluation["id"], "criterionId": "closing",
        "comment": "Повторная апелляция на тот же результат", "proposedAnswer": "yes",
    })
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "appeal_exists"
    details = seeded_client.get(f"/api/appeals/{appeal['id']}").json()
    assert details["evaluation"]["id"] == example_evaluation["id"]
    assert details["conversation"]["id"] == example_evaluation["conversationId"]
    assert details["criterion"]["id"] == "closing"
    listed = seeded_client.get("/api/appeals?status=all").json()
    assert listed["counts"] == {"open": 1, "decided": 0}
    assert {"criterionTitle", "conversationLanguage", "channel"} <= set(listed["items"][0])
    body = {"action": "confirm", "newAnswer": None, "reason": "Исходная оценка соответствует правилу чек-листа."}
    confirmed = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json=body)
    assert confirmed.status_code == 200
    result = confirmed.json()
    assert result["appeal"]["status"] == "confirmed"
    assert result["appeal"]["totalAfter"] == result["appeal"]["totalBefore"] == 82.94
    assert result["evaluation"]["total"] == 82.94
    assert all(i["original"] is None for i in result["evaluation"]["items"])
    repeated = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json=body)
    assert repeated.status_code == 409
    assert repeated.json()["error"]["code"] == "appeal_decided"
    assert seeded_client.get("/api/appeals?status=open").json()["items"] == []
    assert seeded_client.get("/api/appeals?status=decided").json()["counts"] == {"open": 0, "decided": 1}


def test_bad_inputs_leave_no_partial_mutations(seeded_client, example_evaluation):
    payload = {"evaluationId": example_evaluation["id"], "criterionId": "closing", "comment": "коротко"}
    short = seeded_client.post("/api/appeals", json=payload)
    assert short.status_code == 400
    assert short.json()["error"]["code"] == "comment_too_short"
    payload.update(comment="Комментарий достаточной длины", proposedAnswer=15)
    wrong = seeded_client.post("/api/appeals", json=payload)
    assert wrong.status_code == 400
    assert wrong.json()["error"]["code"] == "invalid_answer"
    assert seeded_client.get("/api/appeals?status=all").json()["items"] == []
    appeal = open_appeal(seeded_client, example_evaluation)
    for answer in [None, 15, True, "na-invalid"]:
        failed = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json={
            "action": "change", "newAnswer": answer, "reason": "Причина достаточной длины для решения.",
        })
        assert failed.status_code == 400
        assert failed.json()["error"]["code"] == "invalid_answer"
    short_reason = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json={
        "action": "confirm", "reason": "мало",
    })
    assert short_reason.status_code == 400
    unchanged = seeded_client.get(f"/api/appeals/{appeal['id']}").json()
    assert unchanged["status"] == "open"
    assert unchanged["evaluation"]["total"] == 82.94
    assert all(i["original"] is None for i in unchanged["evaluation"]["items"])


def test_second_appeal_preserves_first_model_answer_and_invalidates_coaching(seeded_client, example_evaluation):
    db = seeded_client.app.state.db
    appeal = open_appeal(seeded_client, example_evaluation)
    db.set_cache("coaching", example_evaluation["id"], {"tips": [{"criterionId": "closing"}]})
    response = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json={
        "action": "change", "newAnswer": "yes", "reason": "Первое решение в пользу оператора.",
    })
    assert response.status_code == 200
    assert db.get_cache("coaching", example_evaluation["id"]) is None
    original = next(i for i in response.json()["evaluation"]["items"] if i["criterionId"] == "closing")["original"]
    second = open_appeal(seeded_client, example_evaluation, answer="no")
    response = seeded_client.post(f"/api/appeals/{second['id']}/decision", json={
        "action": "change", "newAnswer": "no", "reason": "Повторная проверка учла весь диалог.",
    })
    assert response.status_code == 200
    final = response.json()["evaluation"]
    assert final["total"] == final["originalTotal"] == 82.94
    assert next(i for i in final["items"] if i["criterionId"] == "closing")["original"] == original


def test_appeal_uses_evaluated_checklist_not_active(seeded_client, example_evaluation):
    appeal = open_appeal(seeded_client, example_evaluation)
    checklist = seeded_client.get("/api/checklists/active").json()
    draft = deepcopy(checklist)
    draft["basedOnVersion"] = 1
    draft["isActive"] = True
    closing = next(c for c in draft["criteria"] if c["id"] == "closing")
    closing["title"] = "Изменённое правило завершения"
    created = seeded_client.post("/api/checklists", json=draft)
    assert created.status_code == 201, created.text
    seeded_client.post(f"/api/checklists/{created.json()['id']}/activate", json={})
    details = seeded_client.get(f"/api/appeals/{appeal['id']}").json()
    assert details["criterion"]["title"] == "Завершение"
    assert details["evaluation"]["checklistVersion"] == 1


def test_unfinished_or_missing_criterion_cannot_be_appealed(seeded_client, example_evaluation):
    payload = {
        "evaluationId": example_evaluation["id"], "criterionId": "missing",
        "comment": "Комментарий достаточной длины", "proposedAnswer": None,
    }
    missing = seeded_client.post("/api/appeals", json=payload)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"
    payload["criterionId"] = "closing"
    db = seeded_client.app.state.db
    unfinished = deepcopy(example_evaluation)
    unfinished["status"] = "running"
    db.save_evaluation(unfinished)
    response = seeded_client.post("/api/appeals", json=payload)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "evaluation_not_ready"
    assert seeded_client.get("/api/appeals?status=all").json()["items"] == []


def test_multiple_decisions_preserve_model_total_and_accuracy(seeded_client, example_evaluation):
    for criterion in ("needs", "closing"):
        appeal = open_appeal(seeded_client, example_evaluation, criterion)
        response = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json={
            "action": "change", "newAnswer": "yes", "reason": "Решение проверяющего по всему диалогу.",
        })
        assert response.status_code == 200
    result = response.json()["evaluation"]
    assert result["total"] == 90.50
    assert result["originalTotal"] == 82.94
    csv_text = "conversation_id,criterion_id,answer,note\n" + "".join(
        f"p1-ru-001,{criterion},{answer},\n" for criterion, answer in ANSWERS.items()
    )
    upload = seeded_client.post("/api/gold", content=csv_text.encode(), headers={"Content-Type": "text/csv"})
    assert upload.status_code == 200
    accuracy = seeded_client.get("/api/accuracy?checklistId=cl_1").json()
    assert accuracy["totalMae"] == 0
    assert accuracy["mismatches"] == []
    assert all(row["match"] == row["compared"] == 1 for row in accuracy["byCriterion"])


def test_old_appeal_keeps_evaluated_transcript_and_hides_internal_fields(seeded_client, dev_payload):
    evaluation = evaluate(seeded_client, ["p1-ru-001"])[0]
    appeal = open_appeal(seeded_client, evaluation)
    original = seeded_client.get("/api/conversations/p1-ru-001").json()
    record = deepcopy(next(record for record in dev_payload["data"]["records"] if record["conversation_id"] == "p1-ru-001"))
    record["transcript"][9]["text"] = "Новая реплика после повторного импорта"
    uploaded = seeded_client.post("/api/conversations/upload", json=[record])
    assert uploaded.status_code == 200
    assert uploaded.json()["updated"] == 1
    current = seeded_client.get("/api/conversations/p1-ru-001").json()
    assert current["transcript"][9]["text"] != original["transcript"][9]["text"]
    detail = seeded_client.get(f"/api/appeals/{appeal['id']}")
    assert detail.status_code == 200
    result = detail.json()
    assert result["conversation"] == original
    assert set(result["conversation"]) == {
        "id", "datasetGroupId", "channel", "language", "audioUrl", "transcript", "importedAt",
    }
    assert not any(key.startswith("_") for key in result["evaluation"])
    for item in result["evaluation"]["items"]:
        for evidence in item["evidence"]:
            assert evidence["quote"] in result["conversation"]["transcript"][evidence["turnIdx"]]["text"]
    decision = seeded_client.post(f"/api/appeals/{appeal['id']}/decision", json={
        "action": "change", "newAnswer": "yes", "reason": "Проверена исходная версия диалога.",
    })
    assert decision.status_code == 200
    assert not any(key.startswith("_") for key in decision.json()["evaluation"])
    # Serialization must not remove the durable source used for future review/restart.
    stored = seeded_client.app.state.db.get_evaluation(evaluation["id"])
    assert stored["_conversation"]["transcript"] == original["transcript"]
    missing = seeded_client.get("/api/appeals/ap_missing")
    assert missing.status_code == 404
    assert set(missing.json()) == {"error"}
    assert set(missing.json()["error"]) == {"code", "message"}
    assert missing.json()["error"]["code"] == "not_found"
