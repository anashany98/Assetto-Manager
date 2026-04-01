"""
Tests for analytics endpoints
"""
import pytest
from datetime import datetime, timedelta, timezone
from app import models
from app.database import SessionLocal


def _create_paid_session(db, price=10.0, days_ago=0):
    """Helper to create a paid session for testing."""
    station = db.query(models.Station).first()
    if not station:
        station = models.Station(name="Test Station", is_active=True)
        db.add(station)
        db.commit()
        db.refresh(station)

    start_time = datetime.now(timezone.utc) - timedelta(days=days_ago)
    session = models.Session(
        station_id=station.id,
        driver_name="Test Driver",
        start_time=start_time,
        duration_minutes=30,
        price=price,
        is_paid=True,
        payment_method="cash",
        status="completed"
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


class TestAnalyticsOverview:
    def test_get_analytics_overview_default_range(self, client):
        res = client.get("/analytics/overview")
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "bookings" in data
        assert "loyalty" in data

    def test_get_analytics_overview_custom_range(self, client):
        res = client.get("/analytics/overview?range_days=7")
        assert res.status_code == 200

    def test_get_analytics_overview_invalid_range_too_large(self, client):
        res = client.get("/analytics/overview?range_days=400")
        assert res.status_code == 422

    def test_get_analytics_overview_invalid_range_zero(self, client):
        res = client.get("/analytics/overview?range_days=0")
        assert res.status_code == 422

    def test_get_analytics_overview_invalid_range_negative(self, client):
        res = client.get("/analytics/overview?range_days=-5")
        assert res.status_code == 422

    def test_analytics_overview_with_sessions(self, client):
        db = SessionLocal()
        try:
            _create_paid_session(db, price=15.0, days_ago=0)
            _create_paid_session(db, price=20.0, days_ago=1)
        finally:
            db.close()

        res = client.get("/analytics/overview?range_days=7")
        assert res.status_code == 200
        data = res.json()
        assert data["summary"]["sessions_today"] >= 1
        assert data["summary"]["sessions_this_week"] >= 2
        assert isinstance(data["most_used_station_name"], (str, type(None)))


class TestAnalyticsRevenue:
    def test_revenue_default_range(self, client):
        res = client.get("/analytics/revenue")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_revenue_with_sessions(self, client):
        db = SessionLocal()
        try:
            _create_paid_session(db, price=25.0, days_ago=0)
        finally:
            db.close()

        res = client.get("/analytics/revenue?range_days=7")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 7
        today_revenue = next((d["revenue"] for d in data if d["date"] == datetime.now(timezone.utc).strftime("%Y-%m-%d")), 0)
        assert today_revenue >= 25.0

    def test_revenue_invalid_range(self, client):
        res = client.get("/analytics/revenue?range_days=999")
        assert res.status_code == 422


class TestAnalyticsUtilization:
    def test_utilization_default_range(self, client):
        res = client.get("/analytics/utilization")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 24
        assert all("hour" in d and "count" in d for d in data)

    def test_utilization_invalid_range(self, client):
        res = client.get("/analytics/utilization?range_days=-1")
        assert res.status_code == 422


class TestAnalyticsKPI:
    def test_kpi_default_range(self, client):
        res = client.get("/analytics/kpi")
        assert res.status_code == 200
        data = res.json()
        assert "total_revenue" in data
        assert "avg_ticket" in data
        assert "total_sessions" in data
        assert "revenue_per_session" in data

    def test_kpi_with_sessions(self, client):
        db = SessionLocal()
        try:
            _create_paid_session(db, price=30.0, days_ago=0)
            _create_paid_session(db, price=50.0, days_ago=0)
        finally:
            db.close()

        res = client.get("/analytics/kpi?range_days=7")
        assert res.status_code == 200
        data = res.json()
        assert data["total_sessions"] >= 2
        assert data["total_revenue"] >= 80.0
        assert data["avg_ticket"] > 0

    def test_kpi_invalid_range(self, client):
        res = client.get("/analytics/kpi?range_days=0")
        assert res.status_code == 422


class TestAnalyticsPaymentMethods:
    def test_payment_methods_default_range(self, client):
        res = client.get("/analytics/payment-methods")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_payment_methods_with_sessions(self, client):
        db = SessionLocal()
        try:
            _create_paid_session(db, price=10.0, days_ago=0)
            _create_paid_session(db, price=20.0, days_ago=0)
        finally:
            db.close()

        res = client.get("/analytics/payment-methods?range_days=7")
        assert res.status_code == 200
        data = res.json()
        cash_methods = [m for m in data if m["method"] == "cash"]
        assert len(cash_methods) == 1
        assert cash_methods[0]["revenue"] >= 30.0
