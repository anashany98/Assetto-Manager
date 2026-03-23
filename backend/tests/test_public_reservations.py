from datetime import datetime, timedelta, timezone

from app import models
from app.database import SessionLocal


def _make_table(db, label: str = "T1", seats: int = 4) -> models.RestaurantTable:
    table = models.RestaurantTable(
        label=label,
        seats=seats,
        is_active=True,
        x=0.0,
        y=0.0,
        width=50.0,
        height=50.0,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


def test_public_booking_create_works_without_client_token(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "legacy-read-token")
    monkeypatch.setenv("CLIENT_TOKENS", "legacy-read-token:public:read")

    target_date = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    response = client_no_auth.post(
        "/bookings/",
        json={
            "customer_name": "Public Booking",
            "customer_email": "public@example.com",
            "date": target_date,
            "time_slot": "12:00-13:00",
            "duration_minutes": 60,
            "num_players": 1,
        },
    )

    assert response.status_code == 200, response.json()
    assert response.json()["status"] == "pending"


def test_public_table_booking_and_manage_flow_work_without_client_token(client_no_auth, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_TOKEN", "legacy-read-token")
    monkeypatch.setenv("CLIENT_TOKENS", "legacy-read-token:public:read")

    db = SessionLocal()
    try:
        table = _make_table(db, label="PUBLIC-T1")
        target_date = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()

        fit_response = client_no_auth.post(
            "/tables/find-best-fit",
            json={"pax": 2, "date": target_date, "time": "19:00"},
        )
        assert fit_response.status_code == 200, fit_response.json()
        assert table.id in fit_response.json()["table_ids"]

        start_time = datetime.now(timezone.utc) + timedelta(days=2, hours=1)
        end_time = start_time + timedelta(minutes=90)
        create_response = client_no_auth.post(
            "/tables/bookings",
            json={
                "table_ids": [table.id],
                "customer_name": "Public Table",
                "customer_email": "table@example.com",
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "pax": 2,
            },
        )
        assert create_response.status_code == 200, create_response.json()
        booking_id = create_response.json()["id"]

        booking = db.query(models.TableBooking).filter(models.TableBooking.id == booking_id).first()
        assert booking is not None
        assert booking.manage_token

        get_response = client_no_auth.get(f"/tables/bookings/manage/{booking.manage_token}")
        assert get_response.status_code == 200, get_response.json()
        assert get_response.json()["id"] == booking_id

        update_response = client_no_auth.put(
            f"/tables/bookings/manage/{booking.manage_token}",
            json={"status": "cancelled"},
        )
        assert update_response.status_code == 200, update_response.json()
        assert update_response.json()["status"] == "cancelled"
    finally:
        db.close()
