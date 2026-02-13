import uuid
from datetime import datetime, timedelta, timezone

from app import database, models


def test_telemetry_sessions_offset_pagination(client):
    token = f"__pagination_{uuid.uuid4().hex}"

    db = database.SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        for i in range(5):
            db.add(
                models.SessionResult(
                    station_id=1,
                    driver_name=f"{token}_{i}",
                    car_model="car_test",
                    track_name="track_test",
                    best_lap=100000 + i,
                    date=now - timedelta(minutes=i),
                    session_type="practice",
                )
            )
        db.commit()
    finally:
        db.close()

    r1 = client.get("/telemetry/sessions", params={"limit": 2, "offset": 0, "driver_name": token})
    assert r1.status_code == 200
    page1 = r1.json()
    assert isinstance(page1, list)
    assert len(page1) == 2

    r2 = client.get("/telemetry/sessions", params={"limit": 2, "offset": 2, "driver_name": token})
    assert r2.status_code == 200
    page2 = r2.json()
    assert isinstance(page2, list)
    assert len(page2) == 2

    ids1 = {s["id"] for s in page1}
    ids2 = {s["id"] for s in page2}
    assert ids1.isdisjoint(ids2)


def test_telemetry_sessions_cursor_pagination(client):
    token = f"__cursor_{uuid.uuid4().hex}"

    db = database.SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        for i in range(5):
            db.add(
                models.SessionResult(
                    station_id=1,
                    driver_name=f"{token}_{i}",
                    car_model="car_test",
                    track_name="track_test",
                    best_lap=90000 + i,
                    date=now - timedelta(minutes=i),
                    session_type="practice",
                )
            )
        db.commit()
    finally:
        db.close()

    r1 = client.get("/telemetry/sessions", params={"limit": 2, "driver_name": token})
    assert r1.status_code == 200
    page1 = r1.json()
    assert isinstance(page1, list)
    assert len(page1) == 2

    last = page1[-1]
    cursor_date = last["date"]
    cursor_id = last["id"]

    r2 = client.get(
        "/telemetry/sessions",
        params={"limit": 2, "driver_name": token, "cursor_date": cursor_date, "cursor_id": cursor_id},
    )
    assert r2.status_code == 200
    page2 = r2.json()
    assert isinstance(page2, list)
    assert len(page2) == 2

    ids1 = {s["id"] for s in page1}
    ids2 = {s["id"] for s in page2}
    assert ids1.isdisjoint(ids2)
