"""
Offline Queue - Store and sync data when server is unreachable.

Features:
- Automatic sync on reconnect
- Queue size limits with oldest-first eviction
- Data integrity validation
- Offline health monitoring
- Atomic file writes to prevent corruption
"""
import json
import uuid
import time
import logging
import hashlib
from pathlib import Path
from typing import List, Optional
from config import logger

QUEUE_DIR = Path(__file__).resolve().parent / "offline_data"
SESSIONS_FILE = QUEUE_DIR / "pending_sessions.json"
RESULTS_FILE = QUEUE_DIR / "pending_results.json"
HEALTH_FILE = QUEUE_DIR / "offline_health.json"

MAX_QUEUE_SIZE = 1000  # Max items per queue before eviction
MAX_AGE_SECONDS = 7 * 24 * 3600  # 7 days - auto-evict older items
MAX_FILE_SIZE_MB = 50  # Max file size in MB


def _ensure_dir():
    QUEUE_DIR.mkdir(exist_ok=True, parents=True)


def _validate_session(data: dict) -> bool:
    """Validate that session data has required fields."""
    required = {"driver_name", "track_name", "car_model", "station_id"}
    if not required.issubset(data.keys()):
        missing = required - data.keys()
        logger.warning(f"Invalid session data, missing fields: {missing}")
        return False
    if not isinstance(data.get("station_id"), (int, str)):
        logger.warning("Invalid session: station_id must be int or str")
        return False
    return True


def _validate_result(data: dict) -> bool:
    """Validate that result data has required fields."""
    required = {"driver_name", "track_name", "car_model"}
    if not required.issubset(data.keys()):
        missing = required - data.keys()
        logger.warning(f"Invalid result data, missing fields: {missing}")
        return False
    return True


def _compute_checksum(data: dict) -> str:
    """Compute a SHA-256 checksum of data for integrity verification."""
    serialized = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]


def _atomic_write(filepath: Path, data: list):
    """Write data atomically using a temp file to prevent corruption."""
    _ensure_dir()
    tmp_path = filepath.with_suffix(".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        tmp_path.replace(filepath)
    except Exception as e:
        logger.error(f"Failed to write {filepath}: {e}")
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def _load_json(filepath: Path) -> list:
    try:
        if filepath.exists():
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"Failed to load {filepath}: {e}")
        # If file is corrupted, start fresh
        if filepath.exists():
            filepath.unlink(missing_ok=True)
    return []


def _evict_old_items(items: list) -> list:
    """Remove items older than MAX_AGE_SECONDS and enforce MAX_QUEUE_SIZE."""
    cutoff = time.time() - MAX_AGE_SECONDS
    
    # Remove old items
    items = [item for item in items if item.get("created_at", 0) > cutoff]
    
    # Enforce size limit (remove oldest first)
    if len(items) > MAX_QUEUE_SIZE:
        items.sort(key=lambda x: x.get("created_at", 0))
        removed_count = len(items) - MAX_QUEUE_SIZE
        items = items[-MAX_QUEUE_SIZE:]
        logger.warning(f"Evicted {removed_count} oldest items (queue limit: {MAX_QUEUE_SIZE})")
    
    return items


