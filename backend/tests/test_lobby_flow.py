import uuid

from app import models
from app.database import SessionLocal
from app.routers import lobby as lobby_router


def _make_station(db, label: str) -> models.Station:
    suffix = uuid.uuid4().hex[:8]
    station = models.Station(
        name=f"{label}-{suffix}",
        ip_address=f"127.0.0.{int(suffix[:2], 16) % 200 + 10}",
        mac_address=f"AA:BB:CC:{suffix[:2]}:{suffix[2:4]}:{suffix[4:6]}",
        hostname=f"{label}-{suffix}",
        is_active=True,
        is_online=True,
        status="online",
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def _create_lobby(client, host_station_id: int, max_players: int = 8):
    payload = {
        "name": "Test Lobby",
        "track": "orion_speedway",
        "car": "neon_motors_phantom_x",
        "station_id": host_station_id,
        "duration": 10,
        "max_players": max_players,
        "laps": 5,
    }
    return client.post("/lobby/create", json=payload)


def test_lobby_start_requires_two_ready_players(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")

        create_res = _create_lobby(client, host.id, max_players=4)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        join_res = client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner.id})
        assert join_res.status_code == 200

        host_ready = client.post(f"/lobby/{lobby_id}/ready", params={"station_id": host.id, "is_ready": True})
        assert host_ready.status_code == 200

        start_fail = client.post(f"/lobby/{lobby_id}/start", params={"requesting_station_id": host.id})
        assert start_fail.status_code == 400
        assert "2 ready players" in (start_fail.json().get("detail") or "")

        joiner_ready = client.post(f"/lobby/{lobby_id}/ready", params={"station_id": joiner.id, "is_ready": True})
        assert joiner_ready.status_code == 200

        async def _mock_send_command(*args, **kwargs):
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        start_ok = client.post(f"/lobby/{lobby_id}/start", params={"requesting_station_id": host.id})
        assert start_ok.status_code == 200
        assert start_ok.json().get("status") == "started"
    finally:
        db.close()


def test_lobby_rejoin_running_keeps_existing_slot_even_if_full(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")

        create_res = _create_lobby(client, host.id, max_players=2)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        join_res = client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner.id})
        assert join_res.status_code == 200
        assert join_res.json().get("slot") == 1

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        lobby_obj.status = "running"
        db.commit()

        async def _mock_send_command(*args, **kwargs):
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        rejoin = client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner.id})
        assert rejoin.status_code == 200
        data = rejoin.json()
        assert data.get("status") == "joined"
        assert data.get("slot") == 1
    finally:
        db.close()


def test_lobby_start_rolls_back_started_at_when_host_fails(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")

        create_res = _create_lobby(client, host.id, max_players=4)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        assert client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner.id}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": host.id, "is_ready": True}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": joiner.id, "is_ready": True}).status_code == 200

        async def _mock_send_command(*args, **kwargs):
            return False

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        start_res = client.post(f"/lobby/{lobby_id}/start", params={"requesting_station_id": host.id})
        assert start_res.status_code == 500

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        assert lobby_obj.status == "waiting"
        assert lobby_obj.started_at is None
    finally:
        db.close()


def test_lobby_port_reservation_is_released_after_cancel(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        monkeypatch.setattr(lobby_router, "LOBBY_PORT_RANGE_START", 9600)
        monkeypatch.setattr(lobby_router, "LOBBY_PORT_RANGE_END", 9600)
        monkeypatch.setattr(lobby_router, "LOBBY_PORT_RANGE", 1)

        first_res = _create_lobby(client, host.id, max_players=4)
        assert first_res.status_code == 200
        first_lobby_id = first_res.json()["id"]
        assert first_res.json()["port"] == 9600

        cancel_res = client.delete(f"/lobby/{first_lobby_id}", params={"requesting_station_id": host.id})
        assert cancel_res.status_code == 200

        second_res = _create_lobby(client, host.id, max_players=4)
        assert second_res.status_code == 200
        assert second_res.json()["port"] == 9600
    finally:
        db.close()
