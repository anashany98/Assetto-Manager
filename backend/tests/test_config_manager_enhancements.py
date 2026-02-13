def test_config_safe_mode_toggle(client):
    r = client.get("/configs/safe-mode")
    assert r.status_code == 200
    assert isinstance(r.json().get("enabled"), bool)

    r = client.post("/configs/safe-mode", json={"enabled": False})
    assert r.status_code == 200
    assert r.json()["enabled"] is False

    r = client.get("/configs/safe-mode")
    assert r.status_code == 200
    assert r.json()["enabled"] is False


def test_station_groups_crud(client):
    create = client.post("/configs/groups", json={"name": "Grupo A", "station_ids": [1, 2]})
    assert create.status_code == 200
    groups = create.json().get("groups", [])
    assert any(g["name"] == "Grupo A" for g in groups)

    read = client.get("/configs/groups")
    assert read.status_code == 200
    assert any(g["name"] == "Grupo A" for g in read.json().get("groups", []))

    delete = client.delete("/configs/groups/Grupo%20A")
    assert delete.status_code == 200
    assert delete.json()["status"] == "deleted"


def test_validate_endpoint_rejects_out_of_range_values(client):
    # Ensure safe mode is enabled so strict thresholds apply.
    client.post("/configs/safe-mode", json={"enabled": True})

    payload = {
        "sections": {
            "VIDEO": {
                "RENDER_SCALE": "250",
            }
        }
    }
    r = client.post("/configs/validate/video", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("RENDER_SCALE" in err for err in body["errors"])


def test_deploy_preflight_requires_non_empty_deploy_map(client):
    r = client.post("/configs/deploy/preflight", json={"deploy_map": {}})
    assert r.status_code == 400
    assert "deploy_map cannot be empty" in str(r.json().get("detail", ""))
