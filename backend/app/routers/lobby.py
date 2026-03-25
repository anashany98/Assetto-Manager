import asyncio

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
        track_layout=lobby.track_layout,
        car=lobby.car,
        allowed_cars=lobby.allowed_cars,
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


def _get_lobby_player_rows(db: Session, lobby_id: int):
    stmt = models.lobby_players.select().where(models.lobby_players.c.lobby_id == lobby_id)
    return db.execute(stmt).fetchall()


def _get_lobby_player_state(rows) -> tuple[dict[int, bool], dict[int, int], dict[int, str], list[int], dict[int, str]]:
    ordered_rows = sorted(
        rows,
        key=lambda row: (
            row.slot is None,
            row.slot if row.slot is not None else 10_000,
            row.station_id,
        ),
    )
    ready_map: dict[int, bool] = {}
    slot_map: dict[int, int] = {}
    driver_name_map: dict[int, str] = {}
    car_map: dict[int, str] = {}
    ordered_station_ids: list[int] = []

    for index, row in enumerate(ordered_rows):
        station_id = int(row.station_id)
        ready_map[station_id] = bool(row.ready)
        slot_map[station_id] = int(row.slot) if row.slot is not None else index
        driver_name_map[station_id] = (getattr(row, "driver_name", None) or "").strip()
        car_map[station_id] = (getattr(row, "car", None) or "").strip()
        ordered_station_ids.append(station_id)

    return ready_map, slot_map, driver_name_map, ordered_station_ids, car_map


def _ordered_lobby_players(players: list[models.Station], ordered_station_ids: list[int]) -> list[models.Station]:
    station_map = {station.id: station for station in players}
    ordered = [station_map[station_id] for station_id in ordered_station_ids if station_id in station_map]
    ordered_ids = {station.id for station in ordered}
    ordered.extend(station for station in players if station.id not in ordered_ids)
    return ordered


def _build_lobby_players(db: Session, lobby: models.Lobby) -> list[schemas.LobbyPlayer]:
    rows = _get_lobby_player_rows(db, lobby.id)
    ready_map, slot_map, _, ordered_station_ids, car_map = _get_lobby_player_state(rows)
    ordered_players = _ordered_lobby_players(list(lobby.players), ordered_station_ids)

    players: list[schemas.LobbyPlayer] = []
    for fallback_slot, station in enumerate(ordered_players):
        players.append(
            schemas.LobbyPlayer(
                station_id=station.id,
                station_name=station.name,
                slot=slot_map.get(station.id, fallback_slot),
                ready=ready_map.get(station.id, False),
                car=car_map.get(station.id) or None,
            )
        )
    return players


def _next_lobby_slot(db: Session, lobby_id: int) -> int:
    rows = _get_lobby_player_rows(db, lobby_id)
    _, slot_map, _, _, _ = _get_lobby_player_state(rows)
    return max(slot_map.values(), default=-1) + 1


def _set_lobby_player_metadata(
    db: Session,
    lobby_id: int,
    station_id: int,
    *,
    slot: Optional[int] = None,
    ready: Optional[bool] = None,
    driver_name: Optional[str] = None,
    car: Optional[str] = None,
    joined_at: Optional[datetime] = None,
) -> None:
    values: dict[str, object] = {}
    if slot is not None:
        values["slot"] = slot
    if ready is not None:
        values["ready"] = ready
    if driver_name is not None:
        values["driver_name"] = driver_name.strip() or None
    if car is not None:
        values["car"] = car.strip() or None
    if joined_at is not None:
        values["joined_at"] = joined_at
    if not values:
        return
    db.execute(
        models.lobby_players.update().where(
            (models.lobby_players.c.lobby_id == lobby_id)
            & (models.lobby_players.c.station_id == station_id)
        ).values(**values)
    )


def _reassign_lobby_slots(db: Session, lobby_id: int, station_ids: list[int]) -> None:
    for slot, station_id in enumerate(station_ids):
        _set_lobby_player_metadata(db, lobby_id, station_id, slot=slot)


def _lobby_has_timed_out(lobby: models.Lobby) -> bool:
    remaining = _get_timeout_remaining_seconds(lobby)
    return lobby.status in {"waiting", "starting"} and remaining is not None and remaining <= 0


def _cancel_lobby_record(db: Session, lobby: models.Lobby, reason: str) -> None:
    _release_port_reservation(db, lobby)
    lobby.status = "cancelled"
    lobby.finished_at = datetime.now(timezone.utc)
    logger.info("Lobby %s cancelled (%s)", lobby.id, reason)


