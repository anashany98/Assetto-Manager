from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pathlib import Path
import os
import secrets
import re
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from .. import models, schemas, database
from ..routers.auth import require_admin, require_agent_token, require_admin_or_agent, require_admin_or_public_token
from ..paths import STORAGE_DIR
from ..utils.wol import send_magic_packet
from .websockets import manager as ws_manager

router = APIRouter(
    prefix="/stations",
    tags=["stations"]
)

def _generate_kiosk_code(db: Session) -> str:
    while True:
        code = secrets.token_hex(3).upper()
        existing = db.query(models.Station).filter(models.Station.kiosk_code == code).first()
        if not existing:
            return code

def _next_sim_name(db: Session) -> str:
    existing = db.query(models.Station.name).all()
    max_num = 0
    for (name,) in existing:
        if not name:
            continue
        match = re.match(r"(?i)^sim\\s*(\\d+)$", name.strip())
        if match:
            max_num = max(max_num, int(match.group(1)))
    return f"SIM {max_num + 1}"

class ArchiveGhostsRequest(BaseModel):
    older_than_hours: int = 24
    include_never_seen: bool = True
    dry_run: bool = False

@router.post("/", response_model=schemas.Station, dependencies=[Depends(require_agent_token)])
def register_station(station: schemas.StationCreate, db: Session = Depends(database.get_db)):
    now = datetime.now(timezone.utc)
    db_station = db.query(models.Station).filter(models.Station.mac_address == station.mac_address).first()
    if db_station:
        # Update existing registration info if IP/Hostname changed
        if db_station.ip_address != station.ip_address:
            db_station.ip_address = station.ip_address
        if db_station.hostname != station.hostname:
            db_station.hostname = station.hostname
        if station.ac_path and station.ac_path != db_station.ac_path:
            db_station.ac_path = station.ac_path
        # Update name only if station still has a default/hostname name
        if station.name and (not db_station.name or db_station.name == db_station.hostname):
            db_station.name = station.name
        if not db_station.kiosk_code:
            db_station.kiosk_code = _generate_kiosk_code(db)
        # Reset status to online on fresh register
        db_station.is_active = True
        db_station.is_online = True
        db_station.status = "online"
        db_station.last_seen = now
        db_station.archived_at = None
        db.commit()
        db.refresh(db_station)
        return db_station
    
    station_data = station.model_dump()
    station_data["kiosk_code"] = _generate_kiosk_code(db)
    # New stations should be kiosk-ready by default
    station_data["is_kiosk_mode"] = True
    if not station_data.get("name") or station_data.get("name") == station_data.get("hostname"):
        station_data["name"] = _next_sim_name(db)
    station_data["is_active"] = True
    station_data["is_online"] = True
    station_data["status"] = "online"
    station_data["last_seen"] = now
    new_station = models.Station(**station_data)
    db.add(new_station)
    db.commit()
    db.refresh(new_station)
    return new_station

@router.get("/kiosk/{kiosk_code}", dependencies=[Depends(require_admin_or_public_token)])
def get_station_by_kiosk(kiosk_code: str, db: Session = Depends(database.get_db)):
    code = kiosk_code.strip().upper()
    station = db.query(models.Station).filter(models.Station.kiosk_code == code).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return {
        "station_id": station.id,
        "name": station.name,
        "kiosk_code": station.kiosk_code,
        "is_active": station.is_active,
        "status": station.status
    }

@router.get("/", response_model=List[schemas.Station], dependencies=[Depends(require_admin)])
def read_stations(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    stations = db.query(models.Station).offset(skip).limit(limit).all()
    return stations

import json

@router.put("/{station_id}", response_model=schemas.Station, dependencies=[Depends(require_admin_or_agent)])
def update_station(station_id: int, station_update: schemas.StationUpdate, db: Session = Depends(database.get_db)):
    db_station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not db_station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    update_data = station_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_station, key, value)
    if update_data.get("is_active") is True:
        db_station.archived_at = None
        if db_station.status == "archived":
            db_station.status = "offline"
    if not db_station.kiosk_code:
        db_station.kiosk_code = _generate_kiosk_code(db)
    
    db.commit()
    db.refresh(db_station)
    return db_station

