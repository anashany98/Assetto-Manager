import os
import uuid

from app import models
from app.database import SessionLocal


def _payload():
    return {
        "provider": "bizum",
        "station_id": 1,
        "duration_minutes": 10,
        "driver_name": "Test Driver",
        "is_vr": False
    }


def _make_station(db, kiosk_code: str) -> models.Station:
    suffix = uuid.uuid4().hex[:8]
    station = models.Station(
        name=f"pay-{suffix}",
        ip_address=f"127.0.0.{int(suffix[:2], 16) % 200 + 10}",
        mac_address=f"AA:DD:CC:{suffix[:2]}:{suffix[2:4]}:{suffix[4:6]}",
        hostname=f"pay-{suffix}",
        is_active=True,
        is_online=True,
        status="online",
        is_kiosk_mode=True,
        kiosk_code=kiosk_code,
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def test_payments_requires_token(client_no_auth):
    res = client_no_auth.post("/payments/checkout", json=_payload())
    assert res.status_code in (401, 403)


def test_legacy_public_token_is_read_only_for_payments(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "testtoken")
    monkeypatch.setenv("CLIENT_TOKENS", "")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    res = client_no_auth.post(
        "/payments/checkout",
        json=_payload(),
        headers={"X-Client-Token": "testtoken"}
    )
    assert res.status_code == 403


def test_kiosk_code_can_create_and_read_payment_without_client_token(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "")
    monkeypatch.setenv("CLIENT_TOKENS", "")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    db = SessionLocal()
    try:
        station = _make_station(db, "PAY123")
        payload = {**_payload(), "station_id": station.id}

        create_res = client_no_auth.post(
            "/payments/checkout",
            json=payload,
            headers={"X-Kiosk-Code": station.kiosk_code},
        )
        assert create_res.status_code == 200
        data = create_res.json()
        assert data["provider"] == "bizum"
        assert data["status"] == "pending"
        assert data.get("reference")

        get_res = client_no_auth.get(
            f"/payments/{data['id']}",
            headers={"X-Kiosk-Code": station.kiosk_code},
        )
        assert get_res.status_code == 200
        assert get_res.json()["id"] == data["id"]
    finally:
        db.close()


def test_payments_public_token_bizum(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    res = client_no_auth.post(
        "/payments/checkout",
        json=_payload(),
        headers={"X-Client-Token": "payments-token"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "bizum"
    assert data["status"] == "pending"
    assert data.get("reference")