async def _stop_lobby_participants(
    lobby: models.Lobby,
    *,
    participant_station_ids: Optional[list[int]] = None,
) -> None:
    station_ids = participant_station_ids or [int(station.id) for station in lobby.players]
    ordered_ids: list[int] = []
    seen_ids: set[int] = set()
    for station_id in station_ids:
        station_id = int(station_id)
        if station_id in seen_ids:
            continue
        seen_ids.add(station_id)
        ordered_ids.append(station_id)

    commands: list[asyncio.Future] = []
    for station_id in ordered_ids:
        if station_id == lobby.host_station_id:
            commands.append(manager.send_command(station_id, {"command": "stop_lobby"}))
        else:
            commands.append(manager.send_command(station_id, {"command": "stop_session"}))

    if not commands:
        return

    results = await asyncio.gather(*commands, return_exceptions=True)
    for station_id, result in zip(ordered_ids, results):
        if isinstance(result, Exception):
            logger.warning("Lobby cleanup command failed for station %s: %s", station_id, result)


async def _cancel_lobby_with_cleanup(
    db: Session,
    lobby: models.Lobby,
    *,
    reason: str,
    participant_station_ids: Optional[list[int]] = None,
) -> None:
    if lobby.status in {"starting", "running"}:
        await _stop_lobby_participants(lobby, participant_station_ids=participant_station_ids)
    _cancel_lobby_record(db, lobby, reason)
    db.commit()


async def _expire_lobby_if_needed(db: Session, lobby: models.Lobby | None) -> bool:
    if not lobby or not _lobby_has_timed_out(lobby):
        return False
    await _cancel_lobby_with_cleanup(db, lobby, reason="timeout")
    db.refresh(lobby)
    return True


async def _cleanup_expired_lobbies(db: Session) -> int:
    lobbies = db.query(models.Lobby).filter(models.Lobby.status.in_(["waiting", "starting"])).all()
    expired = [lobby for lobby in lobbies if _lobby_has_timed_out(lobby)]
    if not expired:
        return 0

    for lobby in expired:
        await _cancel_lobby_with_cleanup(db, lobby, reason="timeout")

    return len(expired)


def _build_join_lobby_command(
    lobby: models.Lobby,
    station: models.Station,
    *,
    slot: Optional[int],
    driver_name: Optional[str],
    car: Optional[str] = None,
    is_spectator: bool,
) -> dict:
    payload = {
        "command": "join_lobby",
        "lobby_id": lobby.id,
        "server_ip": lobby.server_ip,
        "port": lobby.port,
        "track": lobby.track,
        "track_layout": lobby.track_layout,
        "car": car or lobby.car,  # Per-player car, fallback to lobby default
        "ac_path": station.ac_path,
        "is_spectator": is_spectator,
    }
    if slot is not None:
        payload["slot"] = slot
    if driver_name:
        payload["driver_name"] = driver_name
    return payload


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


async def _maybe_cleanup_orphan_lobbies(db: Session) -> int:
    global _last_orphan_cleanup_at

    now = datetime.now(timezone.utc)
    if _last_orphan_cleanup_at is not None:
        elapsed = (now - _last_orphan_cleanup_at).total_seconds()
        if elapsed < LOBBY_CLEANUP_MIN_INTERVAL_SECONDS:
            return 0

    updated = _cleanup_orphan_lobbies(db)
    updated += await _cleanup_expired_lobbies(db)
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
        if last_seen and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
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
        track_layout=lobby_data.track_layout,
        car=lobby_data.car,
        allowed_cars=lobby_data.allowed_cars or [lobby_data.car],
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
    db.flush()
    _set_lobby_player_metadata(
        db,
        lobby.id,
        host.id,
        slot=0,
        ready=False,
        car=lobby_data.car,
        driver_name=lobby_data.driver_name,
        joined_at=datetime.now(timezone.utc),
    )
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
    await _maybe_cleanup_orphan_lobbies(db)
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
    await _maybe_cleanup_orphan_lobbies(db)
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    await _expire_lobby_if_needed(db, lobby)
    return _build_lobby_payload(lobby, players=_build_lobby_players(db, lobby))


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
    if await _expire_lobby_if_needed(db, lobby):
        raise HTTPException(status_code=409, detail="Lobby expired")

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
    if await _expire_lobby_if_needed(db, lobby):
        raise HTTPException(status_code=409, detail="Lobby expired")
    
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
    slot_idx: Optional[int] = None
    if station in lobby.players:
        if lobby.status != "running":
            return {"status": "already_joined", "lobby_id": lobby_id}
        rows = _get_lobby_player_rows(db, lobby_id)
        _, slot_map, _, _, _ = _get_lobby_player_state(rows)
        slot_idx = slot_map.get(station.id)
        _set_lobby_player_metadata(
            db,
            lobby_id,
            station.id,
            car=join_data.car,
            driver_name=join_data.driver_name,
            joined_at=datetime.now(timezone.utc),
        )
        db.commit()
    else:
        if len(lobby.players) >= lobby.max_players:
            raise HTTPException(status_code=400, detail="Lobby is full")
        slot_idx = _next_lobby_slot(db, lobby_id)
        lobby.players.append(station)
        db.flush()
        _set_lobby_player_metadata(
            db,
            lobby_id,
            station.id,
            slot=slot_idx,
            ready=False,
            car=join_data.car,
            driver_name=join_data.driver_name,
            joined_at=datetime.now(timezone.utc),
        )
        db.commit()

    logger.info(f"Station {station.name} joined lobby {lobby.name} (Status: {lobby.status})")

    # If lobby is already running, send join command immediately
    if lobby.status == "running":
        rows = _get_lobby_player_rows(db, lobby_id)
        _, slot_map, driver_name_map, _, car_map = _get_lobby_player_state(rows)
        ok = await manager.send_command(
            station.id,
            _build_join_lobby_command(
                lobby,
                station,
                slot=slot_map.get(station.id, slot_idx),
                driver_name=driver_name_map.get(station.id) or station.name,
                car=car_map.get(station.id) or None,
                is_spectator=False,
            ),
        )
        if ok:
            logger.info(f"Sent immediate join_lobby to {station.name} (Late Join)")
        else:
            logger.warning(f"Station {station.id} has no active Agent connection for late join")

    return {"status": "joined", "lobby_id": lobby_id, "slot": slot_idx}


