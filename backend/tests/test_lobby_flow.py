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


def _create_lobby(client, host_station_id: int, max_players: int = 8, driver_name: str | None = None):
    payload = {
        "name": "Test Lobby",
        "track": "orion_speedway",
        "car": "neon_motors_phantom_x",
        "station_id": host_station_id,
        "driver_name": driver_name,
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


def test_lobby_start_cancels_when_host_fails(client, monkeypatch):
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
        assert "Lobby cancelled" in (start_res.json().get("detail") or "")

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        assert lobby_obj.status == "cancelled"
        assert lobby_obj.started_at is None
    finally:
        db.close()


def test_lobby_start_cancels_when_host_client_join_fails(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")

        create_res = _create_lobby(client, host.id, max_players=4, driver_name="Host Driver")
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        assert client.post(
            f"/lobby/{lobby_id}/join",
            json={"station_id": joiner.id, "driver_name": "Joiner Driver"},
        ).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": host.id, "is_ready": True}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": joiner.id, "is_ready": True}).status_code == 200

        sent_commands = []

        async def _mock_send_command(station_id, payload):
            sent_commands.append((station_id, payload))
            if station_id == host.id and payload.get("command") == "join_lobby":
                return False
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        start_res = client.post(f"/lobby/{lobby_id}/start", params={"requesting_station_id": host.id})
        assert start_res.status_code == 500
        assert "Host AC client failed to join" in (start_res.json().get("detail") or "")
        assert "cancelled" in (start_res.json().get("detail") or "").lower()

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        assert lobby_obj.status == "cancelled"
        assert lobby_obj.started_at is None

        host_join_payloads = [payload for station_id, payload in sent_commands if station_id == host.id and payload.get("command") == "join_lobby"]
        assert len(host_join_payloads) == 1
    finally:
        db.close()


def test_lobby_start_cancels_when_any_ready_player_fails_to_join(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner_ok = _make_station(db, "joiner-ok")
        joiner_fail = _make_station(db, "joiner-fail")

        create_res = _create_lobby(client, host.id, max_players=6)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        assert client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner_ok.id}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner_fail.id}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": host.id, "is_ready": True}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": joiner_ok.id, "is_ready": True}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": joiner_fail.id, "is_ready": True}).status_code == 200

        sent_commands = []

        async def _mock_send_command(station_id, payload):
            sent_commands.append((station_id, payload))
            if station_id == joiner_fail.id and payload.get("command") == "join_lobby":
                return False
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        start_res = client.post(f"/lobby/{lobby_id}/start", params={"requesting_station_id": host.id})
        assert start_res.status_code == 500
        assert "Failed stations" in (start_res.json().get("detail") or "")

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        assert lobby_obj.status == "cancelled"
        assert lobby_obj.started_at is None

        cleanup_commands = [payload.get("command") for _, payload in sent_commands if payload.get("command") in {"stop_lobby", "stop_session"}]
        assert "stop_lobby" in cleanup_commands
        assert "stop_session" in cleanup_commands
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


def test_lobby_leave_removes_non_host_player(client):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")

        create_res = _create_lobby(client, host.id, max_players=4)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        join_res = client.post(
            f"/lobby/{lobby_id}/join",
            json={"station_id": joiner.id, "driver_name": "Joiner Driver"},
        )
        assert join_res.status_code == 200

        leave_res = client.post(f"/lobby/{lobby_id}/leave", json={"station_id": joiner.id})
        assert leave_res.status_code == 200
        assert leave_res.json()["status"] == "left"

        lobby_res = client.get(f"/lobby/{lobby_id}")
        assert lobby_res.status_code == 200
        player_ids = [player["station_id"] for player in lobby_res.json()["players"]]
        assert player_ids == [host.id]
    finally:
        db.close()


def test_cancel_running_lobby_stops_host_and_joiner(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")

        create_res = _create_lobby(client, host.id, max_players=4)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]
        assert client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner.id}).status_code == 200

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        lobby_obj.status = "running"
        db.commit()

        sent_commands = []

        async def _mock_send_command(station_id, payload):
            sent_commands.append((station_id, payload))
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        cancel_res = client.delete(f"/lobby/{lobby_id}", params={"requesting_station_id": host.id})
        assert cancel_res.status_code == 200

        commands_by_station = {(station_id, payload.get("command")) for station_id, payload in sent_commands}
        assert (host.id, "stop_lobby") in commands_by_station
        assert (joiner.id, "stop_session") in commands_by_station
    finally:
        db.close()


