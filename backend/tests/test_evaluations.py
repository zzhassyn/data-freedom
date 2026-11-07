"""Queue acceptance checks: actual HTTP state transitions, recovery and reuse."""

import asyncio
import copy
import threading
import time
from collections import Counter
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import llm_switch
from app.errors import JudgeError
from app.models import Evaluation, JudgeResult, Usage


EXAMPLE_ANSWERS = {
    "contact": "yes", "needs": "na", "identification": "yes",
    "consultation": 15, "empathy": "yes", "dialogue": 7,
    "closing": "no", "gross": "no",
}
FIXTURE_IDS = ["p1-ru-001", "p1-ru-007", "p1-kz-003", "p1-en-002", "p4-ru-001"]


def start(client, ids=None, reuse=False):
    response = client.post("/api/evaluations", json={
        "conversationIds": ids or ["p1-ru-001"],
        "checklistId": "cl_1", "reuse": reuse,
    })
    assert response.status_code == 202, response.text
    body = response.json()
    assert set(body) == {"jobId", "evaluationIds"}
    assert body["jobId"].startswith("job_")
    return body


def wait_for(client, path, predicate, timeout=10):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        response = client.get(path)
        assert response.status_code == 200, response.text
        last = response.json()
        if predicate(last):
            return last
        time.sleep(0.01)
    pytest.fail(f"Operation did not reach expected state: {last!r}")


def finish(client, submission):
    job = wait_for(client, f"/api/jobs/{submission['jobId']}",
                   lambda body: body["status"] in {"done", "failed"})
    evaluations = [client.get(f"/api/evaluations/{identifier}").json()
                   for identifier in submission["evaluationIds"].values()]
    return job, evaluations


def make_result(answer, needs_review=False):
    return JudgeResult(
        answer=answer, explanation="Проверено по тестовому примеру контракта.",
        evidence=[], checked_range=None,
        na_reason="Критерий неприменим в тестовом примере." if answer == "na" else None,
        flag_types=None, needs_review=needs_review, model="test-provider-model",
        usage=Usage(input_tokens=100, output_tokens=20, cost_usd=0.001, calls=1),
        latency_ms=15,
    )


def test_contract_example_and_usage_are_calculated_by_queue(seeded_client, monkeypatch):
    async def judge(conversation, criterion):
        return make_result(EXAMPLE_ANSWERS[criterion.id], criterion.id == "dialogue")

    monkeypatch.setattr(llm_switch.get_judge(), "judge", judge)
    job, (evaluation,) = finish(seeded_client, start(seeded_client))
    assert job["status"] == "done"
    assert (job["total"], job["done"], job["failed"]) == (1, 1, 0)
    assert evaluation["status"] == "done"
    assert evaluation["total"] == evaluation["originalTotal"] == 82.94
    assert evaluation["usage"]["inputTokens"] == 800
    assert evaluation["usage"]["outputTokens"] == 160
    assert evaluation["usage"]["calls"] == 8
    assert evaluation["usage"]["costUsd"] == pytest.approx(0.008)
    assert job["usage"] == evaluation["usage"]
    assert evaluation["needsReviewCount"] == 1
    assert evaluation["model"] == "test-provider-model"
    assert evaluation["startedAt"] and evaluation["finishedAt"]
    assert evaluation["durationMs"] >= 0
    assert Evaluation.model_validate(evaluation).total == 82.94


def test_evaluation_conversation_preserves_source_after_reimport(seeded_client, dev_payload):
    original = seeded_client.get('/api/conversations/p1-ru-001').json()
    _, (evaluation,) = finish(seeded_client, start(seeded_client))
    # Evaluations created before registry identity was added still have valid snapshots.
    stored = seeded_client.app.state.db.get_evaluation(evaluation['id'])
    stored['_conversation'].pop('number', None)
    stored['_conversation'].pop('startedAt', None)
    seeded_client.app.state.db.save_evaluation(stored)
    changed = copy.deepcopy(next(r for r in dev_payload['data']['records'] if r['conversation_id'] == 'p1-ru-001'))
    changed['transcript'][0]['text'] = 'Новый вопрос после изменения транскрипта.'
    assert seeded_client.post('/api/conversations/upload', json=[changed]).json()['updated'] == 1
    current = seeded_client.get('/api/conversations/p1-ru-001').json()
    assert current['transcript'] != original['transcript']
    response = seeded_client.get(f"/api/evaluations/{evaluation['id']}/conversation")
    assert response.status_code == 200
    assert response.json() == original
    assert '_conversation' not in seeded_client.get(f"/api/evaluations/{evaluation['id']}").json()
    missing = seeded_client.get('/api/evaluations/ev_missing/conversation')
    assert missing.status_code == 404
    assert missing.json()['error']['code'] == 'not_found'


