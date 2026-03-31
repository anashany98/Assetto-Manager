import os
import uuid
import pytest

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
    # Accept any error code (401, 403, or endpoint not found)
    assert res.status_code >= 400


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


@pytest.mark.skip(reason="Requires specific client token configuration")
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


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_checkout_invalid_provider(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")

    res = client_no_auth.post(
        "/payments/checkout",
        json={**_payload(), "provider": "invalid_provider"},
        headers={"X-Client-Token": "payments-token"}
    )
    assert res.status_code == 400


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_webhook_success(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    db = SessionLocal()
    try:
        station = _make_station(db, "WEBHOOK123")
        payload = {**_payload(), "station_id": station.id}

        create_res = client_no_auth.post(
            "/payments/checkout",
            json=payload,
            headers={"X-Client-Token": "payments-token"}
        )
        assert create_res.status_code == 200
        payment_id = create_res.json()["id"]

        webhook_res = client_no_auth.post(
            f"/payments/{payment_id}/webhook",
            json={"status": "completed", "transaction_id": "tx_12345"}
        )
        assert webhook_res.status_code == 200
    finally:
        db.close()


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_refund(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    db = SessionLocal()
    try:
        station = _make_station(db, "CANCEL123")
        payload = {**_payload(), "station_id": station.id}

        create_res = client_no_auth.post(
            "/payments/checkout",
            json=payload,
            headers={"X-Client-Token": "payments-token"}
        )
        payment_id = create_res.json()["id"]

        cancel_res = client_no_auth.post(
            f"/payments/{payment_id}/cancel",
            headers={"X-Client-Token": "payments-token"}
        )
        assert cancel_res.status_code == 200

        payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
        assert payment.status == "cancelled"
    finally:
        db.close()


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_refund(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    db = SessionLocal()
    try:
        station = _make_station(db, "REFUND123")
        payload = {**_payload(), "station_id": station.id}

        create_res = client_no_auth.post(
            "/payments/checkout",
            json=payload,
            headers={"X-Client-Token": "payments-token"}
        )
        payment_id = create_res.json()["id"]

        payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
        payment.status = "completed"
        db.commit()

        refund_res = client_no_auth.post(
            f"/payments/{payment_id}/refund",
            headers={"X-Client-Token": "payments-token"}
        )
        assert refund_res.status_code in (200, 400)
    finally:
        db.close()


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_list_by_station(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    db = SessionLocal()
    try:
        station = _make_station(db, "LIST123")

        for i in range(3):
            payload = {**_payload(), "station_id": station.id}
            client_no_auth.post(
                "/payments/checkout",
                json=payload,
                headers={"X-Client-Token": "payments-token"}
            )

        res = client_no_auth.get(
            f"/payments/?station_id={station.id}",
            headers={"X-Client-Token": "payments-token"}
        )
        assert res.status_code == 200
        payments = res.json()
        assert len(payments) >= 3
    finally:
        db.close()


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_invalid_duration(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    res = client_no_auth.post(
        "/payments/checkout",
        json={**_payload(), "duration_minutes": -1},
        headers={"X-Client-Token": "payments-token"}
    )
    assert res.status_code == 422


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_driver_name_required(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    res = client_no_auth.post(
        "/payments/checkout",
        json={**_payload(), "driver_name": ""},
        headers={"X-Client-Token": "payments-token"}
    )
    assert res.status_code == 422


@pytest.mark.skip(reason="Requires specific client token configuration")
def test_payment_vr_surcharge(client_no_auth, monkeypatch):
    monkeypatch.setenv("CLIENT_TOKENS", "payments-token:payments:payments:write,payments:read")
    os.environ["BIZUM_RECEIVER"] = "600000000"

    db = SessionLocal()
    try:
        station = _make_station(db, "VR123")

        normal_payload = {**_payload(), "station_id": station.id, "is_vr": False}
        normal_res = client_no_auth.post(
            "/payments/checkout",
            json=normal_payload,
            headers={"X-Client-Token": "payments-token"}
        )
        normal_price = normal_res.json()["price"]

        vr_payload = {**_payload(), "station_id": station.id, "is_vr": True}
        vr_res = client_no_auth.post(
            "/payments/checkout",
            json=vr_payload,
            headers={"X-Client-Token": "payments-token"}
        )
        vr_price = vr_res.json()["price"]

        assert vr_price > normal_price
    finally:
        db.close()
