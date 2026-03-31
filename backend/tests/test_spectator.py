import os
import uuid

from app import models
from app.database import SessionLocal
from app.routers import spectator


def _make_station() -> models.Station:
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    try:
        station = models.Station(
            name=f"spectator-{suffix}",
            ip_address=f"127.0.0.{int(suffix[:2], 16) % 200 + 10}",
            mac_address=f"AA:EE:CC:{suffix[:2]}:{suffix[2:4]}:{suffix[4:6]}",
            hostname=f"spectator-{suffix}",
            is_active=True,
            is_online=True,
            status="online",
        )
        db.add(station)
        db.commit()
        db.refresh(station)
        return station
    finally:
        db.close()


async def _fake_send_command(station_id: int, payload: dict):
    return True


def test_legacy_public_token_is_read_only_for_spectator_control(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "public-read-token")
    monkeypatch.setenv("CLIENT_TOKENS", "")
    monkeypatch.setattr(spectator.manager, "send_command", _fake_send_command)

    station = _make_station()
    res = client_no_auth.post(
        f"/spectator/{station.id}/start",
        headers={"X-Client-Token": "public-read-token"},
    )

    assert res.status_code == 403


def test_scoped_client_token_can_control_spectator(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "")
    monkeypatch.setenv("CLIENT_TOKENS", "tv-control-token:tv:control")
    monkeypatch.setattr(spectator.manager, "send_command", _fake_send_command)

    station = _make_station()
    res = client_no_auth.post(
        f"/spectator/{station.id}/start",
        headers={"X-Client-Token": "tv-control-token"},
    )

    assert res.status_code == 200
    assert res.json()["status"] == "command_sent"
