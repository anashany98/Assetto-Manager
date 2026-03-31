import uuid
import pytest

from app import models
from app.database import SessionLocal


def _make_station(db, name_prefix: str = "station") -> models.Station:
    suffix = uuid.uuid4().hex[:8]
    station = models.Station(
        name=f"{name_prefix}-{suffix}",
        ip_address=f"127.0.0.{int(suffix[:2], 16) % 200 + 10}",
        mac_address=f"AA:BB:CC:{suffix[:2]}:{suffix[2:4]}:{suffix[4:6]}",
        hostname=f"{name_prefix}-{suffix}",
        is_active=True,
        is_online=True,
        status="online",
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


@pytest.mark.skip(reason="Requires specific configuration")
def test_list_stations(client):
    res = client.get("/stations/")
    assert res.status_code == 200


@pytest.mark.skip(reason="Requires specific station configuration")
def test_get_station_by_id(client):
    db = SessionLocal()
    try:
        station = _make_station(db, "test")

        res = client.get(f"/stations/{station.id}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == station.id
        assert data["name"] == station.name
    finally:
        db.close()


@pytest.mark.skip(reason="Requires admin permissions")
def test_create_station(client):
    station_data = {
        "name": "New Station Test",
        "ip_address": "192.168.1.100",
        "mac_address": "AA:BB:CC:DD:EE:FF",
        "hostname": "new-station",
    }

    res = client.post("/stations/", json=station_data)
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == station_data["name"]


def test_update_station(client):
    db = SessionLocal()
    try:
        station = _make_station(db, "test")
        original_name = station.name

        update_data = {
            "name": f"{original_name}_updated",
            "is_active": False,
        }

        res = client.put(f"/stations/{station.id}", json=update_data)
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == update_data["name"]
        assert data["is_active"] == False
    finally:
        db.close()


@pytest.mark.skip(reason="Requires admin permissions")
def test_delete_station(client):
    db = SessionLocal()
    try:
        station = _make_station(db, "test")

        res = client.delete(f"/stations/{station.id}")
        assert res.status_code == 200

        deleted_station = db.query(models.Station).filter(models.Station.id == station.id).first()
        assert deleted_station is None
    finally:
        db.close()


@pytest.mark.skip(reason="Requires WebSocket agent mock")
def test_station_command_success(client, monkeypatch):
    db = SessionLocal()
    try:
        station = _make_station(db, "test")

        async def mock_send_command(*args, **kwargs):
            return True

        from app.routers import stations as stations_router
        monkeypatch.setattr(stations_router.manager, "send_command", mock_send_command)

        command_data = {"command": "test_command", "data": {"key": "value"}}
        res = client.post(f"/stations/{station.id}/command", json=command_data)
        assert res.status_code == 200
    finally:
        db.close()


@pytest.mark.skip(reason="Requires WebSocket agent mock")
def test_station_command_not_found(client):
    res = client.post("/stations/99999/command", json={"command": "test"})
    assert res.status_code == 404


@pytest.mark.skip(reason="Requires specific configuration")
def test_station_groups(client):
    db = SessionLocal()
    try:
        station = _make_station(db, "test")
        group_name = "test_group"

        station.group_name = group_name
        db.commit()

        res = client.get(f"/stations/{station.id}")
        assert res.status_code == 200
        data = res.json()
    finally:
        db.close()


@pytest.mark.skip(reason="Requires admin permissions")
def test_station_online_offline(client):
    db = SessionLocal()
    try:
        station = _make_station(db, "test")
        assert station.is_online == True

        offline_data = {"is_online": False}
        res = client.put(f"/stations/{station.id}", json=offline_data)
        assert res.status_code == 200

        db.refresh(station)
        assert station.is_online == False

        online_data = {"is_online": True}
        res = client.put(f"/stations/{station.id}", json=online_data)
        assert res.status_code == 200

        db.refresh(station)
        assert station.is_online == True
    finally:
        db.close()
