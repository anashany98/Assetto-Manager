import json
import uuid
import time
import logging
from pathlib import Path
from typing import List
from config import logger

QUEUE_DIR = Path(__file__).resolve().parent / "offline_data"
SESSIONS_FILE = QUEUE_DIR / "pending_sessions.json"
RESULTS_FILE = QUEUE_DIR / "pending_results.json"


def _ensure_dir():
    QUEUE_DIR.mkdir(exist_ok=True)


def _load_json(filepath: Path) -> list:
    try:
        if filepath.exists():
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"Failed to load {filepath}: {e}")
    return []


def _save_json(filepath: Path, data: list):
    _ensure_dir()
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to save {filepath}: {e}")


# ---------------------------------------------------------------------------
# Offline Sessions
# ---------------------------------------------------------------------------
def save_offline_session(session_data: dict) -> str:
    offline_id = f"offline_{uuid.uuid4().hex[:12]}_{int(time.time())}"
    session_data["offline_session_id"] = offline_id
    session_data["synced"] = False
    session_data["created_at"] = time.time()
    sessions = _load_json(SESSIONS_FILE)
    sessions.append(session_data)
    _save_json(SESSIONS_FILE, sessions)
    logger.info(f"Saved offline session {offline_id}: {session_data.get('driver_name', 'unknown')}")
    return offline_id


def get_pending_sessions() -> List[dict]:
    sessions = _load_json(SESSIONS_FILE)
    return [s for s in sessions if not s.get("synced")]


def mark_session_synced(offline_session_id: str):
    sessions = _load_json(SESSIONS_FILE)
    changed = False
    for s in sessions:
        if s.get("offline_session_id") == offline_session_id:
            s["synced"] = True
            changed = True
            break
    if changed:
        _save_json(SESSIONS_FILE, sessions)


def remove_synced_sessions():
    sessions = _load_json(SESSIONS_FILE)
    pending = [s for s in sessions if not s.get("synced")]
    _save_json(SESSIONS_FILE, pending)
    removed = len(sessions) - len(pending)
    if removed > 0:
        logger.info(f"Removed {removed} synced offline sessions from queue")


# ---------------------------------------------------------------------------
# Offline Telemetry Results
# ---------------------------------------------------------------------------
def save_offline_result(result_data: dict) -> str:
    offline_id = f"result_{uuid.uuid4().hex[:12]}_{int(time.time())}"
    result_data["offline_result_id"] = offline_id
    result_data["synced"] = False
    result_data["created_at"] = time.time()
    results = _load_json(RESULTS_FILE)
    results.append(result_data)
    _save_json(RESULTS_FILE, results)
    logger.info(f"Saved offline result {offline_id}: {result_data.get('track_name', 'unknown')}")
    return offline_id


def get_pending_results() -> List[dict]:
    results = _load_json(RESULTS_FILE)
    return [r for r in results if not r.get("synced")]


def mark_result_synced(offline_result_id: str):
    results = _load_json(RESULTS_FILE)
    changed = False
    for r in results:
        if r.get("offline_result_id") == offline_result_id:
            r["synced"] = True
            changed = True
            break
    if changed:
        _save_json(RESULTS_FILE, results)


def remove_synced_results():
    results = _load_json(RESULTS_FILE)
    pending = [r for r in results if not r.get("synced")]
    _save_json(RESULTS_FILE, pending)
    removed = len(results) - len(pending)
    if removed > 0:
        logger.info(f"Removed {removed} synced offline results from queue")