@router.post("/{station_id}/kiosk-code", dependencies=[Depends(require_admin)])
def regenerate_kiosk_code(station_id: int, db: Session = Depends(database.get_db)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    station.kiosk_code = _generate_kiosk_code(db)
    db.commit()
    db.refresh(station)
    return {"station_id": station.id, "kiosk_code": station.kiosk_code}

@router.delete("/{station_id}", dependencies=[Depends(require_admin)])
def remove_station(station_id: int, db: Session = Depends(database.get_db)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if station.is_online:
        raise HTTPException(status_code=409, detail="Station is online; disconnect before removal")
    now = datetime.now(timezone.utc)
    station.is_active = False
    station.is_online = False
    station.status = "archived"
    station.archived_at = now
    db.commit()
    return {"status": "archived", "station_id": station.id}

@router.post("/archive-ghosts", dependencies=[Depends(require_admin)])
def archive_ghost_stations(payload: ArchiveGhostsRequest, db: Session = Depends(database.get_db)):
    now = datetime.now(timezone.utc)
    older_than_hours = max(payload.older_than_hours, 1)
    cutoff = now - timedelta(hours=older_than_hours)

    stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    archived_ids: List[int] = []

    for station in stations:
        if station.is_online:
            continue
        last_seen = station.last_seen
        if last_seen is None:
            if not payload.include_never_seen:
                continue
            is_ghost = True
        else:
            is_ghost = last_seen < cutoff
        if not is_ghost:
            continue

        archived_ids.append(station.id)
        if not payload.dry_run:
            station.is_active = False
            station.is_online = False
            station.status = "archived"
            station.archived_at = now

    if archived_ids and not payload.dry_run:
        db.commit()

    return {
        "archived_count": len(archived_ids),
        "archived_ids": archived_ids,
        "cutoff": cutoff.isoformat(),
        "dry_run": payload.dry_run
    }

@router.get("/stats", dependencies=[Depends(require_admin)])
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

@router.get("/{station_id}/target-manifest", dependencies=[Depends(require_agent_token)])
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
async def shutdown_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # Send command via WebSocket
    success = await ws_manager.send_command(station_id, {"command": "shutdown"})
    
    if not success:
        raise HTTPException(status_code=503, detail="Station not connected or failed to receive command")
        
    return {"status": "ok", "message": f"Shutdown command sent to {station.name}"}

@router.post("/{station_id}/restart")
async def restart_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    success = await ws_manager.send_command(station_id, {"command": "restart"})
    if not success:
        raise HTTPException(status_code=503, detail="Station not connected or failed to receive command")

    return {"status": "ok", "message": f"Restart command sent to {station.name}"}

@router.post("/{station_id}/power-on")
def power_on_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    if not station.mac_address:
         raise HTTPException(status_code=400, detail="Station has no MAC address configured")
    
    # Send WoL Packet
    success = send_magic_packet(station.mac_address)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send Wake-on-LAN packet")
        
    return {"status": "ok", "message": f"Wake-on-LAN packet sent to {station.mac_address}"}

@router.post("/{station_id}/panic")
async def panic_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # Send PARNIC command via WebSocket
    success = await ws_manager.send_command(station_id, {"command": "panic"})
    
    if not success:
        raise HTTPException(status_code=503, detail="Station not connected or failed to receive command")
        
    return {"status": "ok", "message": f"Panic command sent to {station.name}"}

@router.post("/{station_id}/lock")
async def lock_station(station_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    station.is_locked = True
    db.commit()
    
    # Send WebSocket command to force update/redirect
    await ws_manager.send_command(station_id, {"command": "lock"})
        
    return {"status": "ok", "message": f"Station {station.name} locked"}

@router.post("/{station_id}/unlock")
async def unlock_station(station_id: int, pin: int = 0, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
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
    current_user: models.User = Depends(require_admin)
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
