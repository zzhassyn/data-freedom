from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP

import pytest

from app import llm_switch
from app.apply import compare_evaluations
from tests.helpers import evaluate


def create_version(client, source, mutate):
    body = deepcopy(source)
    body["basedOnVersion"] = source["version"]
    body["isActive"] = False
    for field in ("id", "version", "createdAt"):
        body.pop(field, None)
    mutate(body)
    response = client.post("/api/checklists", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_weight_change_reuses_and_recalculates_then_rule_change_calls_once(seeded_client, monkeypatch):
    client = seeded_client
    ids = ["p1-ru-001", "p1-ru-007"]
    first = evaluate(client, ids=ids, reuse=False)
    assert all(item["status"] == "done" for item in first)
    checklist = client.get("/api/checklists/active").json()

    calls = []
    judge_module = llm_switch.get_judge()
    original_judge = judge_module.judge

    async def tracked(conversation, criterion):
        calls.append((conversation.id, criterion.id))
        return await original_judge(conversation, criterion)

    monkeypatch.setattr(judge_module, "judge", tracked)

    def increase_closing(body):
        next(criterion for criterion in body["criteria"] if criterion["id"] == "closing")["weight"] = 10

    second_checklist = create_version(client, checklist, increase_closing)
    second = evaluate(client, ids=ids, checklist_id=second_checklist["id"], reuse=True)
    assert calls == []
    assert all(item["reused"] for ev in second for item in ev["items"])
    assert all(ev["usage"]["calls"] == 0 for ev in second)
    assert all(new["total"] != old["total"] for old, new in zip(first, second))

    comparison = client.get(
        f"/api/checklists/{second_checklist['id']}/compare",
        params={"against": checklist["id"], "groupId": "UPLOAD"},
    )
    assert comparison.status_code == 200, comparison.text
    result = comparison.json()
    assert result["summary"]["total"] == 2
    assert result["summary"]["changedCount"] == 2
    assert all(item["changed"] == [] for item in result["items"])
    expected_delta = sum(
        Decimal(str(new["total"])) - Decimal(str(old["total"])) for old, new in zip(first, second)
    ) / 2
    assert result["summary"]["avgDelta"] == pytest.approx(
        float(expected_delta.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    )

    def change_closing_rule(body):
        criterion = next(item for item in body["criteria"] if item["id"] == "closing")
        criterion["description"] += " Проверьте прощание отдельно."

    third_checklist = create_version(client, second_checklist, change_closing_rule)
    third = evaluate(client, ids=ids, checklist_id=third_checklist["id"], reuse=True)
    assert sorted(calls) == [(ids[0], "closing"), (ids[1], "closing")]
    assert all(ev["status"] == "done" for ev in third)
    assert all(sum(not item["reused"] for item in ev["items"]) == 1 for ev in third)


def test_compare_uses_newest_done_and_filters_group(seeded_client):
    client = seeded_client
    old = evaluate(client)[0]
    newest = evaluate(client)[0]
    assert newest["id"] != old["id"]
    response = client.get("/api/checklists/cl_1/compare", params={"against": "cl_1"})
    result = response.json()
    assert len(result["items"]) == 1
    assert result["items"][0]["before"] == newest["total"]
    assert result["items"][0]["after"] == newest["total"]
    assert result["summary"] == {"changedCount": 0, "total": 1, "avgDelta": 0}
    filtered = client.get("/api/checklists/cl_1/compare", params={"against": "cl_1", "groupId": "OTHER"})
    assert filtered.json()["items"] == []


def test_compare_missing_version_returns_not_found(client):
    response = client.get("/api/checklists/cl_1/compare", params={"against": "cl_missing"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_compare_missing_score_is_not_zero_and_added_removed_answers_are_visible():
    old = [{"conversationId": "a", "total": 80, "items": [
        {"criterionId": "same", "answer": "no"}, {"criterionId": "removed", "answer": "yes"}
    ]}]
    new = [
        {"conversationId": "a", "total": 85, "items": [
            {"criterionId": "same", "answer": "yes"}, {"criterionId": "added", "answer": 10}
        ]},
        {"conversationId": "b", "total": 90, "items": [{"criterionId": "same", "answer": "yes"}]},
    ]
    result = compare_evaluations(old, new)
    assert result["summary"] == {"changedCount": 1, "total": 2, "avgDelta": 5}
    assert result["items"][1] == {"conversationId": "b", "before": None, "after": 90, "changed": []}
    assert result["items"][0]["changed"] == [
        {"criterionId": "same", "before": "no", "after": "yes"},
        {"criterionId": "added", "before": None, "after": 10},
        {"criterionId": "removed", "before": "yes", "after": None},
    ]
