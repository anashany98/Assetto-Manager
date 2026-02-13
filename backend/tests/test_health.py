
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in {"ok", "degraded"}
    assert "checks" in data
    assert "db" in data["checks"]
    assert "storage" in data["checks"]


def test_health_live():
    response = client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_health_ready():
    response = client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in {"ok", "degraded"}
    assert "checks" in data
    assert "db" in data["checks"]
    assert "storage" in data["checks"]


def test_read_main():
    # Root now serves the SPA (HTML), not JSON API response
    response = client.get("/")
    assert response.status_code == 200
    # Check it returns HTML content (the SPA)
    assert "<!doctype html>" in response.text.lower() or "<!DOCTYPE html>" in response.text
