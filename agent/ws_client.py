import asyncio
import websockets
import json
import logging
import platform
import os
import subprocess
import threading
import time
import random
import requests
from urllib.parse import urlparse, urlunparse
from config import AGENT_TOKEN, logger, OBS_HOST, OBS_PORT, OBS_PASSWORD, STREAM_URL
from scanner import scan_ac_content
from commands import (
    launch_session_logic, create_lobby_server, join_lobby_client,
    stop_lobby_server, install_mod_logic, restart_agent_process, set_weather_logic,
    watchdog
)
from utils import get_system_info
import ac_telemetry
import telemetry # The existing telemetry module for saving results
from obs_controller import handle_obs_command
from idle_display import start_idle_display, stop_idle_display
from local_server import set_local_kiosk_code
from offline_queue import (
    get_pending_sessions, get_pending_results, mark_session_synced, mark_result_synced,
    remove_synced_sessions, remove_synced_results, get_sync_summary, record_offline_event,
    verify_session_integrity, verify_result_integrity
)

# ---------------------------------------------------------------------------
# Reconnection constants
# ---------------------------------------------------------------------------
_RECONNECT_BASE_DELAY = 1.0   # seconds
_RECONNECT_MAX_DELAY  = 60.0  # seconds
_RECONNECT_FACTOR     = 2.0   # exponential multiplier
_RECONNECT_JITTER     = 0.25  # ±25 % random jitter


def _backoff_delay(attempt: int) -> float:
    """Return the number of seconds to wait before reconnect attempt `attempt` (0-indexed)."""
    delay = min(_RECONNECT_BASE_DELAY * (_RECONNECT_FACTOR ** attempt), _RECONNECT_MAX_DELAY)
    jitter = delay * _RECONNECT_JITTER * (2 * random.random() - 1)
    return max(0.0, delay + jitter)


