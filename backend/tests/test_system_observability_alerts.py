from app.observability import reset_metrics


def test_system_metrics_includes_recent_window(client):
    reset_metrics()
    for _ in range(3):
        response = client.get("/health/live")
        assert response.status_code == 200

    response = client.get("/system/metrics")
    assert response.status_code == 200
    data = response.json()

    assert "recent" in data
    assert data["recent"]["requests"] >= 3
    assert "error_rate" in data["recent"]
    assert "server_error_rate" in data["recent"]
    assert "p95_ms" in data["recent"]
    assert "alerts" in data


def test_system_alerts_triggers_on_error_rate(client, monkeypatch):
    reset_metrics()
    monkeypatch.setenv("ALERT_MIN_REQUESTS", "5")
    monkeypatch.setenv("ALERT_ERROR_RATE_WARN", "0.30")
    monkeypatch.setenv("ALERT_ERROR_RATE_CRIT", "0.60")

    for _ in range(5):
        response = client.get("/hardware/status/999999")
        assert response.status_code == 404

    response = client.get("/system/alerts")
    assert response.status_code == 200
    data = response.json()

    ids = {item["id"] for item in data["alerts"]}
    assert "api_error_rate" in ids
    assert data["status"] in {"warning", "critical"}


def test_system_alerts_station_offline_ratio(client, monkeypatch):
    reset_metrics()
    monkeypatch.setenv("ALERT_STATIONS_MIN_TOTAL", "1")
    monkeypatch.setenv("ALERT_STATION_OFFLINE_WARN_RATIO", "0.10")
    monkeypatch.setenv("ALERT_STATION_OFFLINE_CRIT_RATIO", "0.50")

    response = client.get("/system/alerts")
    assert response.status_code == 200
    data = response.json()

    ids = {item["id"] for item in data["alerts"]}
    assert "stations_offline_ratio" in ids