# ---------------------------------------------------------------------------
# Offline Health Tracking
# ---------------------------------------------------------------------------
def record_offline_event(event_type: str, details: str = ""):
    """Record an offline event for monitoring."""
    _ensure_dir()
    health = _load_json(HEALTH_FILE)
    health.append({
        "type": event_type,
        "details": details,
        "timestamp": time.time(),
        "iso_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    })
    # Keep only last 100 events
    if len(health) > 100:
        health = health[-100:]
    _atomic_write(HEALTH_FILE, health)


def get_offline_health() -> dict:
    """Get offline health summary."""
    health = _load_json(HEALTH_FILE)
    pending_sessions = len(get_pending_sessions())
    pending_results = len(get_pending_results())
    
    return {
        "pending_sessions": pending_sessions,
        "pending_results": pending_results,
        "total_pending": pending_sessions + pending_results,
        "events": health[-20:],  # Last 20 events
        "last_sync": health[-1]["iso_time"] if health else None,
        "queue_status": "healthy" if (pending_sessions + pending_results) < MAX_QUEUE_SIZE else "warning"
    }


# ---------------------------------------------------------------------------
# Offline Sessions
# ---------------------------------------------------------------------------
def save_offline_session(session_data: dict) -> Optional[str]:
    """Save a session to offline queue. Returns offline_id or None if invalid."""
    if not _validate_session(session_data):
        logger.error("Rejected invalid offline session data")
        return None
    
    offline_id = f"offline_{uuid.uuid4().hex[:12]}_{int(time.time())}"
    session_data["offline_session_id"] = offline_id
    session_data["synced"] = False
    session_data["created_at"] = time.time()
    session_data["checksum"] = _compute_checksum(session_data)
    
    sessions = _load_json(SESSIONS_FILE)
    sessions.append(session_data)
    sessions = _evict_old_items(sessions)
    _atomic_write(SESSIONS_FILE, sessions)
    
    record_offline_event("session_queued", f"Driver: {session_data.get('driver_name', 'unknown')}")
    logger.info(f"Saved offline session {offline_id}: {session_data.get('driver_name', 'unknown')}")
    return offline_id


def get_pending_sessions() -> List[dict]:
    """Get all unsynced sessions."""
    sessions = _load_json(SESSIONS_FILE)
    return [s for s in sessions if not s.get("synced")]


def mark_session_synced(offline_session_id: str) -> bool:
    """Mark a session as synced. Returns True if found and marked."""
    sessions = _load_json(SESSIONS_FILE)
    changed = False
    for s in sessions:
        if s.get("offline_session_id") == offline_session_id:
            s["synced"] = True
            s["synced_at"] = time.time()
            changed = True
            break
    if changed:
        _atomic_write(SESSIONS_FILE, sessions)
    return changed


def remove_synced_sessions() -> int:
    """Remove synced sessions from the queue. Returns count removed."""
    sessions = _load_json(SESSIONS_FILE)
    pending = [s for s in sessions if not s.get("synced")]
    removed = len(sessions) - len(pending)
    if removed > 0:
        _atomic_write(SESSIONS_FILE, pending)
        logger.info(f"Removed {removed} synced offline sessions from queue")
    return removed


def verify_session_integrity(offline_session_id: str) -> bool:
    """Verify a session's checksum matches its data."""
    sessions = _load_json(SESSIONS_FILE)
    for s in sessions:
        if s.get("offline_session_id") == offline_session_id:
            stored_checksum = s.get("checksum")
            if not stored_checksum:
                return True  # No checksum to verify (old format)
            temp_data = {k: v for k, v in s.items() if k != "checksum"}
            current_checksum = _compute_checksum(temp_data)
            return current_checksum == stored_checksum
    return False


# ---------------------------------------------------------------------------
# Offline Telemetry Results
# ---------------------------------------------------------------------------
def save_offline_result(result_data: dict) -> Optional[str]:
    """Save a result to offline queue. Returns offline_id or None if invalid."""
    if not _validate_result(result_data):
        logger.error("Rejected invalid offline result data")
        return None
    
    offline_id = f"result_{uuid.uuid4().hex[:12]}_{int(time.time())}"
    result_data["offline_result_id"] = offline_id
    result_data["synced"] = False
    result_data["created_at"] = time.time()
    result_data["checksum"] = _compute_checksum(result_data)
    
    results = _load_json(RESULTS_FILE)
    results.append(result_data)
    results = _evict_old_items(results)
    _atomic_write(RESULTS_FILE, results)
    
    record_offline_event("result_queued", f"Track: {result_data.get('track_name', 'unknown')}")
    logger.info(f"Saved offline result {offline_id}: {result_data.get('track_name', 'unknown')}")
    return offline_id


def get_pending_results() -> List[dict]:
    """Get all unsynced results."""
    results = _load_json(RESULTS_FILE)
    return [r for r in results if not r.get("synced")]


def mark_result_synced(offline_result_id: str) -> bool:
    """Mark a result as synced. Returns True if found and marked."""
    results = _load_json(RESULTS_FILE)
    changed = False
    for r in results:
        if r.get("offline_result_id") == offline_result_id:
            r["synced"] = True
            r["synced_at"] = time.time()
            changed = True
            break
    if changed:
        _atomic_write(RESULTS_FILE, results)
    return changed


def remove_synced_results() -> int:
    """Remove synced results from the queue. Returns count removed."""
    results = _load_json(RESULTS_FILE)
    pending = [r for r in results if not r.get("synced")]
    removed = len(results) - len(pending)
    if removed > 0:
        _atomic_write(RESULTS_FILE, pending)
        logger.info(f"Removed {removed} synced offline results from queue")
    return removed


def verify_result_integrity(offline_result_id: str) -> bool:
    """Verify a result's checksum matches its data."""
    results = _load_json(RESULTS_FILE)
    for r in results:
        if r.get("offline_result_id") == offline_result_id:
            stored_checksum = r.get("checksum")
            if not stored_checksum:
                return True  # No checksum to verify (old format)
            temp_data = {k: v for k, v in r.items() if k != "checksum"}
            current_checksum = _compute_checksum(temp_data)
            return current_checksum == stored_checksum
    return False


# ---------------------------------------------------------------------------
# Bulk Sync Operations
# ---------------------------------------------------------------------------
def get_sync_summary() -> dict:
    """Get a summary of what needs to be synced."""
    pending_sessions = get_pending_sessions()
    pending_results = get_pending_results()
    
    return {
        "sessions": {
            "count": len(pending_sessions),
            "oldest": min((s.get("created_at", 0) for s in pending_sessions), default=0),
            "newest": max((s.get("created_at", 0) for s in pending_sessions), default=0),
            "drivers": list(set(s.get("driver_name", "unknown") for s in pending_sessions))
        },
        "results": {
            "count": len(pending_results),
            "oldest": min((r.get("created_at", 0) for r in pending_results), default=0),
            "newest": max((r.get("created_at", 0) for r in pending_results), default=0),
            "tracks": list(set(r.get("track_name", "unknown") for r in pending_results))
        },
        "total_items": len(pending_sessions) + len(pending_results)
    }
