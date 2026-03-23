from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import os
import random

from .. import models, schemas, database
from .auth import require_admin_or_public_token, require_admin_or_public_token_or_kiosk
from .websockets import manager
from ..security.api_keys import is_client_token_allowed

logger = logging.getLogger("api.lobby")

router = APIRouter(
    prefix="/lobby",
    tags=["lobby"],
)

# L-001: Port allocation constants
LOBBY_PORT_RANGE_START = int(os.getenv("LOBBY_PORT_START", "9600"))
LOBBY_PORT_RANGE_END = int(os.getenv("LOBBY_PORT_END", "9699"))
LOBBY_PORT_RANGE = LOBBY_PORT_RANGE_END - LOBBY_PORT_RANGE_START + 1
LOBBY_WAIT_TIMEOUT_SECONDS = int(os.getenv("LOBBY_WAIT_TIMEOUT_SECONDS", "300"))
LOBBY_CLEANUP_MIN_INTERVAL_SECONDS = int(os.getenv("LOBBY_CLEANUP_MIN_INTERVAL_SECONDS", "30"))
PORT_RESERVATION_STALE_SECONDS = int(os.getenv("LOBBY_PORT_RESERVATION_STALE_SECONDS", "120"))
ACTIVE_LOBBY_STATUSES = ("waiting", "starting", "running")
_last_orphan_cleanup_at: datetime | None = None


def _is_admin(user_or_client: object) -> bool:
    return hasattr(user_or_client, "role") and getattr(user_or_client, "role") == "admin"


def _is_kiosk_client(user_or_client: object) -> bool:
    return user_or_client == "kiosk"


def _normalize_kiosk_code(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _require_client_scope(user_or_client: object, required_scope: str) -> None:
    if _is_admin(user_or_client):
        return
    if _is_kiosk_client(user_or_client):
        if required_scope == "kiosk:control":
            return
        raise HTTPException(status_code=403, detail="Kiosk client missing required scope")
    token = None if user_or_client in (None, "public") else str(user_or_client)
    if not is_client_token_allowed(token=token, required_scopes=(required_scope,)):
        raise HTTPException(status_code=403, detail="Client token missing required scope")


def _require_kiosk_access(station: Optional[models.Station], kiosk_code: Optional[str], user_or_client: object) -> None:
    if _is_admin(user_or_client):
        return
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if not station.is_kiosk_mode:
        raise HTTPException(status_code=403, detail="Kiosk mode disabled for station")
    if _normalize_kiosk_code(station.kiosk_code) != _normalize_kiosk_code(kiosk_code):
        raise HTTPException(status_code=403, detail="Invalid kiosk code")


def _get_timeout_remaining_seconds(lobby: models.Lobby) -> Optional[int]:
    if lobby.status not in {"waiting", "starting"} or not lobby.created_at:
        return None
    created_at = lobby.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    elapsed = int((datetime.now(timezone.utc) - created_at).total_seconds())
    return max(0, LOBBY_WAIT_TIMEOUT_SECONDS - elapsed)


def _build_lobby_payload(lobby: models.Lobby, players: Optional[list[schemas.LobbyPlayer]] = None) -> schemas.Lobby:
    return schemas.Lobby(
        id=lobby.id,
        name=lobby.name,
        status=lobby.status,
        host_station_id=lobby.host_station_id,
        track=lobby.track,
        car=lobby.car,
        session_type=lobby.session_type,
        max_players=lobby.max_players,
        laps=lobby.laps,
        duration_minutes=lobby.duration_minutes,
        port=lobby.port,
        server_ip=lobby.server_ip,
        created_at=lobby.created_at,
        started_at=lobby.started_at,
        timeout_remaining_seconds=_get_timeout_remaining_seconds(lobby),
        player_count=len(lobby.players),
        players=players or [],
    )


def _cleanup_stale_port_reservations(db: Session) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=PORT_RESERVATION_STALE_SECONDS)
    reservations = db.query(models.LobbyPortReservation).all()
    removed = 0

    for reservation in reservations:
        lobby = None
        if reservation.lobby_id is not None:
            lobby = db.query(models.Lobby).filter(models.Lobby.id == reservation.lobby_id).first()

        if reservation.lobby_id is not None and (not lobby or lobby.status not in ACTIVE_LOBBY_STATUSES):
            db.delete(reservation)
            removed += 1
            continue

        reserved_at = reservation.reserved_at
        if reserved_at and reserved_at.tzinfo is None:
            reserved_at = reserved_at.replace(tzinfo=timezone.utc)
        if reservation.lobby_id is None and reserved_at and reserved_at < cutoff:
            db.delete(reservation)
            removed += 1

    if removed:
        db.flush()
    return removed


