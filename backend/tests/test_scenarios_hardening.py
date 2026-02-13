from uuid import uuid4


def _name(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def test_create_scenario_normalizes_payload(client):
    payload = {
        "name": f"  {_name('Copa')}  ",
        "description": "  descripcion de prueba  ",
        "session_type": "RACE",
        "allowed_cars": [" ks_ferrari_488_gt3 ", "", "ks_ferrari_488_gt3"],
        "allowed_tracks": [" spa ", "spa", " monza "],
        "allowed_durations": [20, 10, 20, 15],
        "is_active": True,
    }

    response = client.post("/scenarios/", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"].startswith("Copa-")
    assert data["description"] == "descripcion de prueba"
    assert data["session_type"] == "race"
    assert data["allowed_cars"] == ["ks_ferrari_488_gt3"]
    assert data["allowed_tracks"] == ["spa", "monza"]
    assert data["allowed_durations"] == [10, 15, 20]


def test_create_scenario_rejects_duplicate_name_case_insensitive(client):
    name = _name("GT3")
    first = client.post("/scenarios/", json={"name": name, "allowed_cars": [], "allowed_tracks": [], "allowed_durations": [10]})
    assert first.status_code == 200

    second = client.post(
        "/scenarios/",
        json={"name": name.lower(), "allowed_cars": [], "allowed_tracks": [], "allowed_durations": [10]},
    )
    assert second.status_code == 400
    assert "already exists" in second.json()["detail"]


def test_update_scenario_returns_conflict_for_stale_expected_updated_at(client):
    created = client.post(
        "/scenarios/",
        json={"name": _name("Drift"), "allowed_cars": [], "allowed_tracks": [], "allowed_durations": [10]},
    )
    assert created.status_code == 200
    scenario_id = created.json()["id"]

    conflict = client.put(
        f"/scenarios/{scenario_id}",
        json={
            "description": "nuevo texto",
            "expected_updated_at": "2000-01-01T00:00:00Z",
        },
    )
    assert conflict.status_code == 409
    detail = conflict.json()["detail"]
    assert detail["code"] == "scenario_conflict"
    assert "current_updated_at" in detail


def test_delete_requires_matching_name_when_confirmation_is_sent(client):
    created = client.post(
        "/scenarios/",
        json={"name": _name("Delete"), "allowed_cars": [], "allowed_tracks": [], "allowed_durations": [15]},
    )
    assert created.status_code == 200
    scenario = created.json()
    scenario_id = scenario["id"]
    scenario_name = scenario["name"]

    wrong = client.delete(f"/scenarios/{scenario_id}?confirm_name=Wrong")
    assert wrong.status_code == 409

    ok = client.delete(f"/scenarios/{scenario_id}?confirm_name={scenario_name}")
    assert ok.status_code == 200
    data = ok.json()
    assert data["status"] == "ok"
    assert data["deleted"]["name"] == scenario_name


def test_create_scenario_rejects_invalid_values(client):
    invalid_session = client.post(
        "/scenarios/",
        json={"name": _name("InvalidA"), "session_type": "arcade", "allowed_cars": [], "allowed_tracks": [], "allowed_durations": [10]},
    )
    assert invalid_session.status_code == 422

    invalid_duration = client.post(
        "/scenarios/",
        json={"name": _name("InvalidB"), "allowed_cars": [], "allowed_tracks": [], "allowed_durations": [2]},
    )
    assert invalid_duration.status_code == 422
