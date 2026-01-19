from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pathlib import Path
import os
from .. import models, schemas, database
from ..routers.auth import get_current_active_user
from ..paths import STORAGE_DIR
from ..utils.wol import send_magic_packet
from .websockets import manager as ws_manager

router = APIRouter(
    prefix="/stations",
    tags=["stations"]
)

@router.post("/", response_model=schemas.Station)
def register_station(station: schemas.StationCreate, db: Session = Depends(database.get_db)):
    db_station = db.query(models.Station).filter(models.Station.mac_address == station.mac_address).first()
    if db_station:
        # Update existing registration info if IP/Hostname changed
        if db_station.ip_address != station.ip_address:
            db_station.ip_address = station.ip_address
        if db_station.hostname != station.hostname:
            db_station.hostname = station.hostname
        # Optional: Reset status to online on fresh register
        db_station.is_online = True 
        db.commit()
        db.refresh(db_station)
        return db_station
    
    new_station = models.Station(**station.model_dump())
    db.add(new_station)
    db.commit()
    db.refresh(new_station)
    return new_station

@router.get("/", response_model=List[schemas.Station])
def read_stations(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    stations = db.query(models.Station).offset(skip).limit(limit).all()
    return stations

import json

@router.put("/{station_id}", response_model=schemas.Station)
def update_station(station_id: int, station_update: schemas.StationUpdate, db: Session = Depends(database.get_db)):
    db_station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not db_station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    update_data = station_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_station, key, value)
    
    db.commit()
    db.refresh(db_station)
    return db_station

@router.get("/stats")
def get_station_stats(db: Session = Depends(database.get_db)):
    total = db.query(models.Station).count()
    online = db.query(models.Station).filter(models.Station.is_online == True).count()
    syncing = db.query(models.Station).filter(models.Station.status == "syncing").count()
    
    # Get active profile name if any station has one (assuming unified profile for arcade)
    active_profile = "Ninguno"
    active_station = db.query(models.Station).filter(models.Station.active_profile_id != None).first()
    if active_station and active_station.active_profile:
        active_profile = active_station.active_profile.name
        
    return {
        "total_stations": total,
        "online_stations": online,
        "syncing_stations": syncing,
        "active_profile": active_profile
    }

