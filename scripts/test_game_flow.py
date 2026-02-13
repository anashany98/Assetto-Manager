import os
import json
import time
import uuid
import random
import string
from datetime import datetime, timezone

import requests

BASE_URL = os.getenv("API_BASE", "http://127.0.0.1:8000")

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

AGENT_TOKEN = os.getenv("AGENT_TOKEN")
PUBLIC_TOKEN = os.getenv("PUBLIC_API_TOKEN") or os.getenv("PUBLIC_WS_TOKEN") or os.getenv("CLIENT_TOKEN")
STATION_IDS_RAW = os.getenv("STATION_IDS", "")
ALLOW_STATION_CREATE = os.getenv("ALLOW_STATION_CREATE", "false").lower() in {"1", "true", "yes"}
ALLOW_FAKE_ONLINE = os.getenv("ALLOW_FAKE_ONLINE", "false").lower() in {"1", "true", "yes"}

SESSION = requests.Session()


def _rand_suffix():
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6]


def _headers_admin():
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"} if ADMIN_TOKEN else {}


def _headers_agent():
    return {"X-Agent-Token": AGENT_TOKEN} if AGENT_TOKEN else {}


def _headers_public():
    return {"X-Client-Token": PUBLIC_TOKEN} if PUBLIC_TOKEN else {}


def _log(title, ok, detail=""):
    status = "OK" if ok else "FAIL"
    print(f"[{status}] {title}")
    if detail:
        print(f"      {detail}")


class _DummyResponse:
    def __init__(self, error: Exception):
        self.status_code = 0
        self.text = str(error)

    def json(self):
        return {}


def _request(method, path, **kwargs):
    url = BASE_URL.rstrip("/") + path
    try:
        return SESSION.request(method, url, timeout=20, **kwargs)
    except requests.exceptions.RequestException as exc:
        return _DummyResponse(exc)