class AgentWSClient(threading.Thread):
    def __init__(self, station_id, server_url):
        super().__init__()
        self.station_id = station_id
        parsed = urlparse(server_url)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        self.server_url = urlunparse((scheme, parsed.netloc, "/ws/telemetry/agent", "", "", ""))
        self.running = True
        self.daemon = True
        self.ac = ac_telemetry.ACSharedMemory()

        # Telemetry Buffer
        self.current_lap_buffer = []
        self.last_lap_count = -1
        self.last_lap_timestamp = time.time()

        # Command queue — commands received while another is executing are
        # buffered here so none are silently dropped.
        self._command_queue: asyncio.Queue = None  # initialised in stream_telemetry

    def run(self):
        asyncio.run(self.stream_telemetry())

    async def _send_command_ack(self, websocket, data, status="accepted", detail=None):
        command_id = data.get("command_id")
        if not command_id:
            return

        payload = {
            "type": "command_ack",
            "station_id": self.station_id,
            "command_id": command_id,
            "command": data.get("command"),
            "status": status,
        }
        if detail:
            payload["detail"] = detail
        await websocket.send(json.dumps(payload))

    async def _heartbeat_loop(self, websocket):
        """Send a ping every 20 s so the server marks this station as online."""
        try:
            while True:
                await asyncio.sleep(20)
                await websocket.ping()
        except asyncio.CancelledError:
            pass
        except Exception:
            pass  # Connection gone — send_loop / receive_loop will exit too

    async def stream_telemetry(self):
        self._command_queue = asyncio.Queue()
        logger.info("Connecting to Telemetry WS: %s", self.server_url)
        attempt = 0
        while self.running:
            try:
                async with websockets.connect(self.server_url) as websocket:
                    logger.info("WS Connected (attempt %d)", attempt)
                    attempt = 0  # reset on successful connection
                    await websocket.send(json.dumps({
                        "type": "identify",
                        "station_id": self.station_id,
                        "role": "agent",
                        "token": AGENT_TOKEN
                    }))

                    # Sync offline data after reconnect
                    await self.sync_offline_data()

                    tasks = [
                        asyncio.create_task(self.send_loop(websocket), name="send_loop"),
                        asyncio.create_task(self.receive_loop(websocket), name="receive_loop"),
                        asyncio.create_task(self.command_worker(websocket), name="command_worker"),
                        asyncio.create_task(self._heartbeat_loop(websocket), name="heartbeat_loop"),
                    ]
                    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)

                    for task in pending:
                        task.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)

                    for task in done:
                        if task.cancelled():
                            continue
                        exc = task.exception()
                        if exc and not isinstance(exc, websockets.ConnectionClosed):
                            logger.error("WS task %s ended with error: %s", task.get_name(), exc)

                    logger.warning("WebSocket session ended; reconnecting...")
            except Exception as e:
                delay = _backoff_delay(attempt)
                logger.error("WS Error (attempt %d): %s — reconnecting in %.1fs", attempt, e, delay)
                attempt += 1
                await asyncio.sleep(delay)

    # -----------------------------------------------------------------------
    # Command queue worker
    # -----------------------------------------------------------------------
    async def command_worker(self, websocket):
        """
        Drains self._command_queue one item at a time.
        Commands received while one is running are buffered, never dropped.
        """
        while True:
            data = await self._command_queue.get()
            try:
                await self._dispatch_command(websocket, data)
            except Exception as e:
                logger.exception("Unhandled error in command_worker for %s: %s", data.get("command"), e)
            finally:
                self._command_queue.task_done()

    async def _run_command_handler(self, websocket, data, handler, *args, failure_detail: str):
        try:
            ok = await asyncio.to_thread(handler, *args)
        except Exception as e:
            logger.exception("Command %s raised an exception", data.get("command"))
            await self._send_command_ack(websocket, data, status="error", detail=str(e))
            return

        if ok:
            await self._send_command_ack(websocket, data, status="completed")
        else:
            await self._send_command_ack(websocket, data, status="error", detail=failure_detail)

    async def send_loop(self, websocket):
        loop = asyncio.get_event_loop()
        while self.running:
            try:
                data = await loop.run_in_executor(None, self.ac.read_data)
                if data:
                    data['station_id'] = self.station_id
                    await websocket.send(json.dumps(data))
                    
                    # Buffer logic
                    current_laps = data.get('laps', 0)
                    if self.last_lap_count == -1:
                        self.last_lap_count = current_laps
                    
                    self.current_lap_buffer.append({
                        "t": data.get('lap_time_ms', 0),
                        "speed": data.get('speed_kmh', 0),
                        "rpm": data.get('rpm', 0),
                        "gear": data.get('gear', 0),
                        "gas": data.get('gas', 0),
                        "brake": data.get('brake', 0),
                        "steer": data.get('steer', 0),
                        "g_lat": data.get('g_lat', 0),
                        "g_lon": data.get('g_lon', 0),
                        "x": data.get('x', 0),
                        "z": data.get('z', 0),
                    })
                    
                    # Limit buffer size to prevent memory leak if player never completes a lap
                    if len(self.current_lap_buffer) > 50000:
                        self.current_lap_buffer = self.current_lap_buffer[-25000:]
                    
                    if current_laps > self.last_lap_count:
                        telemetry.save_lap_telemetry(self.last_lap_count, self.current_lap_buffer)
                        self.current_lap_buffer = []
                        self.last_lap_count = current_laps

                await asyncio.sleep(0.05)
            except websockets.ConnectionClosed:
                break
            except Exception:
                break

    async def receive_loop(self, websocket):
        """
        Reads incoming messages and either handles OBS control directly
        (fast, no blocking I/O) or pushes regular commands onto the queue
        so command_worker serialises their execution.
        """
        while self.running:
            try:
                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                except asyncio.TimeoutError:
                    continue

                data = json.loads(msg)
                command = data.get("command")

                # OBS control is handled immediately — it uses async I/O only.
                if data.get("type") == "obs_control":
                    await self._send_command_ack(websocket, data, status="accepted")
                    params = data.get("params") or {}
                    if "host" not in params and OBS_HOST:
                        params["host"] = OBS_HOST
                    if "port" not in params and OBS_PORT:
                        params["port"] = OBS_PORT
                    if "password" not in params and OBS_PASSWORD:
                        params["password"] = OBS_PASSWORD
                    result = await handle_obs_command(command, params)
                    response = {
                        "type": "obs_status",
                        "station_id": self.station_id,
                        "command": command,
                        "result": result,
                    }
                    if "streaming" in result:
                        response["is_streaming"] = bool(result.get("streaming"))
                    if STREAM_URL:
                        response["stream_url"] = STREAM_URL
                    await websocket.send(json.dumps(response))
                    continue

                # All other commands are queued for serialised execution.
                if command:
                    logger.info("Queuing command: %s (queue depth: %d)", command, self._command_queue.qsize())
                    await self._command_queue.put(data)

            except websockets.ConnectionClosed:
                break
            except Exception as e:
                logger.error("Error processing WS message: %s", e)
                break

    async def _dispatch_command(self, websocket, data):
        """Execute a single queued command."""
        command = data.get("command")

        if command == "shutdown":
            await self._send_command_ack(websocket, data, status="accepted")
            if platform.system() == "Windows":
                subprocess.run(["shutdown", "/s", "/t", "5"])

        elif command == "restart":
            await self._send_command_ack(websocket, data, status="accepted")
            if platform.system() == "Windows":
                subprocess.run(["shutdown", "/r", "/t", "5"])

        elif command == "panic":
            await self._send_command_ack(websocket, data, status="accepted")
            stop_idle_display()
            watchdog.stop()
            subprocess.run(["taskkill", "/F", "/IM", "acs.exe"], capture_output=True)
            start_idle_display()

        elif command == "stop_session":
            await self._send_command_ack(websocket, data, status="accepted")
            stop_idle_display()
            watchdog.stop()
            subprocess.run(["taskkill", "/F", "/IM", "acs.exe"], capture_output=True)
            start_idle_display()

        elif command == "launch_session":
            stop_idle_display()
            await self._run_command_handler(
                websocket, data, launch_session_logic, data, self.station_id,
                failure_detail="Assetto Corsa did not start",
            )

        elif command == "create_lobby":
            stop_idle_display()
            await self._run_command_handler(
                websocket, data, create_lobby_server, data,
                failure_detail="acServer.exe did not start",
            )

        elif command == "join_lobby":
            stop_idle_display()
            await self._run_command_handler(
                websocket, data, join_lobby_client, data,
                failure_detail="Assetto Corsa client did not join the lobby",
            )

        elif command == "stop_lobby":
            await self._send_command_ack(websocket, data, status="accepted")
            stop_lobby_server()
            start_idle_display()

        elif command == "install_mod":
            await self._send_command_ack(websocket, data, status="accepted")
            threading.Thread(target=install_mod_logic, args=(data,), daemon=True).start()

        elif command == "scan_content":
            await self._send_command_ack(websocket, data, status="accepted")
            ac_path = data.get("ac_path") or get_system_info().get("ac_path")
            try:
                content = await asyncio.to_thread(
                    scan_ac_content,
                    ac_path,
                    station_ip=data.get("station_ip"),
                )
                await websocket.send(json.dumps({
                    "type": "content_scan_result",
                    "data": content
                }))
            except Exception as e:
                logger.exception("scan_content failed")
                await self._send_command_ack(websocket, data, status="error", detail=str(e))

        elif command == "restart_agent":
            await self._send_command_ack(websocket, data, status="accepted")
            threading.Thread(target=restart_agent_process, daemon=True).start()

        elif command == "set_weather":
            await self._send_command_ack(websocket, data, status="accepted")
            threading.Thread(target=set_weather_logic, args=(data.get("value"),), daemon=True).start()

        elif command == "update_kiosk_code":
            await self._send_command_ack(websocket, data, status="accepted")
            set_local_kiosk_code(data.get("kiosk_code"))

        else:
            await self._send_command_ack(websocket, data, status="rejected", detail="Unknown command")

    # -----------------------------------------------------------------------
    # Offline Data Sync
    # -----------------------------------------------------------------------
    async def sync_offline_data(self):
        """
        Sync all pending offline sessions and results after reconnecting.
        Called automatically after WS reconnection.
        """
        summary = get_sync_summary()
        total = summary.get("total_items", 0)
        if total == 0:
            return

        logger.info("Syncing %d offline items (%d sessions, %d results)...",
                     total, summary["sessions"]["count"], summary["results"]["count"])
        record_offline_event("sync_started", f"Total items: {total}")

        # Get the server base URL for HTTP requests
        parsed = urlparse(self.server_url)
        server_base = f"{parsed.scheme}://{parsed.netloc}"

        # Sync sessions first
        pending_sessions = get_pending_sessions()
        synced_sessions = 0
        for session in pending_sessions:
            offline_id = session.get("offline_session_id")
            if not offline_id:
                continue

            # Verify integrity before syncing
            if not verify_session_integrity(offline_id):
                logger.warning("Skipping corrupted session: %s", offline_id)
                mark_session_synced(offline_id)  # Mark as synced to remove bad data
                continue

            try:
                # Remove offline-specific fields for the API
                api_data = {k: v for k, v in session.items()
                           if k not in ("synced", "synced_at", "checksum")}

                response = requests.post(
                    f"{server_base}/sessions/sync-offline",
                    json=api_data,
                    headers={"X-Agent-Token": AGENT_TOKEN} if AGENT_TOKEN else {},
                    timeout=30
                )
                if response.status_code in (200, 201):
                    mark_session_synced(offline_id)
                    synced_sessions += 1
                    logger.info("Synced session %s (%d/%d)", offline_id,
                               synced_sessions, len(pending_sessions))
                else:
                    logger.warning("Failed to sync session %s: %d %s",
                                  offline_id, response.status_code, response.text[:200])
            except Exception as e:
                logger.error("Error syncing session %s: %s", offline_id, e)
                break  # Stop on first error - server may be unstable

        # Sync results
        pending_results = get_pending_results()
        synced_results = 0
        for result in pending_results:
            offline_id = result.get("offline_result_id")
            if not offline_id:
                continue

            if not verify_result_integrity(offline_id):
                logger.warning("Skipping corrupted result: %s", offline_id)
                mark_result_synced(offline_id)
                continue

            try:
                api_data = {k: v for k, v in result.items()
                           if k not in ("synced", "synced_at", "checksum")}

                response = requests.post(
                    f"{server_base}/telemetry/session",
                    json=api_data,
                    headers={"X-Agent-Token": AGENT_TOKEN} if AGENT_TOKEN else {},
                    timeout=30
                )
                if response.status_code in (200, 201):
                    mark_result_synced(offline_id)
                    synced_results += 1
                    logger.info("Synced result %s (%d/%d)", offline_id,
                               synced_results, len(pending_results))
                else:
                    logger.warning("Failed to sync result %s: %d %s",
                                  offline_id, response.status_code, response.text[:200])
            except Exception as e:
                logger.error("Error syncing result %s: %s", offline_id, e)
                break

        # Clean up synced items
        remove_synced_sessions()
        remove_synced_results()

        record_offline_event("sync_completed",
                           f"Sessions: {synced_sessions}/{len(pending_sessions)}, "
                           f"Results: {synced_results}/{len(pending_results)}")
        logger.info("Offline sync complete: %d/%d sessions, %d/%d results synced",
                   synced_sessions, len(pending_sessions),
                   synced_results, len(pending_results))