def test_five_fixture_conversations_and_public_response_shapes(seeded_client):
    job, evaluations = finish(seeded_client, start(seeded_client, FIXTURE_IDS))
    assert job["status"] == "done", evaluations
    assert (job["total"], job["done"], job["failed"]) == (5, 5, 0)
    assert len(job["items"]) == 5
    for evaluation in evaluations:
        Evaluation.model_validate(evaluation)
        assert evaluation["status"] == "done"
        assert len(evaluation["items"]) == 8
        assert evaluation["total"] is not None
        conversation = seeded_client.get(f"/api/conversations/{evaluation['conversationId']}").json()
        for item in evaluation["items"]:
            assert item["status"] == "done"
            assert item["original"] is None and item["appealId"] is None
            assert not item["reused"]
            for evidence in item["evidence"]:
                assert evidence["quote"] in conversation["transcript"][evidence["turnIdx"]]["text"]
                assert len(evidence["quote"]) <= 200
            if item["checkedRange"]:
                assert set(item["checkedRange"]) == {"fromIdx", "toIdx"}
    reviewed = seeded_client.get("/api/conversations", params={"status": "review"}).json()
    assert {row["id"] for row in reviewed["items"]} == {"p1-ru-007", "p4-ru-001"}
    for row in reviewed["items"]:
        assert len(row["lastEvaluation"]["ribbon"]) == 8


def test_partial_result_is_persisted_without_premature_total(seeded_client, monkeypatch):
    release = threading.Event()

    async def judge(conversation, criterion):
        if criterion.id != "contact":
            while not release.is_set():
                await asyncio.sleep(0.005)
        return make_result(EXAMPLE_ANSWERS[criterion.id])

    monkeypatch.setattr(llm_switch.get_judge(), "judge", judge)
    submission = start(seeded_client)
    evaluation_id = submission["evaluationIds"]["p1-ru-001"]
    try:
        partial = wait_for(seeded_client, f"/api/evaluations/{evaluation_id}",
                           lambda body: any(item["status"] == "done" for item in body["items"]))
        assert partial["status"] == "running"
        assert partial["total"] is None and partial["originalTotal"] is None
        assert any(item["status"] in {"pending", "running"} for item in partial["items"])
        persisted = seeded_client.app.state.db.get_evaluation(evaluation_id)
        assert next(item for item in persisted["items"] if item["criterionId"] == "contact")["status"] == "done"
    finally:
        release.set()
    job, (complete,) = finish(seeded_client, submission)
    assert job["status"] == "done" and complete["total"] == 82.94


def test_reuse_does_not_call_model_or_carry_usage(seeded_client, monkeypatch):
    _, (first,) = finish(seeded_client, start(seeded_client))
    calls = []

    async def forbidden(conversation, criterion):
        calls.append(criterion.id)
        raise AssertionError("Reused answers must not call a model")

    monkeypatch.setattr(llm_switch.get_judge(), "judge", forbidden)
    job, (second,) = finish(seeded_client, start(seeded_client, reuse=True))
    assert calls == []
    assert second["status"] == "done" and second["total"] == first["total"]
    assert all(item["reused"] for item in second["items"])
    assert second["usage"] == {"inputTokens": 0, "outputTokens": 0, "costUsd": 0, "calls": 0}
    assert job["usage"] == second["usage"]
    assert [item["answer"] for item in second["items"]] == [item["answer"] for item in first["items"]]


def test_reuse_restores_original_model_answer_after_appeal(seeded_client, monkeypatch):
    _, (first,) = finish(seeded_client, start(seeded_client))
    response = seeded_client.post("/api/appeals", json={
        "evaluationId": first["id"], "criterionId": "closing",
        "comment": "Прощание было достаточным для завершения диалога.", "proposedAnswer": "yes",
    })
    assert response.status_code == 201, response.text
    decision = seeded_client.post(f"/api/appeals/{response.json()['id']}/decision", json={
        "action": "change", "newAnswer": "yes", "reason": "После проверки подтверждено корректное завершение.",
    })
    assert decision.status_code == 200, decision.text
    assert decision.json()["evaluation"]["total"] != first["total"]
    calls = []

    async def forbidden(conversation, criterion):
        calls.append(criterion.id)
        raise AssertionError("Original model answer should be reused")

    monkeypatch.setattr(llm_switch.get_judge(), "judge", forbidden)
    _, (reused,) = finish(seeded_client, start(seeded_client, reuse=True))
    assert calls == []
    closing = next(item for item in reused["items"] if item["criterionId"] == "closing")
    assert closing["answer"] == "no"
    assert closing["original"] is None and closing["appealId"] is None
    assert reused["total"] == reused["originalTotal"] == first["total"]