def ensure_admin_token():
    global ADMIN_TOKEN
    if ADMIN_TOKEN:
        return True

    if ADMIN_USERNAME and ADMIN_PASSWORD:
        # Try login
        resp = _request("POST", "/token", data={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if resp.status_code == 200:
            ADMIN_TOKEN = resp.json().get("access_token")
            return ADMIN_TOKEN is not None
        return False

    # Try to register a temporary admin (dev only)
    username = f"qa_admin_{_rand_suffix()}"
    password = "QA_" + uuid.uuid4().hex
    reg = _request("POST", "/register", json={"username": username, "password": password})
    if reg.status_code == 200:
        tok = _request("POST", "/token", data={
            "username": username,
            "password": password
        })
        if tok.status_code == 200:
            ADMIN_TOKEN = tok.json().get("access_token")
            return ADMIN_TOKEN is not None
        return False
    # Registration disabled or failed
    return False


def _parse_station_ids():
    ids = []
    raw = STATION_IDS_RAW.strip()
    if not raw:
        return ids
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError:
            continue
    return ids


def _fetch_stations():
    resp = _request("GET", "/stations/", headers=_headers_admin())
    if resp.status_code != 200:
        _log("Station list", False, f"status={resp.status_code} body={resp.text[:200]}")
        return []
    return resp.json() if isinstance(resp.json(), list) else []


def _select_existing_stations():
    if not ensure_admin_token():
        _log("Admin token", False, "Cannot resolve stations without admin")
        return None, None

    stations = _fetch_stations()
    if not stations:
        return None, None

    requested = _parse_station_ids()
    if requested:
        selected = [s for s in stations if s.get("id") in requested]
        if len(selected) < 2:
            _log("Station selection", False, f"Requested STATION_IDS not found: {requested}")
            return None, None
        return selected[0], selected[1]

    # Default: prefer active + not archived, online first
    active = [s for s in stations if s.get("is_active") and s.get("status") != "archived"]
    online = [s for s in active if s.get("is_online")]
    pool = online if len(online) >= 2 else active
    if len(pool) < 2:
        _log("Station selection", False, "Need at least 2 active stations")
        return None, None
    return pool[0], pool[1]


def test_health():
    resp = _request("GET", "/health")
    _log("Health check /health", resp.status_code == 200, f"status={resp.status_code}")


def test_scenarios():
    name = f"QA Scenario {_rand_suffix()}"
    payload = {
        "name": name,
        "description": "Automated test scenario",
        "session_type": "practice",
        "allowed_cars": ["ferrari_488_gt3"],
        "allowed_tracks": ["monza"],
        "allowed_durations": [10, 15],
        "is_active": True
    }
    created_id = None

    resp = _request("POST", "/scenarios/", json=payload)
    if resp.status_code == 200:
        created_id = resp.json().get("id")
        _log("Scenario create", True, f"id={created_id}")
    else:
        _log("Scenario create", False, f"status={resp.status_code} body={resp.text[:200]}")
        return

    # Update
    up = _request("PUT", f"/scenarios/{created_id}", json={"description": "Updated by QA"})
    _log("Scenario update", up.status_code == 200, f"status={up.status_code}")

    # List
    lst = _request("GET", "/scenarios/")
    ok = lst.status_code == 200 and any(s.get("id") == created_id for s in lst.json())
    _log("Scenario list contains new", ok, f"status={lst.status_code}")

    # Delete
    dele = _request("DELETE", f"/scenarios/{created_id}")
    _log("Scenario delete", dele.status_code == 200, f"status={dele.status_code}")


def test_tracks_and_mods():
    # Tracks list
    resp = _request("GET", "/tracks/list")
    _log("Tracks list", resp.status_code == 200, f"status={resp.status_code}")

    # Mods list (public token)
    resp = _request("GET", "/mods", headers=_headers_public())
    _log("Mods list", resp.status_code == 200, f"status={resp.status_code}")


def test_settings():
    # Public settings
    resp = _request("GET", "/settings", headers=_headers_public())
    _log("Settings list", resp.status_code == 200, f"status={resp.status_code}")

    if ensure_admin_token():
        resp2 = _request("GET", "/settings/secure", headers=_headers_admin())
        _log("Settings secure list", resp2.status_code == 200, f"status={resp2.status_code}")
    else:
        _log("Settings secure list", False, "admin token not available")


def _random_mac():
    return "02:%02x:%02x:%02x:%02x:%02x" % tuple(random.randint(0, 255) for _ in range(5))


def _station_payload(name):
    return {
        "name": name,
        "ip_address": "127.0.0.1",
        "mac_address": _random_mac(),
        "hostname": name.replace(" ", "-").lower(),
        "ac_path": r"C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa",
    }

def _fake_online(station_id):
    if not ALLOW_FAKE_ONLINE:
        return
    payload = {
        "station_id": station_id,
        "cpu_percent": 10.0,
        "ram_percent": 20.0,
        "disk_percent": 10.0,
        "ac_running": False
    }
    _request("POST", "/hardware/report", json=payload, headers=_headers_agent())


def test_station_and_sessions():
    if not ensure_admin_token():
        _log("Admin token", False, "Cannot test sessions/lobby without admin")
        return None, None

    station1, station2 = _select_existing_stations()

    if not station1 or not station2:
        if ALLOW_STATION_CREATE:
            # Fallback: register two stations (agent token may be required)
            name1 = f"QA Host {_rand_suffix()}"
            name2 = f"QA Joiner {_rand_suffix()}"

            s1 = _request("POST", "/stations/", json=_station_payload(name1), headers=_headers_agent())
            if s1.status_code != 200:
                _log("Station register host", False, f"status={s1.status_code} body={s1.text[:200]}")
                return None, None
            station1 = s1.json()
            _log("Station register host", True, f"id={station1.get('id')}")

            s2 = _request("POST", "/stations/", json=_station_payload(name2), headers=_headers_agent())
            if s2.status_code != 200:
                _log("Station register joiner", False, f"status={s2.status_code} body={s2.text[:200]}")
                return station1, None
            station2 = s2.json()
            _log("Station register joiner", True, f"id={station2.get('id')}")
        else:
            _log("Stations", False, "No fixed stations resolved (set STATION_IDS or enable ALLOW_STATION_CREATE)")
            return None, None

    _log("Stations selected", True, f"host={station1.get('id')} joiner={station2.get('id')}")

    # Optionally fake online if they are offline (disabled by default)
    if not station1.get("is_online") and ALLOW_FAKE_ONLINE:
        _fake_online(station1.get("id"))
    if not station2.get("is_online") and ALLOW_FAKE_ONLINE:
        _fake_online(station2.get("id"))

    # Start a session on host
    sess = _request("POST", "/sessions/start", headers=_headers_admin(), json={
        "station_id": station1.get("id"),
        "driver_name": "QA Driver",
        "duration_minutes": 15,
        "price": 0,
        "payment_method": "cash",
        "notes": "QA session"
    })
    if sess.status_code == 200:
        session_id = sess.json().get("id")
        _log("Session start", True, f"id={session_id}")
        # Stop
        stop = _request("POST", f"/sessions/{session_id}/stop", headers=_headers_admin())
        _log("Session stop", stop.status_code == 200, f"status={stop.status_code}")
    else:
        _log("Session start", False, f"status={sess.status_code} body={sess.text[:200]}")

    return station1, station2


def test_lobby_flow(station1, station2):
    if not station1 or not station2:
        _log("Lobby flow", False, "Missing stations")
        return

    # Create lobby
    lobby_payload = {
        "name": f"QA Lobby {_rand_suffix()}",
        "track": "monza",
        "car": "ferrari_488_gt3",
        "max_players": 2,
        "laps": 3
    }
    if not station1.get("is_online"):
        _log("Lobby create", False, "Host station is offline; skipping lobby")
        return
    create = _request("POST", f"/lobby/create?host_station_id={station1['id']}", headers=_headers_admin(), json=lobby_payload)
    if create.status_code != 200:
        _log("Lobby create", False, f"status={create.status_code} body={create.text[:200]}")
        return
    lobby = create.json()
    lobby_id = lobby.get("id")
    _log("Lobby create", True, f"id={lobby_id}")

    # Join lobby with station2
    join = _request("POST", f"/lobby/{lobby_id}/join", headers=_headers_admin(), json={"station_id": station2["id"], "password": ""})
    _log("Lobby join", join.status_code == 200, f"status={join.status_code}")

    # Ready both
    ready1 = _request("POST", f"/lobby/{lobby_id}/ready", headers=_headers_admin(), params={"station_id": station1["id"], "is_ready": "true"})
    ready2 = _request("POST", f"/lobby/{lobby_id}/ready", headers=_headers_admin(), params={"station_id": station2["id"], "is_ready": "true"})
    _log("Lobby ready host", ready1.status_code == 200, f"status={ready1.status_code}")
    _log("Lobby ready joiner", ready2.status_code == 200, f"status={ready2.status_code}")

    # Start lobby
    start = _request("POST", f"/lobby/{lobby_id}/start", headers=_headers_admin(), params={"requesting_station_id": station1["id"]})
    _log("Lobby start", start.status_code == 200, f"status={start.status_code}")

    # Cancel lobby
    cancel = _request("DELETE", f"/lobby/{lobby_id}", headers=_headers_admin(), params={"requesting_station_id": station1["id"]})
    _log("Lobby cancel", cancel.status_code == 200, f"status={cancel.status_code}")


def test_telemetry_http(station_id):
    if not station_id:
        _log("Telemetry HTTP", False, "Missing station")
        return

    payload = {
        "station_id": station_id,
        "track_name": "monza",
        "track_config": None,
        "car_model": "ferrari_488_gt3",
        "driver_name": "QA Driver",
        "session_type": "practice",
        "date": datetime.now(timezone.utc).isoformat(),
        "best_lap": 123456,
        "event_id": None,
        "laps": [
            {
                "driver_name": "QA Driver",
                "car_model": "ferrari_488_gt3",
                "track_name": "monza",
                "track_config": None,
                "lap_time": 123456,
                "sectors": [40000, 40000, 43456],
                "telemetry_data": [{"n": 0.0, "s": 100, "x": 1, "y": 2, "z": 3}],
                "is_valid": True,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        ]
    }
    resp = _request("POST", "/telemetry/session", json=payload, headers=_headers_agent())
    _log("Telemetry upload session", resp.status_code == 201, f"status={resp.status_code}")


def test_telemetry_ws(station_id):
    try:
        import asyncio
        import websockets
    except Exception as e:
        _log("Telemetry WS", False, f"Missing websockets lib: {e}")
        return

    async def _run():
        client_url = "ws://127.0.0.1:8000/ws/telemetry/client"
        if PUBLIC_TOKEN:
            client_url += f"?token={PUBLIC_TOKEN}"
        agent_url = "ws://127.0.0.1:8000/ws/telemetry/agent"

        received = {"ok": False, "msg": ""}

        async def client_task():
            try:
                async with websockets.connect(client_url) as ws:
                    await ws.send("ping")
                    for _ in range(3):
                        msg = await asyncio.wait_for(ws.recv(), timeout=5)
                        if "LapCompleted" in msg or "telemetry" in msg or "driver_name" in msg:
                            received["ok"] = True
                            received["msg"] = msg
                            return
            except Exception as e:
                received["ok"] = False
                received["msg"] = str(e)

        async def agent_task():
            try:
                async with websockets.connect(agent_url) as ws:
                    identify = {"type": "identify", "station_id": station_id}
                    if AGENT_TOKEN:
                        identify["token"] = AGENT_TOKEN
                    await ws.send(json.dumps(identify))
                    # Wait a tick for server to register
                    await asyncio.sleep(0.5)
                    telemetry = {
                        "event": "LapCompleted",
                        "driver_name": "QA Driver",
                        "car_model": "ferrari_488_gt3",
                        "track_name": "monza",
                        "lap_time": 123456
                    }
                    await ws.send(json.dumps(telemetry))
                    await asyncio.sleep(0.5)
            except Exception as e:
                # Only set msg if not already got from client
                if not received["msg"]:
                    received["msg"] = str(e)

        await asyncio.gather(client_task(), agent_task())
        return received

    try:
        result = asyncio.run(_run())
        _log("Telemetry WS broadcast", result.get("ok"), result.get("msg", ""))
    except Exception as e:
        _log("Telemetry WS broadcast", False, str(e))


def main():
    print(f"API base: {BASE_URL}")
    test_health()
    test_scenarios()
    test_tracks_and_mods()
    test_settings()
    station1, station2 = test_station_and_sessions()
    if station1 and station2:
        test_lobby_flow(station1, station2)
        test_telemetry_http(station1["id"])
        test_telemetry_ws(station1["id"])
    else:
        _log("Lobby/Telemetry", False, "Skipped due to missing stations/admin")

if __name__ == "__main__":
    main()
