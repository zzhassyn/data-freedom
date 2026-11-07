import asyncio
import csv
import io
import threading
from concurrent.futures import ThreadPoolExecutor

from app import llm_switch
from app.errors import JudgeError
from app.models import Summary, Usage
from tests.helpers import evaluate


def test_summary_cache_refresh_usage_and_source_change(seeded_client, monkeypatch, dev_payload):
    client = seeded_client
    calls = []

    async def summarize(conversation):
        calls.append(conversation.transcript[0].text)
        return Summary(topic="Тестовая тема", request=conversation.transcript[0].text,
                       outcome="Ответ получен", operator_name="Алина",
                       usage=Usage(input_tokens=10, output_tokens=5, cost_usd=.003, calls=1))

    monkeypatch.setattr(llm_switch.get_ai(), "summarize", summarize)
    first = client.get("/api/conversations/p1-ru-001/summary")
    assert first.status_code == 200
    assert set(first.json()) == {"topic", "request", "outcome", "operatorName"}
    assert client.get("/api/conversations/p1-ru-001/summary").json() == first.json()
    assert len(calls) == 1
    assert client.get("/api/conversations/p1-ru-001/summary?refresh=1").status_code == 200
    assert len(calls) == 2
    record = next(r for r in dev_payload["data"]["records"] if r["conversation_id"] == "p1-ru-001")
    record["transcript"][0]["text"] += " Дополнительный вопрос."
    assert client.post("/api/conversations/upload", json=[record]).status_code == 200
    changed = client.get("/api/conversations/p1-ru-001/summary")
    assert changed.status_code == 200
    assert changed.json()["request"] != first.json()["request"]
    assert len(calls) == 3
    with client.app.state.db.transaction() as conn:
        total = conn.execute("SELECT SUM(cost_usd) FROM model_calls WHERE kind='extra'").fetchone()[0]
    assert abs(total - .009) < .000001


def test_summary_single_flight_and_model_failure(seeded_client, monkeypatch):
    calls = []

    async def summarize(conversation):
        calls.append(conversation.id)
        await asyncio.sleep(.05)
        return Summary(topic="Тариф", request="Где найти тариф", outcome="Тариф найден", usage=Usage())

    monkeypatch.setattr(llm_switch.get_ai(), "summarize", summarize)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: seeded_client.get("/api/conversations/p1-ru-001/summary"), [0, 1]))
    assert all(response.status_code == 200 for response in responses)
    assert calls == ["p1-ru-001"]

    async def fail(conversation):
        raise JudgeError("Нет заготовки для этого диалога")

    monkeypatch.setattr(llm_switch.get_ai(), "summarize", fail)
    response = seeded_client.get("/api/conversations/p1-ru-002/summary")
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "model_failed"


def test_translation_exact_indices_and_cache(seeded_client, monkeypatch):
    assert seeded_client.get("/api/conversations/p1-ru-001/translation").json() == {"turns": []}
    module = llm_switch.get_ai()
    original = module.translate
    calls = []

    async def counted(conversation):
        calls.append(conversation.id)
        return await original(conversation)

    monkeypatch.setattr(module, "translate", counted)
    for conversation_id, count in [("p1-kz-003", 26), ("p1-en-002", 12)]:
        response = seeded_client.get(f"/api/conversations/{conversation_id}/translation")
        assert response.status_code == 200
        turns = response.json()["turns"]
        assert len(turns) == count
        assert [turn["idx"] for turn in turns] == list(range(count))
        assert "перев" in turns[0]["text"].lower() or "вход" in turns[0]["text"].lower()
        assert seeded_client.get(f"/api/conversations/{conversation_id}/translation").json() == response.json()
    assert calls == ["p1-kz-003", "p1-en-002"]


def test_coaching_second_opinion_and_appeal_invalidation(seeded_client, monkeypatch):
    client = seeded_client
    evaluation = evaluate(client)[0]
    module = llm_switch.get_ai()
    original = module.coach
    calls = []

    async def counted(*args):
        calls.append(1)
        return await original(*args)

    monkeypatch.setattr(module, "coach", counted)
    path = f"/api/evaluations/{evaluation['id']}/coaching"
    first = client.get(path)
    assert first.status_code == 200
    assert [tip["criterionId"] for tip in first.json()["tips"]] == ["closing"]
    assert client.get(path).json() == first.json()
    assert len(calls) == 1
    appeal = client.post("/api/appeals", json={
        "evaluationId": evaluation["id"], "criterionId": "closing",
        "comment": "Клиент подтвердил решение вопроса, прощание присутствует.", "proposedAnswer": "yes",
    }).json()
    opinion = client.post(f"/api/appeals/{appeal['id']}/second-opinion", json={})
    assert opinion.status_code == 200
    assert set(opinion.json()) == {"answer", "agreesWithAppeal", "explanation", "evidence"}
    assert client.get(f"/api/appeals/{appeal['id']}").json()["secondOpinion"] == opinion.json()
    changed = client.post(f"/api/appeals/{appeal['id']}/decision", json={
        "action": "change", "newAnswer": "yes", "reason": "Клиент подтвердил результат; прощание завершает диалог.",
    })
    assert changed.status_code == 200
    assert client.get(path).json() == {"tips": []}
    assert len(calls) == 2