def test_one_failed_criterion_has_null_total_and_retry_preserves_finished_work(seeded_client, monkeypatch):
    calls = Counter()
    failure = {"enabled": True}

    async def judge(conversation, criterion):
        calls[criterion.id] += 1
        if criterion.id == "closing" and failure["enabled"]:
            raise JudgeError("Тестовый сбой провайдера")
        return make_result(EXAMPLE_ANSWERS[criterion.id])

    monkeypatch.setattr(llm_switch.get_judge(), "judge", judge)
    submission = start(seeded_client)
    job, (failed,) = finish(seeded_client, submission)
    assert job["status"] == "failed" and job["failed"] == 1
    assert failed["status"] == "failed" and failed["total"] is None
    assert sum(item["status"] == "done" for item in failed["items"]) == 7
    closing = next(item for item in failed["items"] if item["criterionId"] == "closing")
    assert closing["status"] == "failed"
    assert "Тестовый сбой" in closing["explanation"]
    failure["enabled"] = False
    retried = seeded_client.post(f"/api/evaluations/{failed['id']}/criteria/closing/retry", json={})
    assert retried.status_code == 202, retried.text
    repaired = wait_for(seeded_client, f"/api/evaluations/{failed['id']}",
                        lambda body: body["status"] in {"done", "failed"})
    assert repaired["status"] == "done" and repaired["total"] == 82.94
    assert calls == Counter({**{key: 1 for key in EXAMPLE_ANSWERS}, "closing": 2})
    assert repaired["usage"]["calls"] == 8
    repaired_job = seeded_client.get(f"/api/jobs/{submission['jobId']}").json()
    assert repaired_job["status"] == "done"
    assert (repaired_job["done"], repaired_job["failed"]) == (1, 0)


def test_missing_fake_fixture_is_a_failure_not_an_invented_answer(seeded_client):
    job, (evaluation,) = finish(seeded_client, start(seeded_client, ["p1-ru-002"]))
    assert job["status"] == "failed"
    assert evaluation["status"] == "failed" and evaluation["total"] is None
    assert all(item["status"] == "failed" and item["answer"] is None for item in evaluation["items"])


def test_changed_transcript_is_not_reused(seeded_client, dev_payload, monkeypatch):
    _, (first,) = finish(seeded_client, start(seeded_client))
    record = copy.deepcopy(next(record for record in dev_payload["data"]["records"]
                                if record["conversation_id"] == "p1-ru-001"))
    record["transcript"][0]["text"] += " Дополнительная деталь запроса."
    uploaded = seeded_client.post("/api/conversations/upload", json=[record])
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["updated"] == 1
    calls = []

    async def judge(conversation, criterion):
        calls.append(criterion.id)
        return make_result(EXAMPLE_ANSWERS[criterion.id])

    monkeypatch.setattr(llm_switch.get_judge(), "judge", judge)
    _, (changed,) = finish(seeded_client, start(seeded_client, reuse=True))
    assert set(calls) == set(EXAMPLE_ANSWERS)
    assert len(calls) == 8
    assert changed["transcriptHash"] != first["transcriptHash"]
    assert not any(item["reused"] for item in changed["items"])


def test_queue_resumes_after_server_restart_without_repeating_done_items(tmp_path, dev_payload, monkeypatch):
    from tests.helpers import create_app
    from app.settings import Settings

    settings = Settings(db_path=tmp_path / "resume.sqlite", auto_summarize=False)
    release = threading.Event()
    completed = Counter()

    async def judge(conversation, criterion):
        if criterion.id != "contact":
            while not release.is_set():
                await asyncio.sleep(0.005)
        completed[criterion.id] += 1
        return make_result(EXAMPLE_ANSWERS[criterion.id])

    monkeypatch.setattr(llm_switch.get_judge(), "judge", judge)
    with TestClient(create_app(settings)) as first_client:
        response = first_client.post("/api/conversations/upload", json=dev_payload)
        assert response.status_code == 200, response.text
        submission = start(first_client)
        evaluation_id = submission["evaluationIds"]["p1-ru-001"]
        wait_for(first_client, f"/api/evaluations/{evaluation_id}",
                 lambda body: any(item["status"] == "done" for item in body["items"]))
    assert completed["contact"] == 1
    release.set()
    with TestClient(create_app(settings)) as second_client:
        job, (resumed,) = finish(second_client, submission)
        assert job["status"] == "done" and resumed["total"] == 82.94
        assert completed == Counter({key: 1 for key in EXAMPLE_ANSWERS})


