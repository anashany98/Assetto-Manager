import uuid
import os

from app import models
from app.database import SessionLocal


def _make_station(db, *, kiosk_mode: bool, kiosk_code: str) -> models.Station:
    suffix = uuid.uuid4().hex[:8]
    station = models.Station(
        name=f"kiosk-{suffix}",
        ip_address=f"127.0.0.{int(suffix[:2], 16) % 200 + 10}",
        mac_address=f"AA:BB:CC:{suffix[:2]}:{suffix[2:4]}:{suffix[4:6]}",
        hostname=f"kiosk-{suffix}",
        is_active=True,
        is_online=True,
        status="online",
        is_kiosk_mode=kiosk_mode,
        kiosk_code=kiosk_code,
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def _session_payload(station_id: int) -> dict:
    return {
        "station_id": station_id,
        "driver_name": "Tablet Driver",
        "duration_minutes": 15,
        "price": 12.0,
        "payment_method": "cash",
        "is_vr": False,
    }


def test_public_start_session_requires_matching_kiosk_code(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "testtoken")
    monkeypatch.delenv("CLIENT_TOKENS", raising=False)
    monkeypatch.delenv("CLIENT_TOKENS_JSON", raising=False)
    db = SessionLocal()
    try:
        station = _make_station(db, kiosk_mode=True, kiosk_code="A1B2C3")
        payload = _session_payload(station.id)

        missing_code = client_no_auth.post("/sessions/start", json=payload, headers={})
        assert missing_code.status_code == 403

        wrong_code = client_no_auth.post(
            "/sessions/start",
            json=payload,
            headers={"X-Kiosk-Code": "ZZZZZZ"},
        )
        assert wrong_code.status_code == 403
        assert "Invalid kiosk code" in (wrong_code.json().get("detail") or "")

        ok = client_no_auth.post(
            "/sessions/start",
            json=payload,
            headers={"X-Kiosk-Code": "A1B2C3"},
        )
        assert ok.status_code == 200
        body = ok.json()
        assert body.get("station_id") == station.id
        assert body.get("status") == "active"
    finally:
        db.close()


def test_public_start_session_rejects_when_station_not_in_kiosk_mode(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "testtoken")
    db = SessionLocal()
    try:
        station = _make_station(db, kiosk_mode=False, kiosk_code="Q1W2E3")
        payload = _session_payload(station.id)

        auth_headers = {"X-Client-Token": os.getenv("PUBLIC_API_TOKEN", "testtoken")}
        res = client_no_auth.post(
            "/sessions/start",
            json=payload,
            headers={**auth_headers, "X-Kiosk-Code": "Q1W2E3"},
        )
        assert res.status_code == 403
        assert "kiosk mode" in (res.json().get("detail") or "").lower()
    finally:
        db.close()
