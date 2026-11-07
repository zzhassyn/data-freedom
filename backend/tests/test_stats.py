import csv
import io

import pytest

from tests.helpers import evaluate


def _gold_csv(evaluations, overrides=None):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["conversation_id", "criterion_id", "answer", "note"])
    overrides = overrides or {}
    for evaluation in evaluations:
        for item in evaluation["items"]:
            answer = overrides.get((evaluation["conversationId"], item["criterionId"]), item["answer"])
            writer.writerow([evaluation["conversationId"], item["criterionId"], answer, "Ручная проверка"])
    return output.getvalue()


def _upload(client, body):
    return client.post("/api/gold", content=body.encode("utf-8"), headers={"Content-Type": "text/csv; charset=utf-8"})


def test_stats_empty_contract(client):
    response = client.get("/api/stats")
    assert response.status_code == 200
    result = response.json()
    assert set(result) == {"evaluated", "avgTotal", "grossCount", "byCriterion", "totals", "appeals"}
    assert result["evaluated"] == 0
    assert result["avgTotal"] is None
    assert result["totals"] == []
    assert len(result["byCriterion"]) == 8
    assert result["appeals"] == {"open": 0, "confirmed": 0, "changed": 0}
    assert client.get("/api/accuracy").json()["totalMae"] is None


def test_stats_latest_language_and_group(seeded_client):
    client = seeded_client
    evaluations = evaluate(client, ["p1-ru-001", "p1-en-002"])
    assert [evaluation["total"] for evaluation in evaluations] == [92.31, 100.0]
    evaluate(client, ["p1-ru-001"], reuse=True)
    result = client.get("/api/stats?groupId=UPLOAD").json()
    assert result["evaluated"] == 2
    assert result["avgTotal"] == 96.16
    rows = {row["criterionId"]: row for row in result["byCriterion"]}
    assert rows["closing"]["yes"] == 1
    assert rows["closing"]["no"] == 1
    assert rows["closing"]["avgFraction"] == 0.5
    assert rows["closing"]["byLanguage"]["RU"] == {"yes": 0, "no": 1, "na": 0}
    assert rows["closing"]["byLanguage"]["EN"] == {"yes": 1, "no": 0, "na": 0}
    assert rows["closing"]["byLanguage"]["KZ"] == {"yes": 0, "no": 0, "na": 0}
    assert rows["identification"]["na"] == 2
    assert rows["identification"]["avgFraction"] is None
    assert rows["consultation"]["yes"] == 2
    assert client.get("/api/stats?groupId=absent").json()["evaluated"] == 0


def test_stats_and_accuracy_keep_latest_ready_result_after_failed_rerun(seeded_client, monkeypatch):
    from app import llm_switch
    from app.errors import JudgeError

    evaluations = evaluate(seeded_client, ["p1-ru-001"])
    _upload(seeded_client, _gold_csv(evaluations))
    stats_before = seeded_client.get("/api/stats").json()
    accuracy_before = seeded_client.get("/api/accuracy").json()

    async def unavailable(conversation, criterion):
        raise JudgeError("Модель временно недоступна")

    monkeypatch.setattr(llm_switch.get_judge(), "judge", unavailable)
    failed = evaluate(seeded_client, ["p1-ru-001"], reuse=False)[0]
    assert failed["status"] == "failed"
    assert failed["total"] is None
    assert seeded_client.get("/api/stats").json() == stats_before
    assert seeded_client.get("/api/accuracy").json() == accuracy_before


