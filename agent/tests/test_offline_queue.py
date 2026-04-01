"""
Tests for the agent's offline queue module.
"""
import json
import time
import pytest
from pathlib import Path
import sys

# Add agent directory to path
agent_dir = Path(__file__).resolve().parent.parent
if str(agent_dir) not in sys.path:
    sys.path.insert(0, str(agent_dir))

# Mock the config module before importing offline_queue
class MockLogger:
    def info(self, msg, *args): pass
    def error(self, msg, *args): pass
    def warning(self, msg, *args): pass

mock_config = type(sys)('config')
mock_config.logger = MockLogger()
sys.modules['config'] = mock_config

import offline_queue


@pytest.fixture(autouse=True)
def clean_queue(tmp_path):
    """Use a temporary directory for each test."""
    queue_dir = tmp_path / "offline_data"
    queue_dir.mkdir(exist_ok=True)
    
    offline_queue.QUEUE_DIR = queue_dir
    offline_queue.SESSIONS_FILE = queue_dir / "pending_sessions.json"
    offline_queue.RESULTS_FILE = queue_dir / "pending_results.json"
    offline_queue.HEALTH_FILE = queue_dir / "offline_health.json"

    yield


def make_session_data(**overrides):
    data = {
        "station_id": 1,
        "driver_name": "TestDriver",
        "track_name": "monza",
        "car_model": "ferrari_sf24",
        "duration_minutes": 30,
        "price": 15.0,
        "payment_method": "cash",
    }
    data.update(overrides)
    return data


def make_result_data(**overrides):
    data = {
        "station_id": 1,
        "driver_name": "TestDriver",
        "track_name": "monza",
        "car_model": "ferrari_sf24",
        "best_lap": 90000,
        "laps": [{"lap_time": 90000, "sectors": [30000, 30000, 30000]}],
    }
    data.update(overrides)
    return data


class TestValidation:
    def test_valid_session(self):
        assert offline_queue._validate_session(make_session_data()) is True

    def test_invalid_session_missing_fields(self):
        data = make_session_data()
        del data["driver_name"]
        assert offline_queue._validate_session(data) is False

    def test_valid_result(self):
        assert offline_queue._validate_result(make_result_data()) is True

    def test_invalid_result_missing_fields(self):
        data = make_result_data()
        del data["track_name"]
        assert offline_queue._validate_result(data) is False


class TestOfflineSessions:
    def test_save_offline_session(self):
        offline_id = offline_queue.save_offline_session(make_session_data())
        assert offline_id is not None
        assert offline_id.startswith("offline_")

    def test_save_invalid_session_returns_none(self):
        result = offline_queue.save_offline_session({"invalid": "data"})
        assert result is None

    def test_get_pending_sessions(self):
        offline_queue.save_offline_session(make_session_data())
        offline_queue.save_offline_session(make_session_data(driver_name="Driver2"))
        pending = offline_queue.get_pending_sessions()
        assert len(pending) == 2

    def test_mark_session_synced(self):
        offline_id = offline_queue.save_offline_session(make_session_data())
        assert offline_queue.mark_session_synced(offline_id) is True
        pending = offline_queue.get_pending_sessions()
        assert len(pending) == 0

    def test_mark_nonexistent_session(self):
        assert offline_queue.mark_session_synced("nonexistent") is False

    def test_remove_synced_sessions(self):
        offline_queue.save_offline_session(make_session_data())
        offline_queue.save_offline_session(make_session_data(driver_name="Driver2"))
        pending = offline_queue.get_pending_sessions()
        offline_queue.mark_session_synced(pending[0]["offline_session_id"])
        removed = offline_queue.remove_synced_sessions()
        assert removed == 1
        assert len(offline_queue.get_pending_sessions()) == 1