def test_trial_suggestion_cache_and_no_evaluation_saved(seeded_client, monkeypatch):
    client = seeded_client
    checklist = client.get("/api/checklists/active").json()
    criterion = dict(checklist["criteria"][0])
    criterion.pop("id")
    criterion.pop("hash")
    body = {"criterion": criterion, "conversationIds": ["p1-ru-001", "p1-en-002", "p1-kz-003"]}
    module = llm_switch.get_judge()
    original = module.judge
    calls = []

    async def counted(*args):
        calls.append(args[0].id)
        return await original(*args)

    monkeypatch.setattr(module, "judge", counted)
    response = client.post("/api/criteria/try", json=body)
    assert response.status_code == 200, response.text
    assert len(response.json()["items"]) == 3
    assert all("points" not in item["result"] for item in response.json()["items"])
    assert all(item["result"]["answer"] == "yes" for item in response.json()["items"])
    assert client.post("/api/criteria/try", json=body).json() == response.json()
    assert len(calls) == 3
    assert client.app.state.db.all_evaluations() == []
    body["conversationIds"].append("p1-ru-007")
    assert client.post("/api/criteria/try", json=body).json()["error"]["code"] == "too_many"
    suggestion = client.post("/api/criteria/suggest", json={"title": "Полнота ответа", "draft": "оператор ответил на вопросы", "type": "scale"})
    assert suggestion.status_code == 200
    assert set(suggestion.json()) == {"description", "naCondition", "scale"}
    assert any(step["value"] == 0 for step in suggestion.json()["scale"])


def test_export_bom_final_and_original_values_operators(seeded_client):
    client = seeded_client
    evaluations = evaluate(client, ids=["p1-ru-001", "p1-ru-007"])
    first = next(e for e in evaluations if e["conversationId"] == "p1-ru-001")
    client.get("/api/conversations/p1-ru-001/summary")
    client.get("/api/conversations/p1-ru-007/summary")
    operators = client.get("/api/operators?groupId=UPLOAD&checklistId=cl_1").json()["items"]
    assert {item["name"] for item in operators} == {"Алина", "Дамир"}
    alina = next(item for item in operators if item["name"] == "Алина")
    assert alina["weakestCriterionId"] == "closing" and alina["weakestRate"] == 0
    appeal = client.post("/api/appeals", json={"evaluationId": first["id"], "criterionId": "closing", "comment": "Считаю завершение корректным", "proposedAnswer": "yes"}).json()
    decision = client.post(f"/api/appeals/{appeal['id']}/decision", json={"action": "change", "newAnswer": "yes", "reason": "Результат подтверждён клиентом, прощание есть"}).json()
    exported = client.get("/api/export?groupId=UPLOAD&checklistId=cl_1&format=csv")
    assert exported.status_code == 200
    assert exported.content.startswith(b"\xef\xbb\xbf")
    assert 'dataavengers-UPLOAD-v1.csv' in exported.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))
    assert len(rows) == 16
    row = next(row for row in rows if row["conversation_id"] == "p1-ru-001" and row["criterion_id"] == "closing")
    assert row["answer"] == "no" and row["final_answer"] == "yes"
    assert float(row["total"]) == first["total"]
    assert float(row["final_total"]) == decision["evaluation"]["total"]
    json_response = client.get("/api/export?groupId=UPLOAD&checklistId=cl_1&format=json")
    exported_eval = next(e for e in json_response.json() if e["conversationId"] == "p1-ru-001")
    assert exported_eval["total"] == first["total"]
    assert exported_eval["finalTotal"] == decision["evaluation"]["total"]
    assert client.get("/api/export?format=pdf").status_code == 400


def test_background_summary_prefetch(seeded_client):
    from app.extras import prefetch_summaries, get_cached_summary

    client = seeded_client
    # Use the app's portal so model semaphore and cache locks remain on its loop.
    client.portal.call(prefetch_summaries, client.app, ["p1-ru-001", "p1-ru-002"])
    conversation = client.app.state.db.get_conversation("p1-ru-001")
    assert get_cached_summary(client.app.state.db, conversation)["operatorName"] == "Алина"
    assert client.app.state.db.get_cache("summary", "p1-ru-002") is None


def test_input_change_during_generation_does_not_cache_stale_summary(seeded_client, monkeypatch, dev_payload):
    started = threading.Event()
    release = threading.Event()

    async def slow_summary(conversation):
        started.set()
        while not release.is_set():
            await asyncio.sleep(.005)
        return Summary(topic="Старая тема", request="Старый запрос", outcome="Старый результат")

    monkeypatch.setattr(llm_switch.get_ai(), "summarize", slow_summary)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(seeded_client.get, "/api/conversations/p1-ru-001/summary")
        assert started.wait(2)
        record = next(r for r in dev_payload["data"]["records"] if r["conversation_id"] == "p1-ru-001")
        record["transcript"][0]["text"] += " Новый вопрос."
        try:
            assert seeded_client.post("/api/conversations/upload", json=[record]).status_code == 200
        finally:
            release.set()
        response = future.result(timeout=3)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stale_source"
    assert seeded_client.app.state.db.get_cache("summary", "p1-ru-001") is None


def test_trial_rejects_invalid_provider_evidence(seeded_client, monkeypatch):
    from app.models import JudgeResult, Evidence

    async def invalid_judge(conversation, criterion):
        return JudgeResult(answer="yes", explanation="Неподтверждённое утверждение", model="test",
                           evidence=[Evidence(turn_idx=0, quote="Этой цитаты нет в диалоге", kind="supports")])

    monkeypatch.setattr(llm_switch.get_judge(), "judge", invalid_judge)
    criterion = seeded_client.get("/api/checklists/active").json()["criteria"][0]
    response = seeded_client.post("/api/criteria/try", json={"criterion": criterion, "conversationIds": ["p1-ru-001"]})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "model_failed"
    assert seeded_client.app.state.db.all_evaluations() == []