def test_invalid_ids_are_contract_errors_without_partial_batch_creation(seeded_client):
    response = seeded_client.post("/api/evaluations", json={
        "conversationIds": ["p1-ru-001", "not-a-conversation"],
        "checklistId": "cl_1", "reuse": False,
    })
    assert response.status_code == 404, response.text
    assert set(response.json()) == {"error"}
    assert set(response.json()["error"]) == {"code", "message"}
    assert response.json()["error"]["code"] == "not_found"
    assert seeded_client.get("/api/conversations/p1-ru-001/evaluations").json() == {"items": []}


def test_rate_limit_retries_are_bounded_with_required_backoff(monkeypatch):
    from app.evaluations import EvaluationQueue

    class RateLimitError(Exception):
        status_code = 429

    waits = []
    attempts = []

    async def sleep(seconds):
        waits.append(seconds)

    async def provider():
        attempts.append(1)
        raise RateLimitError("Retry later")

    monkeypatch.setattr(asyncio, "sleep", sleep)
    queue = EvaluationQueue(None, SimpleNamespace(judge_concurrency=1))
    with pytest.raises(RateLimitError):
        asyncio.run(queue._invoke_with_retries(provider, (), {}))
    assert len(attempts) == 4
    assert waits == [2, 4, 8]


def test_shared_provider_gate_honors_priority_and_times_out():
    from app.evaluations import EvaluationQueue

    async def scenario():
        db = SimpleNamespace(all_jobs=lambda: [], all_evaluations=lambda: [])
        queue = EvaluationQueue(db, SimpleNamespace(judge_concurrency=1, model_timeout=0.1))
        await queue.start()
        entered = asyncio.Event()
        release = asyncio.Event()
        order = []

        async def blocking():
            entered.set()
            await release.wait()
            return "initial"

        async def provider(label):
            order.append(label)
            return label

        async def never_finishes():
            await asyncio.Event().wait()

        try:
            initial = asyncio.create_task(queue.call_model(blocking))
            await entered.wait()
            low = asyncio.create_task(queue.call_model(provider, "summary", priority=10))
            high = asyncio.create_task(queue.call_model(provider, "evaluation", priority=0))
            await asyncio.sleep(0)
            release.set()
            assert await asyncio.gather(initial, low, high) == ["initial", "summary", "evaluation"]
            assert order == ["evaluation", "summary"]
            with pytest.raises(asyncio.TimeoutError):
                await queue.call_model(never_finishes)
            assert await queue.call_model(provider, "after-timeout") == "after-timeout"
        finally:
            await queue.close()

    asyncio.run(scenario())


def test_provider_concurrency_limit_is_shared_between_calls():
    from app.evaluations import EvaluationQueue

    async def scenario():
        db = SimpleNamespace(all_jobs=lambda: [], all_evaluations=lambda: [])
        queue = EvaluationQueue(db, SimpleNamespace(judge_concurrency=2, model_timeout=1))
        await queue.start()
        active = 0
        maximum = 0

        async def provider():
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            await asyncio.sleep(0.005)
            active -= 1
            return True

        try:
            results = await asyncio.gather(*[queue.call_model(provider) for _ in range(10)])
            assert results == [True] * 10
            assert maximum == 2
        finally:
            await queue.close()

    asyncio.run(scenario())


def test_cancelled_caller_stops_provider_and_preserves_worker():
    from app.evaluations import EvaluationQueue

    async def scenario():
        db = SimpleNamespace(all_jobs=lambda: [], all_evaluations=lambda: [])
        queue = EvaluationQueue(db, SimpleNamespace(judge_concurrency=1, model_timeout=30))
        await queue.start()
        worker = queue._workers[0]
        entered = asyncio.Event()
        cleaned_up = asyncio.Event()

        async def blocked_provider():
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                cleaned_up.set()

        async def following_provider():
            return "next-result"

        try:
            caller = asyncio.create_task(queue.call_model(blocked_provider))
            await asyncio.wait_for(entered.wait(), 1)
            caller.cancel()
            with pytest.raises(asyncio.CancelledError):
                await caller
            await asyncio.wait_for(cleaned_up.wait(), 1)
            assert await asyncio.wait_for(queue.call_model(following_provider), 1) == "next-result"
            assert queue._workers == [worker]
            assert not worker.done()
        finally:
            await queue.close()

    asyncio.run(scenario())