def reserve_lobby_port(db: Session) -> models.LobbyPortReservation:
    _cleanup_stale_port_reservations(db)

    candidate_ports = list(range(LOBBY_PORT_RANGE_START, LOBBY_PORT_RANGE_END + 1))
    random.shuffle(candidate_ports)

    for port in candidate_ports:
        try:
            with db.begin_nested():
                reservation = models.LobbyPortReservation(port=port)
                db.add(reservation)
                db.flush()
            return db.query(models.LobbyPortReservation).filter(models.LobbyPortReservation.port == port).one()
        except IntegrityError:
            continue

    raise HTTPException(
        status_code=503,
        detail="No available ports for lobby. Please try again later."
    )


def _release_port_reservation(db: Session, lobby: models.Lobby | None) -> None:
    if not lobby or lobby.port is None:
        return
    db.query(models.LobbyPortReservation).filter(
        (models.LobbyPortReservation.lobby_id == lobby.id) |
        (models.LobbyPortReservation.port == lobby.port)
    ).delete(synchronize_session=False)


def _maybe_cleanup_orphan_lobbies(db: Session) -> int:
    global _last_orphan_cleanup_at

    now = datetime.now(timezone.utc)
    if _last_orphan_cleanup_at is not None:
        elapsed = (now - _last_orphan_cleanup_at).total_seconds()
        if elapsed < LOBBY_CLEANUP_MIN_INTERVAL_SECONDS:
            return 0

    updated = _cleanup_orphan_lobbies(db)
    _last_orphan_cleanup_at = now
    return updated


def _cleanup_orphan_lobbies(db: Session) -> int:
    """
    Cancel lobbies whose host is offline or stale.
    Returns number of lobbies updated.
    OPTIMIZED: L-003 - Now with index support
    """
    grace_seconds = int(os.getenv("LOBBY_ORPHAN_SECONDS", "120"))
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=grace_seconds)

    # Use index-efficient query
    lobbies = db.query(models.Lobby).filter(
        models.Lobby.status.in_(ACTIVE_LOBBY_STATUSES)
    ).all()

    updated = 0
    for lobby in lobbies:
        host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
        if not host:
            _release_port_reservation(db, lobby)
            lobby.status = "cancelled"
            lobby.finished_at = datetime.now(timezone.utc)
            updated += 1
            continue

        last_seen = host.last_seen
        if host.is_online is False or (last_seen and last_seen < cutoff):
            _release_port_reservation(db, lobby)
            lobby.status = "cancelled"
            lobby.finished_at = datetime.now(timezone.utc)
            updated += 1

    if updated:
        db.commit()
    return updated


