from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import os

from .. import models, schemas, database
from .auth import require_admin_or_public_token
from .websockets import manager
from ..security.api_keys import is_client_token_allowed

logger = logging.getLogger("api.lobby")

router = APIRouter(
    prefix="/lobby",
    tags=["lobby"],
)

def get_db():
    return database.get_db()


def _is_admin(user_or_client: object) -> bool:
    return hasattr(user_or_client, "role") and getattr(user_or_client, "role") == "admin"


def _require_client_scope(user_or_client: object, required_scope: str) -> None:
    if _is_admin(user_or_client):
        return
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
    if not kiosk_code or station.kiosk_code != kiosk_code:
        raise HTTPException(status_code=403, detail="Invalid kiosk code")

def _cleanup_orphan_lobbies(db: Session) -> int:
    """
    Cancel lobbies whose host is offline or stale.
    Returns number of lobbies updated.
    """
    grace_seconds = int(os.getenv("LOBBY_ORPHAN_SECONDS", "120"))
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=grace_seconds)

    lobbies = db.query(models.Lobby).filter(
        models.Lobby.status.in_(["waiting", "starting", "running"])
    ).all()

    updated = 0
    for lobby in lobbies:
        host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
        if not host:
            lobby.status = "cancelled"
            lobby.finished_at = datetime.now(timezone.utc)
            updated += 1
            continue

        last_seen = host.last_seen
        if host.is_online is False or (last_seen and last_seen < cutoff):
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
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
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
        raise HTTPException(status_code=404, detail=f"Station {active_host_id} not found")

    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(host, kiosk_code, user_or_client)

    if not host.is_online:
        raise HTTPException(status_code=400, detail="Host station must be online")
    if not host.ip_address:
        raise HTTPException(status_code=400, detail="Host station has no IP address")
    
    # Find available port (9600 + lobby_id offset)
    last_lobby = db.query(models.Lobby).order_by(models.Lobby.id.desc()).first()
    next_id = (last_lobby.id + 1) if last_lobby else 1
    port = 9600 + (next_id % 100)
    
    # Create lobby
    lobby = models.Lobby(
        name=lobby_data.name,
        host_station_id=active_host_id,
        track=lobby_data.track,
        car=lobby_data.car,
        max_players=lobby_data.max_players,
        laps=lobby_data.laps,
        duration_minutes=lobby_data.duration,
        port=port,
        server_ip=host.ip_address,
        status="waiting"
    )
    
    db.add(lobby)
    db.commit()
    db.refresh(lobby)
    
    # Add host as first player
    # Check if we should use association table directly or relationship
    lobby.players.append(host)
    db.commit()
    
    logger.info(f"Lobby created: {lobby.name} (ID: {lobby.id}) by station {host_station_id}")
    
    return schemas.Lobby(
        id=lobby.id,
        name=lobby.name,
        status=lobby.status,
        host_station_id=lobby.host_station_id,
        track=lobby.track,
        car=lobby.car,
        max_players=lobby.max_players,
        laps=lobby.laps,
        duration_minutes=lobby.duration_minutes,
        port=lobby.port,
        server_ip=lobby.server_ip,
        created_at=lobby.created_at,
        started_at=lobby.started_at,
        player_count=len(lobby.players),
        players=[]
    )


@router.get("/list", response_model=List[schemas.Lobby])
async def list_lobbies(
    status: str = "active",
    db: Session = Depends(database.get_db),
    _auth: object = Depends(require_admin_or_public_token),
):
    """
    List available lobbies. Default 'active' shows waiting and running.
    """
    _cleanup_orphan_lobbies(db)
    query = db.query(models.Lobby)
    if status == "active":
        query = query.filter(models.Lobby.status.in_(["waiting", "running"]))
    elif status != "all":
        query = query.filter(models.Lobby.status == status)
    
    lobbies = query.order_by(models.Lobby.created_at.desc()).all()
    
    result = []
    for lobby in lobbies:
        result.append(schemas.Lobby(
            id=lobby.id,
            name=lobby.name,
            status=lobby.status,
            host_station_id=lobby.host_station_id,
            track=lobby.track,
            car=lobby.car,
            max_players=lobby.max_players,
            laps=lobby.laps,
            duration_minutes=lobby.duration_minutes,
            port=lobby.port,
            server_ip=lobby.server_ip,
            created_at=lobby.created_at,
            started_at=lobby.started_at,
            player_count=len(lobby.players),
            players=[]
        ))
    
    return result


@router.get("/{lobby_id}", response_model=schemas.Lobby)
async def get_lobby(
    lobby_id: int,
    db: Session = Depends(database.get_db),
    _auth: object = Depends(require_admin_or_public_token),
):
    """Get detailed lobby info including players."""
    _cleanup_orphan_lobbies(db)
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
    
    return schemas.Lobby(
        id=lobby.id,
        name=lobby.name,
        status=lobby.status,
        host_station_id=lobby.host_station_id,
        track=lobby.track,
        car=lobby.car,
        max_players=lobby.max_players,
        laps=lobby.laps,
        duration_minutes=lobby.duration_minutes,
        port=lobby.port,
        server_ip=lobby.server_ip,
        created_at=lobby.created_at,
        started_at=lobby.started_at,
        player_count=len(lobby.players),
        players=players
    )


@router.post("/{lobby_id}/ready")
async def toggle_ready(
    lobby_id: int,
    station_id: int,
    is_ready: bool,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    """Toggle ready status for a station in the lobby."""
    # Verify lobby exists
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")

    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(station, kiosk_code, user_or_client)

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
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
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

    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(station, kiosk_code, user_or_client)

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
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
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
    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(requesting_station, kiosk_code, user_or_client)
    
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
    if ok:
        logger.info(f"Sent create_lobby to host {host.name}")
    else:
        lobby.status = "waiting"
        lobby.started_at = None
        db.commit()
        raise HTTPException(status_code=500, detail="Host Agent not connected")
    
    # Send join_lobby command to all other players
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
    
    lobby.status = "running"
    db.commit()
    
    return {"status": "started", "players": len(lobby.players)}


@router.delete("/{lobby_id}")
async def cancel_lobby(
    lobby_id: int,
    requesting_station_id: int,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    """Cancel/delete a lobby. Only host can cancel."""
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")

    requesting_station = db.query(models.Station).filter(models.Station.id == requesting_station_id).first()
    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(requesting_station, kiosk_code, user_or_client)
    
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
    
    lobby.status = "cancelled"
    db.commit()
    
    return {"status": "cancelled", "lobby_id": lobby_id}
