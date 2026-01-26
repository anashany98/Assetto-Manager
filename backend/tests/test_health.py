
import httpx
from app.main import app

transport = httpx.ASGITransport(app=app)
client = httpx.Client(transport=transport, base_url="http://test")

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_read_main():
    # Root now serves the SPA (HTML), not JSON API response
    response = client.get("/")
    assert response.status_code == 200
    # Check it returns HTML content (the SPA)
    assert "<!doctype html>" in response.text.lower() or "<!DOCTYPE html>" in response.text
