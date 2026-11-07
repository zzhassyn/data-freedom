from copy import deepcopy

import pytest

from app.checklists import prepare_criterion, seed_checklist


def draft(client):
    body = client.get("/api/checklists/active").json()
    body["basedOnVersion"] = body["version"]
    body["isActive"] = False
    return body


def test_seed_shape_exact_rules_and_idempotence(client):
    response = client.get("/api/checklists/active")
    assert response.status_code == 200
    checklist = response.json()
    assert checklist["id"] == "cl_1" and checklist["version"] == 1 and checklist["isActive"] is True
    assert checklist["basedOnVersion"] is None
    assert len(checklist["criteria"]) == 8
    assert [c["weight"] for c in checklist["criteria"]] == [10, 15, 20, 20, 15, 15, 5, 0]
    assert checklist["criteria"][0]["description"] == "Да, если оператор поздоровался на языке клиента и представился в первом ответе."
    assert checklist["criteria"][5]["description"] == "Оцените ясность, порядок ответов и предупреждение об ожидании. Порог первой реакции в 3 минуты, теги и вложения в оценку не входят."
    assert [s["value"] for s in checklist["criteria"][3]["scale"]] == [20, 15, 10, 5, 0]
    assert [s["value"] for s in checklist["criteria"][5]["scale"]] == [10, 7, 4, 0]
    assert [f["id"] for f in checklist["criteria"][-1]["flagTypes"]] == ["insult", "bypass", "confidential"]
    assert all(len(c["hash"]) == len(c["contentHash"]) == 40 for c in checklist["criteria"])
    seed_checklist(client.app.state.db)
    assert len(client.get("/api/checklists").json()["items"]) == 1


def test_hashes_are_content_based_not_client_supplied(client):
    criterion = draft(client)["criteria"][6]
    original = prepare_criterion(criterion)
    changed_weight = prepare_criterion({**criterion, "weight": 17, "hash": "forged", "contentHash": "forged"})
    assert changed_weight["hash"] != original["hash"]
    assert changed_weight["contentHash"] == original["contentHash"]
    moved = prepare_criterion({**criterion, "order": 99, "sectionId": "start"})
    assert moved["hash"] == original["hash"] and moved["contentHash"] == original["contentHash"]
    changed_text = prepare_criterion({**criterion, "description": "Другое правило."})
    assert changed_text["hash"] != original["hash"]
    assert changed_text["contentHash"] != original["contentHash"]


def test_new_version_activation_diff_and_original_immutable(client):
    original = client.get("/api/checklists/active").json()
    body = draft(client)
    body["criteria"][6]["weight"] = 10
    body["criteria"][6]["description"] = "Попрощайтесь и предложите помощь."
    response = client.post("/api/checklists", json=body)
    assert response.status_code == 201, response.text
    second = response.json()
    assert second["id"] == "cl_2" and second["basedOnVersion"] == 1
    assert second["isActive"] is False
    assert client.get("/api/checklists/cl_1").json() == original
    diff = client.get("/api/checklists/cl_2/diff", params={"against": "cl_1"}).json()
    assert diff["added"] == diff["removed"] == []
    assert diff["changed"] == [{"criterionId": "closing", "fields": ["description", "weight"]}]
    assert len(diff["unchanged"]) == 7
    assert client.post("/api/checklists/cl_2/activate").json()["isActive"] is True
    assert client.get("/api/checklists/active").json()["id"] == "cl_2"
    listing = client.get("/api/checklists").json()["items"]
    assert len(listing) == 2 and sum(c["isActive"] for c in listing) == 1
    assert all(c["criteriaCount"] == 8 and c["evaluationsCount"] == 0 for c in listing)
    assert client.post("/api/checklists/cl_1/activate").status_code == 200
    assert client.get("/api/checklists/active").json()["id"] == "cl_1"
    assert client.post("/api/checklists/cl_2/activate").status_code == 200
    assert client.get("/api/checklists/active").json()["id"] == "cl_2"


@pytest.mark.parametrize("case", ["duplicate", "scale_no_zero", "scale_one", "scale_duplicate", "negative_weight",
                                  "flag_weight", "flag_types", "missing_na", "missing_section", "unknown_base"])
def test_checklist_validation_has_contract_error(client, case):
    body = draft(client)
    if case == "duplicate":
        body["criteria"].append(deepcopy(body["criteria"][0]))
    elif case == "scale_no_zero":
        body["criteria"][3]["scale"][-1]["value"] = 1
    elif case == "scale_one":
        body["criteria"][3]["scale"] = body["criteria"][3]["scale"][:1]
    elif case == "scale_duplicate":
        body["criteria"][3]["scale"][1]["value"] = 20
    elif case == "negative_weight":
        body["criteria"][0]["weight"] = -1
    elif case == "flag_weight":
        body["criteria"][-1]["weight"] = 1
    elif case == "flag_types":
        body["criteria"][-1]["flagTypes"] = []
    elif case == "missing_na":
        body["criteria"][1]["naCondition"] = "   "
    elif case == "missing_section":
        body["criteria"][0]["sectionId"] = "missing"
    elif case == "unknown_base":
        body["basedOnVersion"] = 99
    response = client.post("/api/checklists", json=body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_checklist"
    assert response.json()["error"]["message"]
    assert len(client.get("/api/checklists").json()["items"]) == 1


def test_added_removed_and_reordered_diff(client):
    body = draft(client)
    body["criteria"] = [c for c in body["criteria"] if c["id"] != "gross"]
    new = deepcopy(body["criteria"][0])
    new.update(id="other", order=9, title="Другой критерий")
    body["criteria"].append(new)
    body["criteria"][0].update(order=7, sectionId="flow")
    assert client.post("/api/checklists", json=body).status_code == 201
    diff = client.get("/api/checklists/cl_2/diff?against=cl_1").json()
    assert diff["added"] == ["other"] and diff["removed"] == ["gross"]
    assert diff["changed"] == [{"criterionId": "contact", "fields": ["sectionId", "order"]}]


def test_checklist_not_found(client):
    for path in ("/api/checklists/missing", "/api/checklists/cl_1/diff?against=missing"):
        response = client.get(path)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"