def test_lobby_timeout_is_enforced_server_side(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        monkeypatch.setattr(lobby_router, "LOBBY_WAIT_TIMEOUT_SECONDS", 30)

        create_res = _create_lobby(client, host.id, max_players=4)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        lobby_obj.created_at = lobby_obj.created_at.replace(year=lobby_obj.created_at.year - 1)
        db.commit()

        lobby_res = client.get(f"/lobby/{lobby_id}")
        assert lobby_res.status_code == 200
        assert lobby_res.json()["status"] == "cancelled"
    finally:
        db.close()


def test_lobby_timeout_in_starting_state_stops_host_and_joiner(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")
        monkeypatch.setattr(lobby_router, "LOBBY_WAIT_TIMEOUT_SECONDS", 30)
        monkeypatch.setattr(lobby_router, "LOBBY_CLEANUP_MIN_INTERVAL_SECONDS", 0)
        monkeypatch.setattr(lobby_router, "_last_orphan_cleanup_at", None)

        create_res = _create_lobby(client, host.id, max_players=4)
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]
        assert client.post(f"/lobby/{lobby_id}/join", json={"station_id": joiner.id}).status_code == 200

        lobby_obj = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        assert lobby_obj is not None
        lobby_obj.status = "starting"
        lobby_obj.created_at = lobby_obj.created_at.replace(year=lobby_obj.created_at.year - 1)
        db.commit()

        sent_commands = []

        async def _mock_send_command(station_id, payload):
            sent_commands.append((station_id, payload))
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        lobby_res = client.get(f"/lobby/{lobby_id}")
        assert lobby_res.status_code == 200
        assert lobby_res.json()["status"] == "cancelled"

        commands_by_station = {(station_id, payload.get("command")) for station_id, payload in sent_commands}
        assert (host.id, "stop_lobby") in commands_by_station
        assert (joiner.id, "stop_session") in commands_by_station
    finally:
        db.close()


def test_lobby_start_sends_join_payload_with_ac_path_and_driver_name(client, monkeypatch):
    db = SessionLocal()
    try:
        host = _make_station(db, "host")
        joiner = _make_station(db, "joiner")
        host.ac_path = r"D:\\Host\\AssettoCorsa"
        joiner.ac_path = r"D:\\Games\\AssettoCorsa"
        db.commit()
        db.refresh(host)
        db.refresh(joiner)

        create_res = _create_lobby(client, host.id, max_players=4, driver_name="Host Driver")
        assert create_res.status_code == 200
        lobby_id = create_res.json()["id"]

        join_res = client.post(
            f"/lobby/{lobby_id}/join",
            json={"station_id": joiner.id, "driver_name": "Joiner Driver"},
        )
        assert join_res.status_code == 200

        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": host.id, "is_ready": True}).status_code == 200
        assert client.post(f"/lobby/{lobby_id}/ready", params={"station_id": joiner.id, "is_ready": True}).status_code == 200

        sent_commands = []

        async def _mock_send_command(station_id, payload):
            sent_commands.append((station_id, payload))
            return True

        monkeypatch.setattr(lobby_router.manager, "send_command", _mock_send_command)

        start_res = client.post(f"/lobby/{lobby_id}/start", params={"requesting_station_id": host.id})
        assert start_res.status_code == 200

        create_payloads = [payload for station_id, payload in sent_commands if station_id == host.id and payload.get("command") == "create_lobby"]
        assert len(create_payloads) == 1
        assert create_payloads[0]["ac_path"] == host.ac_path

        host_join_payloads = [payload for station_id, payload in sent_commands if station_id == host.id and payload.get("command") == "join_lobby"]
        assert len(host_join_payloads) == 1
        assert host_join_payloads[0]["ac_path"] == host.ac_path
        assert host_join_payloads[0]["driver_name"] == "Host Driver"

        join_payloads = [payload for station_id, payload in sent_commands if station_id == joiner.id and payload.get("command") == "join_lobby"]
        assert len(join_payloads) == 1
        assert join_payloads[0]["ac_path"] == joiner.ac_path
        assert join_payloads[0]["driver_name"] == "Joiner Driver"
    finally:
        db.close()
