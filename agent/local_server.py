import asyncio
import json
import os
import platform
import subprocess
import logging
import threading
from pathlib import Path

from aiohttp import web

from config import LOCAL_SERVER_PORT, LOCAL_AUTH_TOKEN, AGENT_VERSION, logger
from commands import launch_session_logic
from watchdog import watchdog
from idle_display import start_idle_display, stop_idle_display
from utils import get_system_info

CONTENT_CACHE_PATH = Path(__file__).resolve().parent / "content_cache.json"

_server_runner = None
_local_kiosk_code = ""


def set_local_kiosk_code(code: str | None) -> None:
    global _local_kiosk_code
    normalized = (code or "").strip().upper()
    _local_kiosk_code = normalized
    if normalized:
        logger.info("Local kiosk code updated for offline control")
        # Persist to config.json
        try:
            config_path = Path(__file__).parent / "config.json"
            config = {}
            if config_path.exists():
                with open(config_path, "r") as f:
                    config = json.load(f)
            config["kiosk_code"] = normalized
            with open(config_path, "w") as f:
                json.dump(config, f, indent=4)
        except Exception as e:
            logger.warning(f"Failed to persist kiosk code: {e}")


def _get_content_cache() -> dict:
    """Read the local content cache file."""
    try:
        if CONTENT_CACHE_PATH.exists():
            with open(CONTENT_CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read content cache: {e}")
    return {"cars": [], "tracks": []}


def _is_ac_running() -> bool:
    """Check if Assetto Corsa is currently running."""
    process_names = ("acs.exe", "acs_pro.exe", "AssettoCorsa.exe")
    if platform.system() != "Windows":
        process_names = ("acs",)
    try:
        for name in process_names:
            result = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {name}"],
                capture_output=True, text=True, timeout=5,
            )
            if name.lower() in result.stdout.lower():
                return True
    except Exception:
        pass
    return False


def _stop_ac():
    """Kill any running Assetto Corsa process."""
    watchdog.stop()
    if platform.system() == "Windows":
        for proc_name in ["acs.exe", "acs_pro.exe", "AssettoCorsa.exe"]:
            subprocess.run(["taskkill", "/F", "/IM", proc_name], capture_output=True)
    else:
        subprocess.run(["pkill", "-9", "acs"], capture_output=True)
    start_idle_display()


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------
@web.middleware
async def auth_middleware(request: web.Request, handler):
    # Skip auth for health check
    if request.path == "/health":
        return await handler(request)

    token = request.headers.get("X-Local-Token", "")
    kiosk_code = (request.headers.get("X-Kiosk-Code", "") or "").strip().upper()
    token_ok = bool(token) and token == LOCAL_AUTH_TOKEN
    kiosk_ok = bool(_local_kiosk_code) and kiosk_code == _local_kiosk_code
    if not token_ok and not kiosk_ok:
        return web.json_response(
            {"error": "Unauthorized", "detail": "Invalid or missing local auth credentials"},
            status=401,
        )
    return await handler(request)


# ---------------------------------------------------------------------------
# Request handlers
# ---------------------------------------------------------------------------
async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok"})


async def handle_content(request: web.Request) -> web.Response:
    cache = _get_content_cache()
    return web.json_response(cache)


async def handle_launch(request: web.Request) -> web.Response:
    if _is_ac_running():
        return web.json_response({"error": "AC is already running"}, status=409)
    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"error": "Invalid JSON body"},
            status=400,
        )

    # Validate required fields
    car = data.get("car", "").strip()
    track = data.get("track", "").strip()
    if not car or not track:
        return web.json_response(
            {"error": "Missing required fields", "detail": "car and track are required"},
            status=400,
        )

    # Stop any running AC first
    stop_idle_display()

    # Launch in a thread to not block the event loop
    station_id = data.get("station_id", 0)
    loop = __import__("asyncio").get_event_loop()
    ok = await loop.run_in_executor(None, launch_session_logic, data, station_id)

    if ok:
        # Save session for offline sync
        try:
            from datetime import datetime, timezone
            from offline_queue import save_offline_session
            save_offline_session({
                "station_id": station_id,
                "driver_name": data.get("driver_name", "Guest"),
                "car": car,
                "track": track,
                "duration_minutes": data.get("duration_minutes", 15),
                "start_time": datetime.now(timezone.utc).isoformat(),
                "price": 0.0,
                "payment_method": "cash",
                "notes": "offline_launch",
            })
        except Exception as e:
            logger.warning(f"Failed to save offline session: {e}")

        return web.json_response({
            "status": "launched",
            "car": car,
            "track": track,
            "driver_name": data.get("driver_name", "Guest"),
        })
    else:
        start_idle_display()
        return web.json_response(
            {"error": "Launch failed", "detail": "Assetto Corsa did not start"},
            status=500,
        )


async def handle_stop(request: web.Request) -> web.Response:
    _stop_ac()
    return web.json_response({"status": "stopped"})


async def handle_status(request: web.Request) -> web.Response:
    system_info = get_system_info()
    active = watchdog.active_session or {}
    return web.json_response({
        "ac_running": _is_ac_running(),
        "session_active": bool(active),
        "car": active.get("car", ""),
        "track": active.get("track", ""),
        "hostname": system_info.get("hostname", ""),
        "ip_address": system_info.get("ip_address", ""),
    })


# ---------------------------------------------------------------------------
# Server lifecycle
# ---------------------------------------------------------------------------
from typing import Optional

def start_local_server(port: Optional[int] = None):
    """Start the local HTTP server in a background thread."""
    global _server_runner
    if _server_runner is not None:
        logger.warning("Local server already running")
        return

    effective_port = port or LOCAL_SERVER_PORT

    app = web.Application(middlewares=[auth_middleware])
    app.router.add_get("/health", handle_health)
    app.router.add_get("/content", handle_content)
    app.router.add_post("/launch", handle_launch)
    app.router.add_post("/stop", handle_stop)
    app.router.add_get("/status", handle_status)

    def _run():
        global _server_runner
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        runner = web.AppRunner(app)
        loop.run_until_complete(runner.setup())
        site = web.TCPSite(runner, "127.0.0.1", effective_port)
        loop.run_until_complete(site.start())
        _server_runner = runner
        logger.info(f"Local API server started on port {effective_port}")
        loop.run_forever()

    thread = threading.Thread(target=_run, daemon=True, name="LocalAPIServer")
    thread.start()


def stop_local_server():
    """Stop the local HTTP server."""
    global _server_runner
    if _server_runner is not None:
        try:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(_server_runner.cleanup())
            loop.close()
        except Exception as e:
            logger.warning(f"Error stopping local server: {e}")
        finally:
            _server_runner = None
            logger.info("Local API server stopped")
