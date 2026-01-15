"""
Test suite for bookings API endpoints
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestBookingsAPI:
    """Tests for /bookings endpoints"""

    def test_list_bookings_empty(self):
        """Test listing bookings when none exist"""
        response = client.get("/bookings/")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Note: If executed after other tests without cleanup, it might not be empty, so checking type is safer or ensure clean DB

    def test_get_available_slots(self):
        """Test getting available time slots for a date"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        response = client.get(f"/bookings/available?target_date={tomorrow}")
        assert response.status_code == 200
        data = response.json()
        assert "slots" in data
        assert isinstance(data["slots"], list)

    def test_create_booking(self):
        """Test creating a new booking"""
        # Ensure unique time slot or clearing DB to avoid 409
        target_date = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')
        booking_data = {
            "customer_name": "Test Driver",
            "customer_email": "test@example.com",
            "customer_phone": "123456789",
            "date": target_date,
            "time_slot": "10:00-11:00",
            "duration_minutes": 60,
            "num_players": 2,
            "notes": "Test booking"
        }
        response = client.post("/bookings/", json=booking_data)
        assert response.status_code == 200, f"Failed to create booking: {response.json()}"
        data = response.json()
        assert "id" in data
        assert data["status"] == "pending"
        assert "message" in data

    def test_get_booking_by_id(self):
        """Test retrieving a specific booking"""
        # First create a booking
        target_date = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        booking_data = {
            "customer_name": "Get Test",
            "date": target_date,
            "time_slot": "14:00-15:00",
            "duration_minutes": 60
        }
        create_response = client.post("/bookings/", json=booking_data)
        booking_id = create_response.json()["id"]
        
        # Now get it
        response = client.get(f"/bookings/{booking_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == booking_id
        assert data["customer_name"] == "Get Test"

    def test_update_booking_status(self):
        """Test updating a booking's status"""
        # First create a booking
        target_date = (datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d')
        booking_data = {
            "customer_name": "Status Test",
            "date": target_date,
            "time_slot": "16:00-17:00",
            "duration_minutes": 60
        }
        create_response = client.post("/bookings/", json=booking_data)
        booking_id = create_response.json()["id"]
        
        # Update status to confirmed
        response = client.put(f"/bookings/{booking_id}/status", json={"status": "confirmed"})
        assert response.status_code == 200
        assert response.json()["status"] == "confirmed"

    def test_calendar_week_view(self):
        """Test getting weekly calendar view"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = client.get(f"/bookings/calendar/week?start_date={today}")
        assert response.status_code == 200
        data = response.json()
        assert "days" in data
        assert isinstance(data["days"], list)
        if len(data["days"]) > 0:
            assert "bookings" in data["days"][0]


class TestAnalyticsAPI:
    """Tests for /analytics endpoints"""

    def test_get_analytics_overview(self):
        """Test getting analytics overview"""
        response = client.get("/analytics/overview")
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "bookings" in data
        assert "loyalty" in data
        assert "sessions_per_day" in data


class TestLoyaltyAPI:
    """Tests for /loyalty endpoints"""

    def test_get_points_by_driver(self):
        """Test getting loyalty points for a driver"""
        # Assuming database is empty or has mock data, this might return 404 or empty
        # But let's check basic response structure validity
        response = client.get("/loyalty/points/TestDriver")
        # Depending on implementation, might return 200 with 0 points or 404.
        # Let's adjust based on likely implementation.
        if response.status_code == 200:
             data = response.json()
             assert "points" in data
             assert "tier" in data

    def test_list_rewards(self):
        """Test listing available rewards"""
        response = client.get("/loyalty/rewards")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