class TestOfflineResults:
    def test_save_offline_result(self):
        offline_id = offline_queue.save_offline_result(make_result_data())
        assert offline_id is not None
        assert offline_id.startswith("result_")

    def test_save_invalid_result_returns_none(self):
        result = offline_queue.save_offline_result({"invalid": "data"})
        assert result is None

    def test_get_pending_results(self):
        offline_queue.save_offline_result(make_result_data())
        offline_queue.save_offline_result(make_result_data(track_name="spa"))
        pending = offline_queue.get_pending_results()
        assert len(pending) == 2

    def test_mark_result_synced(self):
        offline_id = offline_queue.save_offline_result(make_result_data())
        assert offline_queue.mark_result_synced(offline_id) is True
        pending = offline_queue.get_pending_results()
        assert len(pending) == 0

    def test_remove_synced_results(self):
        offline_queue.save_offline_result(make_result_data())
        offline_queue.save_offline_result(make_result_data(track_name="spa"))
        pending = offline_queue.get_pending_results()
        offline_queue.mark_result_synced(pending[0]["offline_result_id"])
        removed = offline_queue.remove_synced_results()
        assert removed == 1
        assert len(offline_queue.get_pending_results()) == 1


class TestDataIntegrity:
    def test_verify_session_integrity(self):
        offline_id = offline_queue.save_offline_session(make_session_data())
        assert offline_queue.verify_session_integrity(offline_id) is True

    def test_verify_result_integrity(self):
        offline_id = offline_queue.save_offline_result(make_result_data())
        assert offline_queue.verify_result_integrity(offline_id) is True

    def test_verify_nonexistent_returns_false(self):
        assert offline_queue.verify_session_integrity("nonexistent") is False
        assert offline_queue.verify_result_integrity("nonexistent") is False


class TestSyncSummary:
    def test_empty_summary(self):
        summary = offline_queue.get_sync_summary()
        assert summary["total_items"] == 0
        assert summary["sessions"]["count"] == 0
        assert summary["results"]["count"] == 0

    def test_summary_with_data(self):
        offline_queue.save_offline_session(make_session_data())
        offline_queue.save_offline_session(make_session_data(driver_name="Driver2"))
        offline_queue.save_offline_result(make_result_data())

        summary = offline_queue.get_sync_summary()
        assert summary["total_items"] == 3
        assert summary["sessions"]["count"] == 2
        assert summary["results"]["count"] == 1
        assert "TestDriver" in summary["sessions"]["drivers"]
        assert "Driver2" in summary["sessions"]["drivers"]
        assert "monza" in summary["results"]["tracks"]


class TestOfflineHealth:
    def test_health_empty(self):
        health = offline_queue.get_offline_health()
        assert health["pending_sessions"] == 0
        assert health["pending_results"] == 0
        assert health["total_pending"] == 0
        assert health["queue_status"] == "healthy"

    def test_health_with_data(self):
        offline_queue.save_offline_session(make_session_data())
        offline_queue.save_offline_result(make_result_data())
        offline_queue.record_offline_event("test_event", "test details")

        health = offline_queue.get_offline_health()
        assert health["pending_sessions"] == 1
        assert health["pending_results"] == 1
        assert health["total_pending"] == 2
        # save_offline_session and save_offline_result also record events
        assert len(health["events"]) >= 3
        event_types = [e["type"] for e in health["events"]]
        assert "test_event" in event_types

    def test_health_warning_status(self):
        for i in range(offline_queue.MAX_QUEUE_SIZE + 10):
            offline_queue.save_offline_session(make_session_data(driver_name=f"Driver{i}"))

        health = offline_queue.get_offline_health()
        assert health["queue_status"] == "warning"
        assert health["pending_sessions"] == offline_queue.MAX_QUEUE_SIZE


class TestQueueLimits:
    def test_evict_old_items(self):
        for i in range(5):
            offline_queue.save_offline_session(make_session_data(driver_name=f"Driver{i}"))

        sessions_data = json.loads(offline_queue.SESSIONS_FILE.read_text())
        for s in sessions_data:
            s["created_at"] = time.time() - (offline_queue.MAX_AGE_SECONDS + 100)
        offline_queue.SESSIONS_FILE.write_text(json.dumps(sessions_data))

        # Force eviction by saving another item (triggers _evict_old_items)
        offline_queue.save_offline_session(make_session_data(driver_name="NewDriver"))

        pending = offline_queue.get_pending_sessions()
        # Old items should be evicted, only new one remains
        assert len(pending) == 1
        assert pending[0]["driver_name"] == "NewDriver"

    def test_queue_size_limit(self):
        for i in range(offline_queue.MAX_QUEUE_SIZE + 50):
            offline_queue.save_offline_session(make_session_data(driver_name=f"Driver{i}"))

        pending = offline_queue.get_pending_sessions()
        assert len(pending) == offline_queue.MAX_QUEUE_SIZE