@router.post("/create", response_model=schemas.Lobby)
async def create_lobby(
    lobby_data: schemas.LobbyCreate,
    host_station_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token_or_kiosk),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    """
    Create a new multiplayer lobby. The host station will run acServer.exe.
    """
    # Prefer station_id from body if host_station_id is not provided (Kiosk flow)
    active_host_id = host_station_id or lobby_data.station_id
    if not active_host_id:
        raise HTTPException(status_code=400, detail="Missing host station ID")

    # Verify host station exists and is online
    host = db.query(models.Station).filter(models.Station.id == active_host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host station not found")
    if not host.is_online:
        raise HTTPException(status_code=400, detail="Host station must be online")
    if not host.ip_address:
        raise HTTPException(status_code=400, detail="Host station has no IP address")
    
    # SECURITY: Validate kiosk_code for non-admin users
    _require_kiosk_access(host, kiosk_code, user_or_client)
    
    # L-001: Reserve port atomically before creating the lobby.
    reservation = reserve_lobby_port(db)
    
    # Create lobby
    lobby = models.Lobby(
        name=lobby_data.name,
        host_station_id=active_host_id,
        track=lobby_data.track,
        car=lobby_data.car,
        session_type=lobby_data.session_type or "race",
        max_players=lobby_data.max_players,
        laps=lobby_data.laps,
        duration_minutes=lobby_data.duration,
        port=reservation.port,
        server_ip=host.ip_address,
        status="waiting"
    )
    
    db.add(lobby)
    db.flush()
    reservation.lobby_id = lobby.id
    
    # Add host as first player
    lobby.players.append(host)
    db.commit()
    db.refresh(lobby)
    
    logger.info(f"Lobby created: {lobby.name} (ID: {lobby.id}) by station {host_station_id}")
    
    return _build_lobby_payload(lobby)


@router.get("/list", response_model=List[schemas.Lobby])
async def list_lobbies(
    status: str = "active",
    db: Session = Depends(database.get_db),
    _auth: object = Depends(require_admin_or_public_token),
):
    """
    List available lobbies. Default 'active' shows waiting and running.
    """
    _maybe_cleanup_orphan_lobbies(db)
    query = db.query(models.Lobby)
    if status == "active":
        query = query.filter(models.Lobby.status.in_(["waiting", "running"]))
    elif status != "all":
        query = query.filter(models.Lobby.status == status)
    
    lobbies = query.order_by(models.Lobby.created_at.desc()).all()
    
    result = []
    for lobby in lobbies:
        result.append(_build_lobby_payload(lobby))
    
    return result


@router.get("/{lobby_id}", response_model=schemas.Lobby)
async def get_lobby(
    lobby_id: int,
    db: Session = Depends(database.get_db),
    _auth: object = Depends(require_admin_or_public_token),
):
    """Get detailed lobby info including players."""
    _maybe_cleanup_orphan_lobbies(db)
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    # Query association table for extra data? 
    # SQLAlchemy handles association attributes via the association object if mapped properly, 
    # but here we used a Table `lobby_players`. 
    # We need to query the table directly to get 'ready' status for each station.
    
    stmt = models.lobby_players.select().where(models.lobby_players.c.lobby_id == lobby_id)
    results = db.execute(stmt).fetchall()
    
    # Map station_id to ready status
    ready_map = {row.station_id: row.ready for row in results}

    players = []
    for idx, station in enumerate(lobby.players):
        players.append(schemas.LobbyPlayer(
            station_id=station.id,
            station_name=station.name,
            slot=idx,
            ready=ready_map.get(station.id, False)
        ))
    
    return _build_lobby_payload(lobby, players=players)


@router.post("/{lobby_id}/ready")
async def toggle_ready(
    lobby_id: int,
    station_id: int,
    is_ready: bool,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token_or_kiosk),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    """Toggle ready status for a station in the lobby."""
    # Verify lobby exists
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")

    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    _require_kiosk_access(station, kiosk_code, user_or_client)
    _require_client_scope(user_or_client, "kiosk:control")

    # Update association table
    stmt = models.lobby_players.update().where(
        (models.lobby_players.c.lobby_id == lobby_id) & 
        (models.lobby_players.c.station_id == station_id)
    ).values(ready=is_ready)
    
    result = db.execute(stmt)
    db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Player not found in lobby")
        
    return {"status": "updated", "ready": is_ready}


@router.post("/{lobby_id}/join")
async def join_lobby(
    lobby_id: int,
    join_data: schemas.LobbyJoin,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token_or_kiosk),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    """Join an existing lobby."""
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    if lobby.status not in ["waiting", "running"]:
        raise HTTPException(status_code=400, detail="Lobby is not accepting players")

    station = db.query(models.Station).filter(models.Station.id == join_data.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    _require_kiosk_access(station, kiosk_code, user_or_client)
    _require_client_scope(user_or_client, "kiosk:control")

    if not station.is_online:
        raise HTTPException(status_code=400, detail="Station is offline")

    # Check if already in lobby
    if station in lobby.players:
        # If running, we might want to "re-join" (send command again) just in case
        if lobby.status == "running":
             # Logic below will handle sending the command if we don't return here.
             # But usually we return status. Let's pass through if running? 
             # No, standard is to return status. Let's assume client handles "already_joined".
             pass
        else:
             return {"status": "already_joined", "lobby_id": lobby_id}
    else:
        if len(lobby.players) >= lobby.max_players:
            raise HTTPException(status_code=400, detail="Lobby is full")
        lobby.players.append(station)
        db.commit()
    
    logger.info(f"Station {station.name} joined lobby {lobby.name} (Status: {lobby.status})")

    # If lobby is already running, send join command immediately
    slot_idx = next((idx for idx, p in enumerate(lobby.players) if p.id == station.id), len(lobby.players) - 1)
    if lobby.status == "running":
        # Rejoin uses the player's real slot; late joiners get appended slot.
        ok = await manager.send_command(station.id, {
            "command": "join_lobby",
            "lobby_id": lobby.id,
            "server_ip": lobby.server_ip,
            "port": lobby.port,
            "track": lobby.track,
            "car": lobby.car,
            "slot": slot_idx
        })
        if ok:
            logger.info(f"Sent immediate join_lobby to {station.name} (Late Join)")
        else:
            logger.warning(f"Station {station.id} has no active Agent connection for late join")

    return {"status": "joined", "lobby_id": lobby_id, "slot": slot_idx}


@router.post("/{lobby_id}/start")
async def start_lobby(
    lobby_id: int,
    requesting_station_id: int,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token_or_kiosk),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    """
    Start the race. Only host can start.
    This sends create_lobby command to host and join_lobby to all players.
    """
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")

    requesting_station = db.query(models.Station).filter(models.Station.id == requesting_station_id).first()
    _require_kiosk_access(requesting_station, kiosk_code, user_or_client)
    _require_client_scope(user_or_client, "kiosk:control")
    
    if lobby.host_station_id != requesting_station_id:
        raise HTTPException(status_code=403, detail="Only host can start the race")
    
    if lobby.status != "waiting":
        raise HTTPException(status_code=400, detail="Lobby already started or finished")
    
    if len(lobby.players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")

    # Get host station
    host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
    if not host or not host.is_online:
        raise HTTPException(status_code=400, detail="Host station is offline")

    # Enforce ready players only. Unready players are auto-removed to allow partial participation.
    stmt = models.lobby_players.select().where(models.lobby_players.c.lobby_id == lobby_id)
    results = db.execute(stmt).fetchall()
    ready_map = {row.station_id: row.ready for row in results}
    ready_players = [p for p in lobby.players if ready_map.get(p.id, False)]
    unready_players = [p for p in lobby.players if not ready_map.get(p.id, False)]

    if host.id not in [p.id for p in ready_players]:
        raise HTTPException(status_code=400, detail="Host must be ready to start")
    if len(ready_players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 ready players to start")

    # Remove unready players from lobby before starting
    if unready_players:
        for p in unready_players:
            try:
                lobby.players.remove(p)
            except Exception:
                pass
        db.commit()

    initial_status = lobby.status
    initial_started_at = lobby.started_at

    # Update status only after all pre-start validations pass.
    lobby.status = "starting"
    lobby.started_at = datetime.now(timezone.utc)
    db.commit()
    
    # Send create_lobby command to host agent
    ok = await manager.send_command(host.id, {
        "command": "create_lobby",
        "lobby_id": lobby.id,
        "track": lobby.track,
        "car": lobby.car,
        "laps": lobby.laps,
        "max_players": lobby.max_players,
        "port": lobby.port,
        "players": [{"name": s.name, "slot": idx} for idx, s in enumerate(lobby.players)]
    })
    if not ok:
        # L-004: Rollback on failure
        logger.error(f"Failed to send create_lobby to host {host.name}, rolling back")
        lobby.status = initial_status
        lobby.started_at = initial_started_at
        db.commit()
        raise HTTPException(status_code=500, detail="Host Agent not connected. Lobby rolled back.")
    
    logger.info(f"Sent create_lobby to host {host.name}")
    
    # Send join_lobby command to all other players
    failed_stations = []
    for idx, station in enumerate(lobby.players):
        if station.id == lobby.host_station_id:
            continue  # Skip host
        
        ok = await manager.send_command(station.id, {
            "command": "join_lobby",
            "lobby_id": lobby.id,
            "server_ip": lobby.server_ip,
            "port": lobby.port,
            "track": lobby.track,
            "car": lobby.car,
            "slot": idx,
            "is_spectator": False
        })
        if ok:
            logger.info(f"Sent join_lobby to {station.name}")
        else:
            logger.warning(f"Station {station.id} agent not connected, join_lobby skipped")
            failed_stations.append(station.id)
    
    # NEW: Automatically join TV Mode stations as spectators
    tv_stations = db.query(models.Station).filter(
        models.Station.is_tv_mode == True,
        models.Station.is_online == True
    ).all()
    
    for tv_station in tv_stations:
        # Don't send if already in lobby as player (unlikely but safe)
        if any(p.id == tv_station.id for p in lobby.players):
            continue
            
        ok = await manager.send_command(tv_station.id, {
            "command": "join_lobby",
            "lobby_id": lobby.id,
            "server_ip": lobby.server_ip,
            "port": lobby.port,
            "track": lobby.track,
            "car": lobby.car,
            "is_spectator": True
        })
        if ok:
            logger.info(f"Sent join_lobby (Spectator) to TV Station {tv_station.name}")
        else:
            logger.warning(f"TV Station {tv_station.id} agent not connected, spectator join skipped")
    
    # L-004: All commands sent, now mark as running
    lobby.status = "running"
    db.commit()
    
    return {"status": "started", "players": len(lobby.players), "failed_players": failed_stations}


@router.delete("/{lobby_id}")
async def cancel_lobby(
    lobby_id: int,
    requesting_station_id: int,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token_or_kiosk),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    """Cancel/delete a lobby. Only host can cancel."""
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")

    requesting_station = db.query(models.Station).filter(models.Station.id == requesting_station_id).first()
    _require_kiosk_access(requesting_station, kiosk_code, user_or_client)
    _require_client_scope(user_or_client, "kiosk:control")
    
    if lobby.host_station_id != requesting_station_id:
        raise HTTPException(status_code=403, detail="Only host can cancel")
    
    # If running, send stop command to host
    if lobby.status == "running":
        host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
        if host:
            try:
                await manager.send_command(host.id, {"command": "stop_lobby"})
            except Exception:
                pass
    
    _release_port_reservation(db, lobby)
    lobby.status = "cancelled"
    db.commit()
    
    return {"status": "cancelled", "lobby_id": lobby_id}
