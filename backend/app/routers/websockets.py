from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List, Dict, Any
import json
import logging
import os
import asyncio
from uuid import uuid4
from sqlalchemy.orm import Session
from ..database import SessionLocal
from .. import models
from datetime import datetime, timezone

from ..security.api_keys import is_agent_token_allowed, is_client_token_allowed


router = APIRouter()
logger = logging.getLogger(__name__)


def _is_public_ws_allowed(token: str | None) -> bool:
    # Require a dedicated WS scope when tokens are configured; dev remains open by default.
    return is_client_token_allowed(token=token, required_scopes=("ws:public",))


def _is_agent_ws_allowed(token: str | None) -> bool:
    return is_agent_token_allowed(token=token, required_scopes=("agent:ws",))


def _is_truthy(raw: str | None) -> bool:
    return (raw or "").strip().lower() in {"1", "true", "yes"}


def _allow_ws_query_token() -> bool:
    environment = (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()
    default = "false" if environment == "production" else "true"
    return _is_truthy(os.getenv("ALLOW_WS_TOKEN_QUERY", default))


def _get_environment() -> str:
    """Get current environment with safe default."""
    return (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()


def _require_ws_auth_in_dev() -> bool:
    """
    Determine if WebSocket authentication is required in development.
    Default: True (secure by default).
    Set WS_DEV_REQUIRE_AUTH=false to allow unauthenticated connections in dev.
    """
    env = _get_environment()
    if env == "production":
        return True  # Always required in production
    
    # In development, require auth by default unless explicitly disabled
    return _is_truthy(os.getenv("WS_DEV_REQUIRE_AUTH", "true"))


async def _authenticate_public_client(websocket: WebSocket) -> bool:
    """
    Authenticate a public WebSocket client.
    
    Security model:
    - Production: ALWAYS requires valid token
    - Development: Requires token by default (WS_DEV_REQUIRE_AUTH=true)
    - Legacy dev mode: Set WS_DEV_REQUIRE_AUTH=false to allow unauthenticated (NOT RECOMMENDED)
    """
    query_token = websocket.query_params.get("token")
    if query_token and _allow_ws_query_token() and _is_public_ws_allowed(query_token):
        return True

    identify_timeout = int(os.getenv("WS_CLIENT_IDENTIFY_TIMEOUT", "8"))
    try:
        raw_data = await asyncio.wait_for(websocket.receive_text(), timeout=identify_timeout)
    except asyncio.TimeoutError:
        # SECURITY FIX: Only allow unauthenticated access if explicitly permitted in dev
        if _require_ws_auth_in_dev():
            logger.warning("WebSocket client timed out without authentication - rejecting")
            return False
        # Legacy behavior: allow if tokens not configured (only when WS_DEV_REQUIRE_AUTH=false)
        return _is_public_ws_allowed(None)
    except WebSocketDisconnect:
        # Client closed before identify; treat as unauthenticated without noisy stack traces.
        return False

    try:
        data = json.loads(raw_data)
    except json.JSONDecodeError:
        if _require_ws_auth_in_dev():
            logger.warning("WebSocket client sent invalid JSON - rejecting")
            return False
        return _is_public_ws_allowed(None)

    if not isinstance(data, dict) or data.get("type") != "identify":
        if _require_ws_auth_in_dev():
            logger.warning("WebSocket client did not send identify message - rejecting")
            return False
        return _is_public_ws_allowed(None)

    token = data.get("token")
    if token is not None and not isinstance(token, str):
        return False

    # Empty/whitespace-only token is treated as no token
    normalized = token.strip() if isinstance(token, str) else None
    normalized = normalized or None
    
    # If no token provided after identify
    if normalized is None and _require_ws_auth_in_dev():
        logger.warning("WebSocket client identified without token - rejecting")
        return False
    
    return _is_public_ws_allowed(normalized)


WS_CHANNEL_CLIENT_BROADCAST = "acmanager:ws:broadcast:clients"
WS_CHANNEL_AGENT_BROADCAST = "acmanager:ws:broadcast:agents"
WS_CHANNEL_COMMAND = "acmanager:ws:command"
WS_CHANNEL_COMMAND_ACK = "acmanager:ws:command:ack"
WS_CHANNEL_AGENT_OWNERSHIP = "acmanager:ws:agent:ownership"

class ConnectionManager:
    def __init__(self):
        # Active connections: list of WebSockets
        self.active_clients: List[WebSocket] = []
        # Map Station ID -> WebSocket
        self.active_agents: Dict[int, WebSocket] = {}
        # Reverse map WS -> Station ID for cleanup
        self.ws_to_station: Dict[WebSocket, int] = {}
        # Last known state per agent (keyed by car/station ID usually, but here we might just store by agent WS)
        self.agent_states: Dict[WebSocket, Any] = {}

        # Optional cross-worker pubsub (Redis). Enabled via WS_PUBSUB=redis + REDIS_URL.
        self.instance_id = uuid4().hex
        self._pubsub_enabled = False
        self._redis = None
        self._redis_pubsub = None
        self._pubsub_task: asyncio.Task | None = None
        self.pending_command_acks: Dict[str, asyncio.Future] = {}

    def stats(self) -> dict[str, Any]:
        return {
            "instance_id": self.instance_id,
            "pubsub_enabled": self._pubsub_enabled,
            "clients": len(self.active_clients),
            "agents": len(self.active_agents),
            "agent_station_ids": sorted([int(sid) for sid in self.active_agents.keys()]),
        }

    async def start_pubsub(self) -> None:
        """
        Start the pubsub system for cross-worker communication.
        
        In production with multiple workers, Redis pubsub is REQUIRED for:
        - Broadcasting messages to clients connected to other workers
        - Sending commands to agents connected to other workers
        - Maintaining consistent state across all workers
        
        In development with a single worker, pubsub is optional.
        """
        environment = _get_environment()
        mode = (os.getenv("WS_PUBSUB", "none") or "none").lower().strip()
        
        # Check if we're in a multi-worker setup
        worker_count = int(os.getenv("UVICORN_WORKERS", "1"))
        is_multi_worker = worker_count > 1
        
        if mode not in {"redis", "none"}:
            logger.warning("Unknown WS_PUBSUB=%s; defaulting to none", mode)
            mode = "none"
        
        # PRODUCTION SAFETY: Require Redis for multi-worker setups
        if environment == "production" and is_multi_worker and mode != "redis":
            logger.error(
                "CRITICAL: Multi-worker production deployment detected (UVICORN_WORKERS=%d) "
                "but WS_PUBSUB is not set to 'redis'. WebSocket state will NOT be shared "
                "between workers. Set WS_PUBSUB=redis and REDIS_URL to fix this.",
                worker_count
            )
            # In production, this is a critical misconfiguration
            # We'll continue but log prominently
            logger.error(
                "WebSocket functionality will be BROKEN: messages will only reach clients "
                "connected to the same worker. Multi-station lobbies will NOT work."
            )
        
        if mode != "redis":
            if environment == "production":
                logger.warning(
                    "Production deployment without Redis pubsub. "
                    "WebSocket features will be limited to single-worker mode."
                )
            return

        url = (os.getenv("REDIS_URL") or "").strip()
        if not url:
            logger.error("WS_PUBSUB=redis requires REDIS_URL")
            if environment == "production":
                raise RuntimeError(
                    "REDIS_URL is required when WS_PUBSUB=redis in production. "
                    "Cannot start WebSocket manager without Redis for cross-worker communication."
                )
            return

        try:
            import redis.asyncio as redis_async  # type: ignore
        except Exception:
            logger.error("Redis pubsub requested but dependency 'redis' is not installed")
            if environment == "production":
                raise RuntimeError(
                    "Redis dependency is required for WS_PUBSUB=redis. "
                    "Install with: pip install redis"
                )
            return

        try:
            self._redis = redis_async.from_url(url, decode_responses=True)
            self._redis_pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
            await self._redis_pubsub.subscribe(
                WS_CHANNEL_CLIENT_BROADCAST,
                WS_CHANNEL_AGENT_BROADCAST,
                WS_CHANNEL_COMMAND,
                WS_CHANNEL_COMMAND_ACK,
                WS_CHANNEL_AGENT_OWNERSHIP,
            )
            self._pubsub_task = asyncio.create_task(self._pubsub_loop())
            self._pubsub_enabled = True
            logger.info("WS pubsub enabled (redis) instance_id=%s", self.instance_id)
        except Exception as exc:
            logger.error("Failed to start WS redis pubsub: %s", exc)
            self._pubsub_enabled = False
            if environment == "production":
                raise RuntimeError(
                    f"Failed to connect to Redis for WebSocket pubsub: {exc}. "
                    "Check REDIS_URL and ensure Redis server is running."
                )

    async def stop_pubsub(self) -> None:
        task = self._pubsub_task
        self._pubsub_task = None
        if task:
            task.cancel()
            try:
                await task
            except Exception:
                pass
        try:
            if self._redis_pubsub:
                await self._redis_pubsub.close()
        except Exception:
            pass
        try:
            if self._redis:
                await self._redis.close()
        except Exception:
            pass
        self._redis_pubsub = None
        self._redis = None
        if self._pubsub_enabled:
            logger.info("WS pubsub stopped instance_id=%s", self.instance_id)
        self._pubsub_enabled = False

    async def _publish(self, channel: str, event: dict[str, Any]) -> None:
        if not self._pubsub_enabled or not self._redis:
            return
        try:
            await self._redis.publish(channel, json.dumps(event))
        except Exception as exc:
            logger.warning("WS pubsub publish failed channel=%s err=%s", channel, exc)

    async def _pubsub_loop(self) -> None:
        if not self._redis_pubsub:
            return
        try:
            async for msg in self._redis_pubsub.listen():
                if not msg or msg.get("type") != "message":
                    continue
                channel = msg.get("channel")
                data = msg.get("data")
                if not channel or not data:
                    continue
                try:
                    event = json.loads(data) if isinstance(data, str) else None
                except Exception:
                    event = None
                if not isinstance(event, dict):
                    continue
                if event.get("origin") == self.instance_id:
                    continue

                if channel == WS_CHANNEL_CLIENT_BROADCAST:
                    payload = event.get("payload")
                    if isinstance(payload, str):
                        await self._broadcast_local_clients(payload)
                elif channel == WS_CHANNEL_AGENT_BROADCAST:
                    payload = event.get("payload")
                    if isinstance(payload, dict):
                        await self._broadcast_local_agents(payload)
                elif channel == WS_CHANNEL_COMMAND:
                    station_id = event.get("station_id")
                    payload = event.get("payload")
                    try:
                        station_id_int = int(station_id)
                    except Exception:
                        continue
                    if isinstance(payload, dict):
                        await self._send_local_command(station_id_int, payload)
                elif channel == WS_CHANNEL_COMMAND_ACK:
                    payload = event.get("payload")
                    if isinstance(payload, dict):
                        self.resolve_command_ack(payload)
                elif channel == WS_CHANNEL_AGENT_OWNERSHIP:
                    station_id = event.get("station_id")
                    try:
                        station_id_int = int(station_id)
                    except Exception:
                        continue
                    ws = self.active_agents.get(station_id_int)
                    if ws:
                        try:
                            await ws.close(code=1012)
                        except Exception:
                            pass
                        self.disconnect_agent(ws)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.error("WS pubsub loop crashed: %s", exc)

    async def connect_client(self, websocket: WebSocket):
        self.active_clients.append(websocket)
        logger.info(f"Client connected. Total clients: {len(self.active_clients)}")

    async def register_agent(self, websocket: WebSocket, station_id: int):
        # Register authenticated/identified agent
        # If station already connected, drop the old connection
        existing_ws = self.active_agents.get(station_id)
        if existing_ws and existing_ws is not websocket:
            try:
                await existing_ws.close(code=1012)
            except Exception:
                pass
            self.disconnect_agent(existing_ws)
        self.active_agents[station_id] = websocket
        self.ws_to_station[websocket] = station_id
        logger.info(f"Agent Registered: Station {station_id}. Total registered agents: {len(self.active_agents)}")
        if self._pubsub_enabled:
            # Ensure only one worker keeps a station connection in multi-worker mode.
            await self._publish(WS_CHANNEL_AGENT_OWNERSHIP, {"origin": self.instance_id, "station_id": station_id})

    def disconnect_client(self, websocket: WebSocket):
        if websocket in self.active_clients:
            self.active_clients.remove(websocket)
            logger.info(f"Client disconnected. Total clients: {len(self.active_clients)}")

    def disconnect_agent(self, websocket: WebSocket):
        if websocket in self.ws_to_station:
            station_id = self.ws_to_station[websocket]
            if station_id in self.active_agents:
                del self.active_agents[station_id]
            del self.ws_to_station[websocket]
            if websocket in self.agent_states:
                del self.agent_states[websocket]
            logger.info(f"Agent Disconnected: Station {station_id}")
            db = SessionLocal()
            try:
                station = db.query(models.Station).filter(models.Station.id == station_id).first()
                if station:
                    station.is_online = False
                    station.is_streaming = False
                    if station.status != "archived":
                        station.status = "offline"
                    db.commit()
            except Exception as e:
                logger.error(f"Failed to update station {station_id} offline state: {e}")
            finally:
                db.close()

    async def broadcast(self, message: str):
        if self._pubsub_enabled:
            await self._publish(WS_CHANNEL_CLIENT_BROADCAST, {"origin": self.instance_id, "payload": message})
        await self._broadcast_local_clients(message)

    async def _broadcast_local_clients(self, message: str) -> None:
        # Broadcast message from Agent to local Clients
        for connection in list(self.active_clients):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect_client(connection)

    async def broadcast_to_agents(self, message: dict):
        if self._pubsub_enabled:
            await self._publish(WS_CHANNEL_AGENT_BROADCAST, {"origin": self.instance_id, "payload": message})
        await self._broadcast_local_agents(message)

    async def _broadcast_local_agents(self, message: dict) -> None:
        payload = json.dumps(message)
        for station_id, ws in list(self.active_agents.items()):
            try:
                await ws.send_text(payload)
                logger.info(f"Sent command to Station {station_id}: {message.get('command')}")
            except Exception as e:
                logger.error(f"Failed to send to Station {station_id}: {e}")

    def resolve_command_ack(self, payload: dict[str, Any]) -> None:
        command_id = payload.get("command_id")
        if not command_id:
            return
        future = self.pending_command_acks.get(str(command_id))
        if future and not future.done():
            future.set_result(payload)


    async def _publish_command_ack(self, payload: dict[str, Any]) -> None:
        if self._pubsub_enabled:
            await self._publish(WS_CHANNEL_COMMAND_ACK, {"origin": self.instance_id, "payload": payload})

    def _command_ack_timeout_seconds(self, command_name: str | None) -> float:
        default_timeout = float(os.getenv("WS_COMMAND_ACK_TIMEOUT_SECONDS", "5"))
        if not command_name:
            return default_timeout

        normalized_command = str(command_name).lower()
        timeout_overrides = {
            "launch_session": ("WS_COMMAND_LAUNCH_ACK_TIMEOUT_SECONDS", 30.0),
            "join_lobby": ("WS_COMMAND_JOIN_ACK_TIMEOUT_SECONDS", 30.0),
            "create_lobby": ("WS_COMMAND_CREATE_LOBBY_ACK_TIMEOUT_SECONDS", 15.0),
        }
        override = timeout_overrides.get(normalized_command)
        if not override:
            return default_timeout
        env_key, fallback_timeout = override

        raw_value = os.getenv(env_key)
        if not raw_value:
            return fallback_timeout
        try:
            return float(raw_value)
        except (TypeError, ValueError):
            return fallback_timeout



    async def send_command(self, station_id: int, message: dict):
        payload = dict(message)
        command_id = str(payload.get("command_id") or uuid4().hex)
        payload["command_id"] = command_id

        loop = asyncio.get_running_loop()
        ack_future = loop.create_future()
        self.pending_command_acks[command_id] = ack_future
        ack_timeout = self._command_ack_timeout_seconds(payload.get("command"))

        try:
            ok = await self._send_local_command(station_id, payload)
            if not ok:
                if self._pubsub_enabled:
                    await self._publish(
                        WS_CHANNEL_COMMAND,
                        {"origin": self.instance_id, "station_id": station_id, "payload": payload},
                    )
                else:
                    return False

            try:
                ack_payload = await asyncio.wait_for(ack_future, timeout=ack_timeout)
            except asyncio.TimeoutError:
                logger.warning(
                    "Command ack timeout station=%s command=%s command_id=%s",
                    station_id,
                    payload.get("command"),
                    command_id,
                )
                return False

            status = str(ack_payload.get("status") or "").lower()
            return status not in {"rejected", "error"}
        finally:
            self.pending_command_acks.pop(command_id, None)

    async def _send_local_command(self, station_id: int, message: dict) -> bool:
        ws = self.active_agents.get(station_id)
        if not ws:
            return False
        try:
            await ws.send_text(json.dumps(message))
            logger.info(f"Command '{message.get('command')}' sent to Station {station_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to send command to Station {station_id}: {e}")
            self.disconnect_agent(ws)
            return False


manager = ConnectionManager()

@router.websocket("/ws/telemetry/client")
async def websocket_client_endpoint(websocket: WebSocket):
    logger.info("Attempting to connect a new client...")
    await websocket.accept()
    if not await _authenticate_public_client(websocket):
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return
    await websocket.send_text(json.dumps({"type": "identify_ack"}))
    await manager.connect_client(websocket)
    try:
        while True:
            # Wait for any message from the client (e.g. keepalives or commands)
            await websocket.receive_text()
            # logger.info(f"Received from client: {data}")
    except WebSocketDisconnect:
        logger.info("Client disconnected gracefully.")
        manager.disconnect_client(websocket)
    except Exception as e:
        logger.error(f"Client WS Error (Critical): {e}")
        manager.disconnect_client(websocket)

@router.websocket("/ws/telemetry/agent")
async def websocket_agent_endpoint(websocket: WebSocket):
    await websocket.accept()
    # Enforce identification before accepting any telemetry
    identify_timeout = int(os.getenv("WS_IDENTIFY_TIMEOUT", "10"))
    try:
        try:
            raw_data = await asyncio.wait_for(websocket.receive_text(), timeout=identify_timeout)
        except asyncio.TimeoutError:
            await websocket.close(code=1008)
            return

        data = json.loads(raw_data)
        if data.get("type") != "identify":
            await websocket.close(code=1008)
            return

        token = data.get("token")
        if not _is_agent_ws_allowed(token):
            await websocket.close(code=1008)
            return
        station_id = data.get("station_id")
        if not station_id:
            await websocket.close(code=1008)
            return
        try:
            station_id = int(station_id)
        except Exception:
            await websocket.close(code=1008)
            return

        await manager.register_agent(websocket, station_id)

        # Post-identify actions
        db = SessionLocal()
        try:
            station = db.query(models.Station).filter(models.Station.id == station_id).first()
            if station:
                station.is_active = True
                station.is_online = True
                station.status = "online"
                station.last_seen = datetime.now(timezone.utc)
                station.archived_at = None
                db.commit()
            if station and station.is_tv_mode:
                active_lobby = db.query(models.Lobby).filter(models.Lobby.status == "running").first()
                if active_lobby:
                    logger.info(f"Auto-joining TV Station {station_id} to running lobby {active_lobby.id}")
                    await websocket.send_text(json.dumps({
                        "command": "join_lobby",
                        "lobby_id": active_lobby.id,
                        "server_ip": active_lobby.server_ip,
                        "port": active_lobby.port,
                        "track": active_lobby.track,
                        "car": active_lobby.car,
                        "ac_path": station.ac_path,
                        "driver_name": "TV Broadcast",
                        "is_spectator": True
                    }))
            if station and station.ac_path:
                logger.info(f"Auto-triggering content scan for Station {station_id}")
                await websocket.send_text(json.dumps({
                    "command": "scan_content",
                    "ac_path": station.ac_path,
                    "station_ip": station.ip_address
                }))
        finally:
            db.close()

        while True:
            # Agents stream JSON data
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)

                if data.get("type") == "command_ack":
                    station_id = data.get("station_id") or manager.ws_to_station.get(websocket)
                    if station_id is not None:
                        data["station_id"] = station_id
                    manager.resolve_command_ack(data)
                    await manager._publish_command_ack(data)
                    continue

                # Handle Content Scan Result from Agent
                if data.get("type") == "content_scan_result":
                    station_id = manager.ws_to_station.get(websocket)
                    if station_id:
                        content_data = data.get("data", {})
                        db = SessionLocal()
                        try:
                            station = db.query(models.Station).filter(models.Station.id == station_id).first()
                            if station:
                                station.content_cache = content_data
                                station.content_cache_updated = datetime.now(timezone.utc)
                                db.commit()
                                logger.info(f"Cached content for Station {station_id}: {len(content_data.get('cars',[]))} cars, {len(content_data.get('tracks',[]))} tracks")

                                # --- AUTO-POPULATE GLOBAL LIBRARY ---
                                def ensure_mod_exists(item, mod_type):
                                    mod_name = item.get("name") or item.get("id")
                                    mod_id = item.get("id")
                                    if not mod_name: return
                                    
                                    # Create "Auto Detected" mod if not exists
                                    existing = db.query(models.Mod).filter(models.Mod.name == mod_name).first()
                                    if not existing:
                                        new_mod = models.Mod(
                                            name=mod_name,
                                            type=mod_type,
                                            version="1.0",
                                            source_path=f"auto_scan::{mod_id}", 
                                            is_active=True,
                                            status="detected"
                                        )
                                        db.add(new_mod)
                                        db.commit()
                                        db.refresh(new_mod)
                                        
                                        # Auto-tag
                                        from .mods import _apply_auto_tags
                                        _apply_auto_tags(db, new_mod, mod_type, mod_name)
                                        logger.info(f"Auto-added to Library: {mod_name} ({mod_type})")
                                
                                for car in content_data.get("cars", []):
                                    ensure_mod_exists(car, "car")
                                    
                                for track in content_data.get("tracks", []):
                                    ensure_mod_exists(track, "track")

                        finally:
                            db.close()
                    continue

                if data.get("type") == "obs_status":
                    station_id = data.get("station_id") or manager.ws_to_station.get(websocket)
                    try:
                        station_id_int = int(station_id) if station_id is not None else None
                    except Exception:
                        station_id_int = None
                    if station_id_int:
                        db = SessionLocal()
                        try:
                            station = db.query(models.Station).filter(models.Station.id == station_id_int).first()
                            if station:
                                if "is_streaming" in data:
                                    station.is_streaming = bool(data.get("is_streaming"))
                                if data.get("stream_url"):
                                    station.stream_url = data.get("stream_url")
                                db.commit()
                        finally:
                            db.close()
                    continue

                # 1. Broadcast immediately to all clients (Live visual updates)
                await manager.broadcast(raw_data)
                
                # 2. Process for Auto-Lap (Backend Logic)
                # Check if this message indicates a LAP COMPLETION
                if data.get("event") == "LapCompleted":
                    # Extract necessary info
                    # Expected format: { "event": "LapCompleted", "driver_name": "...", "car_model": "...", "track_name": "...", "lap_time": 123456, "sectors": [1,2,3] }
                    
                    driver_name = data.get("driver_name", "Unknown Driver")
                    car_model = data.get("car_model", "unknown_car")
                    track_name = data.get("track_name", "unknown_track")
                    lap_time = data.get("lap_time", 0)
                    
                    if lap_time > 0:
                        # Save to DB
                        db = SessionLocal()
                        try:
                            # Create SessionResult object manually (replacing crud)
                            new_session = models.SessionResult(
                                driver_name=driver_name,
                                car_model=car_model,
                                track_name=track_name,
                                best_lap=lap_time,
                                date=datetime.now(timezone.utc),
                                session_type="practice",
                                track_config=None
                            )
                            db.add(new_session)
                            db.commit()
                            db.refresh(new_session)
                            
                            logger.info(f"Auto-saved lap for {driver_name}: {lap_time}ms")
                        finally:
                            db.close()
                            
            except json.JSONDecodeError:
                pass # Ignore invalid JSON
            except Exception:
                logger.exception("Error processing agent message")
                continue
    except WebSocketDisconnect:
        manager.disconnect_agent(websocket)
    except Exception as e:
        logger.error(f"Agent WS Context Error: {e}", exc_info=True)
        manager.disconnect_agent(websocket)