def test_accuracy_exact_steps_and_appeals_do_not_rewrite_model(seeded_client):
    client = seeded_client
    evaluations = evaluate(client, ["p1-ru-001", "p1-en-002"])
    body = _gold_csv(evaluations, {("p1-ru-001", "closing"): "yes"})
    assert _upload(client, body).json() == {"rows": 16, "conversations": 2, "skipped": 0}
    accuracy = client.get("/api/accuracy").json()
    assert set(accuracy) == {"conversations", "byCriterion", "totalMae", "mismatches"}
    assert accuracy["conversations"] == 2
    assert accuracy["totalMae"] == 3.85
    closing = next(row for row in accuracy["byCriterion"] if row["criterionId"] == "closing")
    assert closing == {"criterionId": "closing", "compared": 2, "match": 1,
                       "rate": 0.5, "confusion": {"yes→no": 1}}
    assert accuracy["mismatches"] == [{"conversationId": "p1-ru-001", "criterionId": "closing", "gold": "yes", "model": "no"}]
    appeal = client.post("/api/appeals", json={
        "evaluationId": evaluations[0]["id"], "criterionId": "closing",
        "comment": "Клиент подтвердил решение вопроса", "proposedAnswer": "yes",
    })
    assert appeal.status_code == 201
    decision = client.post(f"/api/appeals/{appeal.json()['id']}/decision", json={
        "action": "change", "newAnswer": "yes", "reason": "Вопрос клиента решён, прощание есть",
    })
    assert decision.status_code == 200
    assert client.get("/api/stats").json()["avgTotal"] == 100.0
    assert client.get("/api/stats").json()["appeals"]["changed"] == 1
    assert client.get("/api/accuracy").json() == accuracy


def test_gold_skips_invalid_rows_replaces_only_accepted_conversations(seeded_client):
    client = seeded_client
    evaluations = evaluate(client, ["p1-ru-001", "p1-en-002"])
    _upload(client, _gold_csv(evaluations))
    update = (
        "\ufeffconversation_id,criterion_id,answer,note\r\n"
        "p1-ru-001,contact,yes,верно\r\n"
        "p1-ru-001,consultation,17,нет такой ступени\r\n"
        "p1-ru-001,contact,na,N/A запрещено\r\n"
        "missing,contact,yes,нет диалога\r\n"
        "p1-en-002,missing,yes,нет критерия\r\n"
    )
    response = _upload(client, update)
    assert response.json() == {"rows": 1, "conversations": 1, "skipped": 4}
    accuracy = client.get("/api/accuracy").json()
    assert accuracy["conversations"] == 2
    rows = {row["criterionId"]: row for row in accuracy["byCriterion"]}
    assert rows["contact"]["compared"] == 2
    assert rows["consultation"]["compared"] == 1
    assert accuracy["totalMae"] == 0


def test_partial_gold_compares_scale_exactly_without_inventing_total(seeded_client):
    client = seeded_client
    evaluate(client, ["p1-ru-001"])
    response = _upload(client, "conversation_id,criterion_id,answer,note\np1-ru-001,consultation,15,частично\n")
    assert response.status_code == 200
    result = client.get("/api/accuracy").json()
    assert result["totalMae"] is None
    row = next(row for row in result["byCriterion"] if row["criterionId"] == "consultation")
    assert row["rate"] == 0
    assert row["confusion"] == {"15→20": 1}
    assert result["mismatches"][0]["model"] == 20


@pytest.mark.parametrize("answer", ["NaN", "Infinity", "1e10000", "1e-10000", "true"])
def test_gold_invalid_numbers_are_skipped(seeded_client, answer):
    response = _upload(seeded_client, f"conversation_id,criterion_id,answer,note\np1-ru-001,consultation,{answer},\n")
    assert response.status_code == 200
    assert response.json() == {"rows": 0, "conversations": 0, "skipped": 1}


@pytest.mark.parametrize("body", ["not,the,header\n", "conversation_id,criterion_id,answer,note\np1-ru-001,contact,yes,\"unfinished\n"])
def test_invalid_gold_is_transactional(seeded_client, body):
    client = seeded_client
    evaluations = evaluate(client, ["p1-ru-001"])
    _upload(client, _gold_csv(evaluations))
    before = client.get("/api/accuracy").json()
    result = _upload(client, body)
    assert result.status_code == 400
    assert result.json()["error"]["code"] == "invalid_gold"
    assert client.get("/api/accuracy").json() == before
