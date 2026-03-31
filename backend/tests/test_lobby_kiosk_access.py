import uuid

from app import models
from app.database import SessionLocal
from app.routers import lobby as lobby_router


def _make_station(db, label: str, kiosk_code: str) -> models.Station:
    suffix = uuid.uuid4().hex[:8]
    station = models.Station(
        name=f"{label}-{suffix}",
        ip_address=f"10.10.{int(suffix[:2], 16) % 200}.{int(suffix[2:4], 16) % 200 + 10}",
        mac_address=f"AA:CC:EE:{suffix[:2]}:{suffix[2:4]}:{suffix[4:6]}",
        hostname=f"{label}-{suffix}",
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


def _headers(kiosk_code: str | None = None) -> dict[str, str]:
    out: dict[str, str] = {}
    if kiosk_code is not None:
        out["X-Kiosk-Code"] = kiosk_code
    return out


def test_public_create_lobby_requires_matching_kiosk_code(client_no_auth, monkeypatch):
    monkeypatch.delenv("CLIENT_TOKENS", raising=False)
    monkeypatch.delenv("CLIENT_TOKENS_JSON", raising=False)

    db = SessionLocal()
    try:
        host = _make_station(db, "host", "LBY111")
        payload = {
            "name": "Kiosk Access Test",
            "track": "orion_speedway",
            "car": "neon_motors_phantom_x",
            "station_id": host.id,
            "duration": 12,
            "max_players": 8,
            "laps": 5,
        }

        missing_code = client_no_auth.post("/lobby/create", json=payload, headers={})
        assert missing_code.status_code == 403

        wrong_code = client_no_auth.post("/lobby/create", json=payload, headers=_headers("ZZZZZZ"))
        assert wrong_code.status_code == 403
        assert "Invalid kiosk code" in (wrong_code.json().get("detail") or "")

        ok = client_no_auth.post("/lobby/create", json=payload, headers=_headers(host.kiosk_code))
        assert ok.status_code == 200
        assert ok.json().get("host_station_id") == host.id
    finally:
        db.close()


def test_public_join_lobby_requires_matching_joiner_kiosk_code(client_no_auth, monkeypatch):
    monkeypatch.delenv("CLIENT_TOKENS", raising=False)
    monkeypatch.delenv("CLIENT_TOKENS_JSON", raising=False)

    db = SessionLocal()
    try:
        host = _make_station(db, "host", "HOST11")
        joiner = _make_station(db, "joiner", "JOIN22")

        create_payload = {
            "name": "Join Access Test",
            "track": "orion_speedway",
            "car": "neon_motors_phantom_x",
            "station_id": host.id,
            "duration": 10,
            "max_players": 6,
            "laps": 4,
        }

        create = client_no_auth.post(
            "/lobby/create",
            json=create_payload,
            headers=_headers(host.kiosk_code),
        )
        assert create.status_code == 200
        lobby_id = create.json()["id"]

        wrong = client_no_auth.post(
            f"/lobby/{lobby_id}/join",
            json={"station_id": joiner.id},
            headers=_headers(host.kiosk_code),
        )
        assert wrong.status_code == 403
        assert "Invalid kiosk code" in (wrong.json().get("detail") or "")

        ok = client_no_auth.post(
            f"/lobby/{lobby_id}/join",
            json={"station_id": joiner.id},
            headers=_headers(joiner.kiosk_code),
        )
        assert ok.status_code == 200
        assert ok.json().get("status") == "joined"
    finally:
        db.close()


def test_public_start_lobby_requires_host_kiosk_code(client_no_auth, monkeypatch):
    monkeypatch.delenv("CLIENT_TOKENS", raising=False)
    monkeypatch.delenv("CLIENT_TOKENS_JSON", raising=False)

    db = SessionLocal()
    try:
        host = _make_station(db, "host", "START1")
        joiner = _make_station(db, "joiner", "START2")

        create_payload = {
            "name": "Start Access Test",
            "track": "orion_speedway",
            "car": "neon_motors_phantom_x",
            "station_id": host.id,
            "duration": 10,
            "max_players": 6,
            "laps": 4,
        }

        create = client_no_auth.post(
            "/lobby/create",
            json=create_payload,
            headers=_headers(host.kiosk_code),
        )
        assert create.status_code == 200
        lobby_id = create.json()["id"]

        join = client_no_auth.post(
            f"/lobby/{lobby_id}/join",
            json={"station_id": joiner.id},
            headers=_headers(joiner.kiosk_code),
        )
        assert join.status_code == 200

        host_ready = client_no_auth.post(
            f"/lobby/{lobby_id}/ready",
            params={"station_id": host.id, "is_ready": True},
            headers=_headers(host.kiosk_code),
        )
        assert host_ready.status_code == 200

        joiner_ready = client_no_auth.post(
            f"/lobby/{lobby_id}/ready",
            params={"station_id": joiner.id, "is_ready": True},
            headers=_headers(joiner.kiosk_code),
        )
        assert joiner_ready.status_code == 200

        wrong_start = client_no_auth.post(
            f"/lobby/{lobby_id}/start",
            params={"requesting_station_id": host.id},
            headers=_headers(joiner.kiosk_code),
        )
        assert wrong_start.status_code == 403
        assert "Invalid kiosk code" in (wrong_start.json().get("detail") or "")

        async def _mock_send_command(*args, **kwargs):
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        ok_start = client_no_auth.post(
            f"/lobby/{lobby_id}/start",
            params={"requesting_station_id": host.id},
            headers=_headers(host.kiosk_code),
        )
        assert ok_start.status_code == 200
        assert ok_start.json().get("status") == "started"
    finally:
        db.close()
