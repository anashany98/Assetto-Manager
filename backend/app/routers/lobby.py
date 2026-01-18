from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import logging

from .. import models, schemas, database
from .websockets import connected_agents

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
    host_station_id: int,
    db: Session = Depends(database.get_db)
):
    """
    Create a new multiplayer lobby. The host station will run acServer.exe.
    """
    # Verify host station exists and is online
    host = db.query(models.Station).filter(models.Station.id == host_station_id).first()
    if not host:
        raise HTTPException(status_code=404, detail=f"Station {host_station_id} not found")
    if not host.is_online:
        raise HTTPException(status_code=400, detail="Host station must be online")
    
    # Find available port (9600 + lobby_id offset)
    last_lobby = db.query(models.Lobby).order_by(models.Lobby.id.desc()).first()
    port = 9600 + ((last_lobby.id + 1) % 100 if last_lobby else 0)
    
    # Create lobby
    lobby = models.Lobby(
        name=lobby_data.name,
        host_station_id=host_station_id,
        track=lobby_data.track,
        car=lobby_data.car,
        max_players=lobby_data.max_players,
        laps=lobby_data.laps,
        port=port,
        server_ip=host.ip_address,
        status="waiting"
    )
    
    db.add(lobby)
    db.commit()
    db.refresh(lobby)
    
    # Add host as first player
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
        port=lobby.port,
        server_ip=lobby.server_ip,
        created_at=lobby.created_at,
        started_at=lobby.started_at,
        player_count=len(lobby.players),
        players=[]
    )


@router.get("/list", response_model=List[schemas.Lobby])
async def list_lobbies(
    status: str = "waiting",
    db: Session = Depends(database.get_db)
):
    """
    List available lobbies. By default shows only waiting lobbies.
    """
    query = db.query(models.Lobby)
    if status != "all":
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
    
    players = []
    for idx, station in enumerate(lobby.players):
        players.append(schemas.LobbyPlayer(
            station_id=station.id,
            station_name=station.name,
            slot=idx,
            ready=False  # TODO: track ready state
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
        port=lobby.port,
        server_ip=lobby.server_ip,
        created_at=lobby.created_at,
        started_at=lobby.started_at,
        player_count=len(lobby.players),
        players=players
    )


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
    
    if lobby.status != "waiting":
        raise HTTPException(status_code=400, detail="Lobby is not accepting players")
    
    if len(lobby.players) >= lobby.max_players:
        raise HTTPException(status_code=400, detail="Lobby is full")
    
    station = db.query(models.Station).filter(models.Station.id == join_data.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    # Check if already in lobby
    if station in lobby.players:
        return {"status": "already_joined", "lobby_id": lobby_id}
    
    lobby.players.append(station)
    db.commit()
    
    logger.info(f"Station {station.name} joined lobby {lobby.name}")
    
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
    
    if len(lobby.players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")
    
    # Update status
    lobby.status = "starting"
    lobby.started_at = datetime.now(timezone.utc)
    db.commit()
    
    # Get host station
    host = db.query(models.Station).filter(models.Station.id == lobby.host_station_id).first()
    
    # Send create_lobby command to host agent
    host_ws = connected_agents.get(host.name)
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
        
        ws = connected_agents.get(station.name)
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
                    "slot": idx
                }))
                logger.info(f"Sent join_lobby to {station.name}")
            except Exception as e:
                logger.error(f"Failed to send join_lobby to {station.name}: {e}")
    
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
        ws = connected_agents.get(host.name)
        if ws:
            try:
                import json
                await ws.send(json.dumps({"command": "stop_lobby"}))
            except Exception:
                pass
    
    lobby.status = "cancelled"
    db.commit()
    
    return {"status": "cancelled", "lobby_id": lobby_id}