@router.get("/{station_id}/target-manifest")
def get_target_manifest(station_id: int, db: Session = Depends(database.get_db)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    if not station.active_profile:
        return {}
    
    master_manifest = {}
    storage_root = STORAGE_DIR.resolve()
    for mod in station.active_profile.mods:
        if not mod.manifest:
            continue
        if not mod.source_path:
            continue
        try:
            mod_manifest = json.loads(mod.manifest) if isinstance(mod.manifest, str) else mod.manifest
            if not isinstance(mod_manifest, dict):
                continue

            source_path = Path(mod.source_path).resolve()
            try:
                rel_source = source_path.relative_to(storage_root)
            except ValueError:
                continue
            base_url = f"/static/{str(rel_source).replace(os.sep, '/')}"
            
            for file_path, info in mod_manifest.items():
                # Construct download URL (relative to server root)
                # Assumes static mount at /static/{relative_source}/{file_path}
                # info is {hash, size, last_modified}
                info_with_url = dict(info)
                info_with_url['url'] = f"{base_url}/{file_path}"
                master_manifest[file_path] = info_with_url
        except json.JSONDecodeError:
            continue
            
            continue
            
    return master_manifest

@router.post("/{station_id}/shutdown")
async def shutdown_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # Send command via WebSocket
    success = await ws_manager.send_command(station_id, {"command": "shutdown"})
    
    if not success:
        raise HTTPException(status_code=503, detail="Station not connected or failed to receive command")
        
    return {"status": "ok", "message": f"Shutdown command sent to {station.name}"}

@router.post("/{station_id}/power-on")
def power_on_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    if not station.mac_address:
         raise HTTPException(status_code=400, detail="Station has no MAC address configured")
    
    # Send WoL Packet
    success = send_magic_packet(station.mac_address)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send Wake-on-LAN packet")
        
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send Wake-on-LAN packet")
        
    return {"status": "ok", "message": f"Wake-on-LAN packet sent to {station.mac_address}"}

@router.post("/{station_id}/panic")
async def panic_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # Send PARNIC command via WebSocket
    success = await ws_manager.send_command(station_id, {"command": "panic"})
    
    if not success:
        raise HTTPException(status_code=503, detail="Station not connected or failed to receive command")
        
    return {"status": "ok", "message": f"Panic command sent to {station.name}"}

@router.post("/{station_id}/lock")
async def lock_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    station.is_locked = True
    db.commit()
    
    # Send WebSocket command to force update/redirect
    await ws_manager.send_command(station_id, {"command": "lock"})
        
    return {"status": "ok", "message": f"Station {station.name} locked"}

@router.post("/{station_id}/unlock")
async def unlock_station(station_id: int, pin: int = 0, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    station.is_locked = False
    db.commit()

    # Send WebSocket command
    await ws_manager.send_command(station_id, {"command": "unlock"})
        
    return {"status": "ok", "message": f"Station {station.name} unlocked"}
@router.post("/mass-launch")
async def mass_launch(
    request: schemas.MassLaunchRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Launch a session on multiple stations simultaneously.
    """
    stations = db.query(models.Station).filter(models.Station.id.in_(request.station_ids)).all()
    if not stations:
        raise HTTPException(status_code=404, detail="No valid stations found")

    online_stations = [s for s in stations if s.is_online]
    if not online_stations:
        raise HTTPException(status_code=400, detail="No selected stations are online")

    if request.mode == "practice":
        for station in online_stations:
            await ws_manager.send_command(station.id, {
                "command": "launch_session",
                "car": request.car,
                "track": request.track,
                "duration_minutes": request.duration_minutes,
                "ac_path": station.ac_path,
                "driver_name": f"Mass-{station.id}"
            })
        return {"status": "ok", "message": f"Practice launched on {len(online_stations)} stations"}

    elif request.mode == "race":
        # Multi-player logic
        # 1. Pick host (first online station)
        host = online_stations[0]
        
        # 2. Create lobby entry in DB (simulating lobby/create logic)
        last_lobby = db.query(models.Lobby).order_by(models.Lobby.id.desc()).first()
        port = 9600 + ((last_lobby.id + 1) % 100 if last_lobby else 0)
        
        lobby = models.Lobby(
            name=request.name or "Mass Launch Race",
            host_station_id=host.id,
            track=request.track,
            car=request.car,
            max_players=len(online_stations),
            laps=request.laps,
            port=port,
            server_ip=host.ip_address,
            status="starting"
        )
        db.add(lobby)
        db.commit()
        db.refresh(lobby)
        
        # Add all online stations as players
        for s in online_stations:
            lobby.players.append(s)
        db.commit()

        # 3. Send create_lobby to host
        await ws_manager.send_command(host.id, {
            "command": "create_lobby",
            "lobby_id": lobby.id,
            "track": request.track,
            "car": request.car,
            "laps": request.laps,
            "max_players": lobby.max_players,
            "port": lobby.port,
            "players": [{"name": s.name, "slot": idx} for idx, s in enumerate(online_stations)]
        })

        # 4. Send join_lobby to everyone (including host for the client part)
        for idx, station in enumerate(online_stations):
            await ws_manager.send_command(station.id, {
                "command": "join_lobby",
                "lobby_id": lobby.id,
                "server_ip": lobby.server_ip,
                "port": lobby.port,
                "track": request.track,
                "car": request.car,
                "slot": idx,
                "is_spectator": False
            })

        # 5. Automatically send to TV stations as spectators
        tv_stations = db.query(models.Station).filter(
            models.Station.is_tv_mode == True,
            models.Station.is_online == True
        ).all()
        for tv in tv_stations:
            await ws_manager.send_command(tv.id, {
                "command": "join_lobby",
                "lobby_id": lobby.id,
                "server_ip": lobby.server_ip,
                "port": lobby.port,
                "track": request.track,
                "car": request.car,
                "is_spectator": True
            })

        lobby.status = "running"
        db.commit()

        return {"status": "ok", "message": f"Race started on {len(online_stations)} stations", "lobby_id": lobby.id}

    return {"status": "error", "message": "Invalid mode"}