@router.post("/{lobby_id}/leave")
async def leave_lobby(
    lobby_id: int,
    leave_data: schemas.LobbyLeave,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token_or_kiosk),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    if await _expire_lobby_if_needed(db, lobby):
        return {"status": "cancelled", "lobby_id": lobby_id}

    station = db.query(models.Station).filter(models.Station.id == leave_data.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    _require_kiosk_access(station, kiosk_code, user_or_client)
    _require_client_scope(user_or_client, "kiosk:control")

    if station.id == lobby.host_station_id:
        await _cancel_lobby_with_cleanup(db, lobby, reason="host_left")
        return {"status": "cancelled", "lobby_id": lobby_id}

    if station not in lobby.players:
        return {"status": "not_in_lobby", "lobby_id": lobby_id}

    if lobby.status in {"starting", "running"}:
        try:
            await manager.send_command(station.id, {"command": "stop_session"})
        except Exception:
            logger.exception("Failed to stop player session while leaving lobby")

    lobby.players.remove(station)
    db.commit()
    logger.info("Station %s left lobby %s", station.id, lobby.id)
    return {"status": "left", "lobby_id": lobby_id, "remaining_players": len(lobby.players)}


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
    if await _expire_lobby_if_needed(db, lobby):
        raise HTTPException(status_code=409, detail="Lobby expired")

    requesting_station = db.query(models.Station).filter(models.Station.id == requesting_station_id).first()
    _require_kiosk_access(requesting_station, kiosk_code, user_or_client)
    _require_client_scope(user_or_client, "kiosk:control")
    
    if lobby.host_station_id != requesting_station_id:
        raise HTTPException(status_code=403, detail="Only host can start the race")
    
    if lobby.status != "waiting":
        raise HTTPException(status_code=400, detail="Lobby already started or finished")
    
    # Get host station
    host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
    if not host or not host.is_online:
        raise HTTPException(status_code=400, detail="Host station is offline")

    # Enforce ready players only. Unready players are auto-removed to allow partial participation.
    player_rows = _get_lobby_player_rows(db, lobby_id)
    ready_map, slot_map, driver_name_map, ordered_station_ids, car_map = _get_lobby_player_state(player_rows)
    ordered_players = _ordered_lobby_players(list(lobby.players), ordered_station_ids)
    ready_players = [player for player in ordered_players if ready_map.get(player.id, False)]
    unready_players = [player for player in ordered_players if not ready_map.get(player.id, False)]

    if host.id not in [p.id for p in ready_players]:
        raise HTTPException(status_code=400, detail="Host must be ready to start")

    # Remove unready players from lobby before starting
    if unready_players:
        for p in unready_players:
            try:
                lobby.players.remove(p)
            except Exception:
                pass
        db.commit()

    _reassign_lobby_slots(db, lobby_id, [player.id for player in ready_players])
    db.commit()
    player_rows = _get_lobby_player_rows(db, lobby_id)
    ready_map, slot_map, driver_name_map, ordered_station_ids, car_map = _get_lobby_player_state(player_rows)
    ordered_players = _ordered_lobby_players(list(lobby.players), ordered_station_ids)
    ready_players = [player for player in ordered_players if ready_map.get(player.id, False)]

    # Update status only after all pre-start validations pass.
    lobby.status = "starting"
    lobby.started_at = datetime.now(timezone.utc)
    db.commit()

    # Send create_lobby command to host agent (includes all allowed cars for AC server config)
    ok = await manager.send_command(host.id, {
        "command": "create_lobby",
        "lobby_id": lobby.id,
        "track": lobby.track,
        "track_layout": lobby.track_layout,
        "car": lobby.car,
        "allowed_cars": lobby.allowed_cars or [lobby.car],
        "laps": lobby.laps,
        "max_players": lobby.max_players,
        "port": lobby.port,
        "ac_path": host.ac_path,
        "players": [
            {
                "name": driver_name_map.get(player.id) or player.name,
                "slot": slot_map.get(player.id, idx),
                "car": car_map.get(player.id) or lobby.car,
            }
            for idx, player in enumerate(ready_players)
        ]
    })
    if not ok:
        logger.error(f"Failed to send create_lobby to host {host.name}, cancelling lobby")
        lobby.started_at = None
        _cancel_lobby_record(db, lobby, "host_server_start_failed")
        db.commit()
        raise HTTPException(status_code=500, detail="Host Agent not connected. Lobby cancelled.")

    logger.info(f"Sent create_lobby to host {host.name}")

    host_join_ok = await manager.send_command(
        host.id,
        _build_join_lobby_command(
            lobby,
            host,
            slot=slot_map.get(host.id, 0),
            driver_name=driver_name_map.get(host.id) or host.name,
            car=car_map.get(host.id) or None,
            is_spectator=False,
        ),
    )
    if not host_join_ok:
        logger.error(f"Failed to send join_lobby to host {host.name}, cancelling lobby")
        lobby.started_at = None
        await _cancel_lobby_with_cleanup(
            db,
            lobby,
            reason="host_client_join_failed",
            participant_station_ids=[host.id],
        )
        raise HTTPException(status_code=500, detail="Host AC client failed to join. Lobby cancelled.")

    logger.info(f"Sent join_lobby to host {host.name}")

    # Send join_lobby command to all other players in parallel.
    other_ready_players = [station for station in ready_players if station.id != lobby.host_station_id]
    failed_stations = []
    successful_station_ids = [host.id]
    if other_ready_players:
        join_results = await asyncio.gather(
            *[
                manager.send_command(
                    station.id,
                    _build_join_lobby_command(
                        lobby,
                        station,
                        slot=slot_map.get(station.id, idx),
                        driver_name=driver_name_map.get(station.id) or station.name,
                        car=car_map.get(station.id) or None,
                        is_spectator=False,
                    ),
                )
                for idx, station in enumerate(other_ready_players)
            ],
            return_exceptions=True,
        )

        for station, result in zip(other_ready_players, join_results):
            if result is True:
                logger.info(f"Sent join_lobby to {station.name}")
                successful_station_ids.append(station.id)
                continue
            if isinstance(result, Exception):
                logger.warning(f"Station {station.id} join_lobby raised an error: {result}")
            else:
                logger.warning(f"Station {station.id} agent not connected, join_lobby skipped")
            failed_stations.append(station.id)

    if failed_stations:
        logger.error("Cancelling lobby %s because some players failed to join: %s", lobby.id, failed_stations)
        lobby.started_at = None
        await _cancel_lobby_with_cleanup(
            db,
            lobby,
            reason="player_join_failed",
            participant_station_ids=successful_station_ids + failed_stations,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Some simulators failed to join the lobby. Cancelled lobby. Failed stations: {failed_stations}",
        )
    
    # NEW: Automatically join TV Mode stations as spectators
    tv_stations = db.query(models.Station).filter(
        models.Station.is_tv_mode == True,
        models.Station.is_online == True
    ).all()
    
    for tv_station in tv_stations:
        # Don't send if already in lobby as player (unlikely but safe)
        if any(p.id == tv_station.id for p in lobby.players):
            continue
             
        ok = await manager.send_command(
            tv_station.id,
            _build_join_lobby_command(
                lobby,
                tv_station,
                slot=None,
                driver_name="TV Broadcast",
                is_spectator=True,
            ),
        )
        if ok:
            logger.info(f"Sent join_lobby (Spectator) to TV Station {tv_station.name}")
        else:
            logger.warning(f"TV Station {tv_station.id} agent not connected, spectator join skipped")
    
    # L-004: All commands sent, now mark as running
    lobby.status = "running"
    db.commit()
    
    return {"status": "started", "players": len(ready_players), "failed_players": failed_stations}


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
    
    await _cancel_lobby_with_cleanup(db, lobby, reason="manual_cancel")
    
    return {"status": "cancelled", "lobby_id": lobby_id}
