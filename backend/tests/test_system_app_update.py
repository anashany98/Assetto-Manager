from app.routers import system as system_router


def _set_state(is_updating: bool, last_run):
    with system_router._APP_UPDATE_LOCK:
        system_router._APP_UPDATE_STATE["is_updating"] = is_updating
        system_router._APP_UPDATE_STATE["last_run"] = last_run


def test_app_update_status_endpoint_returns_snapshot(client, monkeypatch):
    monkeypatch.setattr(
        system_router,
        "_read_git_update_status",
        lambda refresh=True: {
            "supported": True,
            "has_update": True,
            "current_branch": "master",
            "current_commit": "abc123",
            "latest_commit": "def456",
            "behind_count": 2,
            "check_error": None,
            "checked_at": "2026-02-12T00:00:00+00:00",
        },
    )
    monkeypatch.setattr(
        system_router,
        "_read_restart_capability",
        lambda check_service=True: {
            "restart_supported": True,
            "restart_service_name": "ACManagerBackend",
            "restart_error": None,
        },
    )
    _set_state(False, None)

    response = client.get("/system/app-update/status?refresh=false")
    assert response.status_code == 200
    data = response.json()

    assert data["supported"] is True
    assert data["has_update"] is True
    assert data["current_branch"] == "master"
    assert data["behind_count"] == 2
    assert data["is_updating"] is False
    assert data["restart_supported"] is True
    assert data["restart_service_name"] == "ACManagerBackend"


def test_run_app_update_starts_background_task(client, monkeypatch):
    observed = {"called": False, "force": False}

    def fake_runner(force=False):
        observed["called"] = True
        observed["force"] = bool(force)
        _set_state(False, {"status": "success", "steps": []})

    monkeypatch.setattr(system_router, "_web_updates_enabled", lambda: True)
    monkeypatch.setattr(system_router, "_execute_full_app_update", fake_runner)
    _set_state(False, None)

    response = client.post("/system/app-update/run", json={"force": True})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "started"
    assert data["force"] is True
    assert observed["called"] is True
    assert observed["force"] is True


def test_run_app_update_rejects_when_busy(client, monkeypatch):
    monkeypatch.setattr(system_router, "_web_updates_enabled", lambda: True)
    _set_state(True, {"status": "running", "steps": []})

    response = client.post("/system/app-update/run", json={"force": False})
    assert response.status_code == 409
    assert "already running" in response.json()["detail"].lower()

    _set_state(False, None)


def test_restart_service_endpoint_schedules_restart(client, monkeypatch):
    observed = {"called": False, "args": None}

    def fake_popen(*args, **kwargs):
        observed["called"] = True
        observed["args"] = args

        class _Dummy:
            pass

        return _Dummy()

    monkeypatch.setattr(
        system_router,
        "_read_restart_capability",
        lambda check_service=True: {
            "restart_supported": True,
            "restart_service_name": "ACManagerBackend",
            "restart_error": None,
        },
    )
    monkeypatch.setattr(system_router.subprocess, "Popen", fake_popen)
    _set_state(False, {"status": "success", "restart_required": True, "steps": []})

    response = client.post("/system/app-update/restart-service")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "scheduled"
    assert data["service_name"] == "ACManagerBackend"
    assert observed["called"] is True
    assert observed["args"] is not None


def test_restart_service_endpoint_rejects_when_busy(client, monkeypatch):
    monkeypatch.setattr(
        system_router,
        "_read_restart_capability",
        lambda check_service=True: {
            "restart_supported": True,
            "restart_service_name": "ACManagerBackend",
            "restart_error": None,
        },
    )
    _set_state(True, {"status": "running", "steps": []})

    response = client.post("/system/app-update/restart-service")
    assert response.status_code == 409
    assert "update is running" in response.json()["detail"].lower()

    _set_state(False, None)
