from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
import logging

from .. import models, schemas, database
from .websockets import manager

logger = logging.getLogger("api.lobby")

router = APIRouter(
    prefix="/lobby",
    tags=["lobby"]
)

def get_db():
    return database.get_db()


@router.post("/create", response_model=schemas.Lobby)
async def create_lobby(
    lobby_data: schemas.LobbyCreate,
    host_station_id: Optional[int] = None,
    db: Session = Depends(database.get_db)
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
    if not host.is_online:
        raise HTTPException(status_code=400, detail="Host station must be online")
    
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
    db: Session = Depends(database.get_db)
):
    """
    List available lobbies. Default 'active' shows waiting and running.
    """
    query = db.query(models.Lobby)
    if status == "active":
        query = query.filter(models.Lobby.status.in_(["waiting", "running"]))
    elif status != "all":
        query = query.filter(models.Lobby.status == status)
    
    lobbies = query.order_by(models.Lobby.created_at.desc()).limit(20).all()
    
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
async def get_lobby(lobby_id: int, db: Session = Depends(database.get_db)):
    """Get detailed lobby info including players."""
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    first_player = lobby.players[0] if lobby.players else None
    
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
    db: Session = Depends(database.get_db)
):
    """Toggle ready status for a station in the lobby."""
    # Verify lobby exists
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")

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
    db: Session = Depends(database.get_db)
):
    """Join an existing lobby."""
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    if lobby.status not in ["waiting", "running"]:
        raise HTTPException(status_code=400, detail="Lobby is not accepting players")
    
    if len(lobby.players) >= lobby.max_players:
        raise HTTPException(status_code=400, detail="Lobby is full")
    
    station = db.query(models.Station).filter(models.Station.id == join_data.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
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
        lobby.players.append(station)
        db.commit()
    
    logger.info(f"Station {station.name} joined lobby {lobby.name} (Status: {lobby.status})")

    # If lobby is already running, send join command immediately
    if lobby.status == "running":
        ws = manager.active_agents.get(station.id)
        if ws:
            try:
                import json
                # Calculate slot (might be append)
                # Note: Entry list is static on server, so slot number effectively maps to CAR_x
                # We need to ensure we give a valid slot index.
                slot_idx = len(lobby.players) - 1
                
                await ws.send(json.dumps({
                    "command": "join_lobby",
                    "lobby_id": lobby.id,
                    "server_ip": lobby.server_ip,
                    "port": lobby.port,
                    "track": lobby.track,
                    "car": lobby.car,
                    "slot": slot_idx
                }))
                logger.info(f"Sent immediate join_lobby to {station.name} (Late Join)")
            except Exception as e:
                logger.error(f"Failed to send immediate join_lobby to {station.name}: {e}")

    return {"status": "joined", "lobby_id": lobby_id, "slot": len(lobby.players) - 1}


@router.post("/{lobby_id}/start")
async def start_lobby(
    lobby_id: int,
    requesting_station_id: int,
    db: Session = Depends(database.get_db)
):
    """
    Start the race. Only host can start.
    This sends create_lobby command to host and join_lobby to all players.
    """
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    if lobby.host_station_id != requesting_station_id:
        raise HTTPException(status_code=403, detail="Only host can start the race")
    
    if lobby.status != "waiting":
        raise HTTPException(status_code=400, detail="Lobby already started or finished")
    
    if len(lobby.players) < 1:
        raise HTTPException(status_code=400, detail="Need at least 1 player to start")
    
    # Update status
    lobby.status = "starting"
    lobby.started_at = datetime.now(timezone.utc)
    db.commit()
    
    # Get host station
    host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
    
    # Send create_lobby command to host agent
    host_ws = manager.active_agents.get(host.id)
    if host_ws:
        try:
            import json
            await host_ws.send(json.dumps({
                "command": "create_lobby",
                "lobby_id": lobby.id,
                "track": lobby.track,
                "car": lobby.car,
                "laps": lobby.laps,
                "max_players": lobby.max_players,
                "port": lobby.port,
                "players": [{"name": s.name, "slot": idx} for idx, s in enumerate(lobby.players)]
            }))
            logger.info(f"Sent create_lobby to host {host.name}")
        except Exception as e:
            logger.error(f"Failed to send create_lobby: {e}")
    
    # Send join_lobby command to all other players
    for idx, station in enumerate(lobby.players):
        if station.id == lobby.host_station_id:
            continue  # Skip host
        
        ws = manager.active_agents.get(station.id)
        if ws:
            try:
                import json
                await ws.send(json.dumps({
                    "command": "join_lobby",
                    "lobby_id": lobby.id,
                    "server_ip": lobby.server_ip,
                    "port": lobby.port,
                    "track": lobby.track,
                    "car": lobby.car,
                    "slot": idx,
                    "is_spectator": False
                }))
                logger.info(f"Sent join_lobby to {station.name}")
            except Exception as e:
                logger.error(f"Failed to send join_lobby to {station.name}: {e}")
    
    # NEW: Automatically join TV Mode stations as spectators
    tv_stations = db.query(models.Station).filter(
        models.Station.is_tv_mode == True,
        models.Station.is_online == True
    ).all()
    
    for tv_station in tv_stations:
        # Don't send if already in lobby as player (unlikely but safe)
        if any(p.id == tv_station.id for p in lobby.players):
            continue
            
        ws = manager.active_agents.get(tv_station.id)
        if ws:
            try:
                import json
                await ws.send(json.dumps({
                    "command": "join_lobby",
                    "lobby_id": lobby.id,
                    "server_ip": lobby.server_ip,
                    "port": lobby.port,
                    "track": lobby.track,
                    "car": lobby.car,
                    "is_spectator": True
                }))
                logger.info(f"Sent join_lobby (Spectator) to TV Station {tv_station.name}")
            except Exception as e:
                logger.error(f"Failed to send spectator join to {tv_station.name}: {e}")
    
    lobby.status = "running"
    db.commit()
    
    return {"status": "started", "players": len(lobby.players)}


@router.delete("/{lobby_id}")
async def cancel_lobby(
    lobby_id: int,
    requesting_station_id: int,
    db: Session = Depends(database.get_db)
):
    """Cancel/delete a lobby. Only host can cancel."""
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    if lobby.host_station_id != requesting_station_id:
        raise HTTPException(status_code=403, detail="Only host can cancel")
    
    # If running, send stop command to host
    if lobby.status == "running":
        host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
        ws = manager.active_agents.get(host.id)
        if ws:
            try:
                import json
                await ws.send(json.dumps({"command": "stop_lobby"}))
            except Exception:
                pass
    
    lobby.status = "cancelled"
    db.commit()
    
    return {"status": "cancelled", "lobby_id": lobby_id}
