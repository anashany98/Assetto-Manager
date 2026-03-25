"""
Test suite for drivers API endpoints
"""
import pytest


class TestDriversAPI:
    """Tests for /drivers endpoints"""

    def test_list_drivers_kiosk_empty(self, client):
        """Test listing drivers for kiosk autocomplete when none exist"""
        response = client.get("/drivers/list-for-kiosk")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_list_drivers_kiosk_with_search(self, client):
        """Test listing drivers for kiosk with search filter"""
        response = client.get("/drivers/list-for-kiosk?search=NonExistent")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_list_drivers_kiosk_limit(self, client):
        """Test that limit parameter works"""
        response = client.get("/drivers/list-for-kiosk?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    def test_list_drivers_kiosk_no_results(self, client):
        """Test listing drivers with non-matching search"""
        response = client.get("/drivers/list-for-kiosk?search=NonExistentDriver12345")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
