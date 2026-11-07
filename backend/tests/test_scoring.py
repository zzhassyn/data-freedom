from copy import deepcopy
import json
from pathlib import Path

import pytest

from app.errors import ApiError
from app.scoring import score_evaluation, validate_answer


@pytest.fixture
def checklist():
    return json.loads((Path(__file__).parents[1] / "app/seed/checklist_v1.json").read_text(encoding="utf-8"))


def answers(checklist, **overrides):
    values = {"contact": "yes", "needs": "na", "identification": "yes", "consultation": 15,
              "empathy": "yes", "dialogue": 7, "closing": "no", "gross": "no"}
    values.update(overrides)
    return [{"criterionId": c["id"], "answer": values[c["id"]], "status": "done"}
            for c in checklist["criteria"]]


def test_contract_example_82_94_and_unrounded_weights(checklist):
    items = answers(checklist)
    original_items = deepcopy(items)
    result = score_evaluation(checklist, items)
    assert result["total"] == 82.94
    indexed = {item["criterionId"]: item for item in result["items"]}
    assert indexed["contact"]["effectiveWeight"] == pytest.approx(10 * 100 / 85)
    assert indexed["contact"]["effectiveWeight"] != 11.76
    assert indexed["consultation"]["fraction"] == 0.75
    assert indexed["dialogue"]["fraction"] == 0.7
    assert indexed["needs"]["fraction"] is None
    assert sum(item["points"] for item in result["items"]) == pytest.approx(82.94117647058823)
    assert sum(section["max"] for section in result["sections"]) == pytest.approx(100)
    assert items == original_items


def test_all_na_has_no_total_or_sections(checklist):
    items = [{"criterionId": c["id"], "answer": "na", "status": "done"} for c in checklist["criteria"]]
    result = score_evaluation(checklist, items)
    assert result["total"] is None
    assert result["sections"] is None
    assert all(item["points"] == item["effectiveWeight"] == 0 for item in result["items"])


@pytest.mark.parametrize("answer,total", [("yes", 100), ("no", 0)])
def test_one_applicable_criterion(checklist, answer, total):
    items = [{"criterionId": c["id"], "answer": answer if c["id"] == "contact" else "na"}
             for c in checklist["criteria"]]
    result = score_evaluation(checklist, items)
    assert result["total"] == total
    assert result["items"][0]["effectiveWeight"] == 100


def test_scale_zero_is_applicable_and_flag_has_no_points(checklist):
    items = answers(checklist, needs="yes", consultation=0, dialogue=10, closing="yes", gross="yes")
    items[-1]["flagTypes"] = ["bypass"]
    result = score_evaluation(checklist, items)
    assert result["total"] == 80
    consultation = result["items"][3]
    assert consultation["fraction"] == 0
    assert consultation["effectiveWeight"] == 20
    assert result["grossError"] == {"flagged": True, "types": ["bypass"], "criterionId": "gross"}
    assert result["items"][-1]["effectiveWeight"] == result["items"][-1]["points"] == 0


def test_rounds_exact_half_up():
    checklist = {"sections": [{"id": "s", "order": 0}], "criteria": [
        {"id": "a", "order": 0, "sectionId": "s", "type": "scale", "weight": 100,
         "scale": [{"value": 20000}, {"value": 2469}, {"value": 0}]}]}
    result = score_evaluation(checklist, [{"criterionId": "a", "answer": 2469}])
    assert result["items"][0]["points"] == pytest.approx(12.345)
    assert result["total"] == 12.35


def test_partial_does_not_claim_a_total(checklist):
    items = answers(checklist)
    items[0].update(answer=None, status="running")
    assert score_evaluation(checklist, items)["total"] is None


@pytest.mark.parametrize("criterion_id,answer", [("contact", "na"), ("closing", True),
                                                  ("consultation", 17), ("dialogue", "7"),
                                                  ("consultation", float("inf")), ("gross", 1)])
def test_invalid_answer_rejected(checklist, criterion_id, answer):
    criterion = next(c for c in checklist["criteria"] if c["id"] == criterion_id)
    with pytest.raises(ApiError) as exc:
        validate_answer(criterion, answer)
    assert exc.value.code == "invalid_answer"


def test_scale_numeric_equal_step_is_valid(checklist):
    validate_answer(checklist["criteria"][3], 15.0)
    validate_answer(checklist["criteria"][1], "na")
