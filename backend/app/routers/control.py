from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from .websockets import manager
from ..database import get_db
from ..models import Station as StationModel
import logging
import json

router = APIRouter(
    prefix="/control",
    tags=["Control"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

class WeatherCommand(BaseModel):
    weather_type: str # solar, windy, rainy, storm, fog, clear

@router.post("/global/weather")
async def set_global_weather(cmd: WeatherCommand):
    """
    Broadcast weather command to all Agents
    """
    logger.info(f"Setting global weather to: {cmd.weather_type}")
    
    # Generic "set_weather" command for the Agent
    payload = {
        "command": "set_weather",
        "value": cmd.weather_type
    }
    
    await manager.broadcast_to_agents(payload)
    
    return {"status": "command_sent", "weather": cmd.weather_type}

class RestartCommand(BaseModel):
    target: str = "all" # all or station_id

@router.post("/global/panic")
async def global_panic():
    """
    Emergency Stop for all Simulators
    """
    logger.warning("GLOBAL PANIC TRIGGERED")
    await manager.broadcast_to_agents({"command": "panic"})
    return {"status": "panic_signal_sent"}


# --- KIOSK MODE ENDPOINTS ---

class KioskCommand(BaseModel):
    enabled: bool

@router.post("/station/{station_id}/kiosk")
async def set_station_kiosk(station_id: int, cmd: KioskCommand, db: Session = Depends(get_db)):
    """
    Toggle Kiosk Mode on the Agent.
    """
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # Update DB
    station.is_kiosk_mode = cmd.enabled
    db.commit()
    
    # Send Command
    agent_ws = manager.active_agents.get(station_id)
    if agent_ws:
        try:
            payload = {"command": "set_kiosk", "enabled": cmd.enabled}
            await agent_ws.send_text(json.dumps(payload))
            logger.info(f"Kiosk mode {'ENABLED' if cmd.enabled else 'DISABLED'} for Station {station_id}")
            return {"status": "ok", "kiosk_mode": cmd.enabled}
        except Exception as e:
            logger.error(f"Failed to send Kiosk command: {e}")
            raise HTTPException(status_code=500, detail="Failed to communicate with Agent")
    else:
        logger.warning(f"Station {station_id} offline, but DB updated.")
        return {"status": "offline_updated", "message": "Station updated in DB but is offline."}


@router.post("/station/{station_id}/config")
async def update_station_config(station_id: int, data: dict, db: Session = Depends(get_db)):
    """Update station configuration (e.g. is_vr)"""
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    if 'is_vr' in data:
        station.is_vr = data['is_vr']
        
    db.commit()
    return {"status": "updated", "is_vr": station.is_vr}


class LaunchSessionCommand(BaseModel):
    driver_id: Optional[int] = None
    driver_name: Optional[str] = None
    car: str
    track: str
    difficulty: str  # novice, amateur, pro
    duration_minutes: int = 15


@router.post("/station/{station_id}/launch")
async def launch_station_session(station_id: int, cmd: LaunchSessionCommand, db: Session = Depends(get_db)):
    """
    Send launch command to a specific station Agent.
    The Agent will configure assists based on difficulty and start the game.
    """
    logger.info(f"Launching session on Station {station_id}: {cmd.car} @ {cmd.track} ({cmd.difficulty})")

    # Fetch station from DB to get ac_path
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    ac_path = station.ac_path if station else None

    # Map difficulty to assist settings
    assists = {
        "novice": {"abs": 1, "tc": 1, "auto_shifter": 1, "stability_aid": 0.5},
        "amateur": {"abs": 2, "tc": 2, "auto_shifter": 0, "stability_aid": 0},  # Factory
        "pro": {"abs": 0, "tc": 0, "auto_shifter": 0, "stability_aid": 0},
    }

    payload = {
        "command": "launch_session",
        "car": cmd.car,
        "track": cmd.track,
        "assists": assists.get(cmd.difficulty, assists["amateur"]),
        "duration_minutes": cmd.duration_minutes,
        "driver_name": cmd.driver_name or f"Driver_{cmd.driver_id or 'Guest'}",
        "ac_path": ac_path,
    }

    # Send to specific station
    logger.info(f"[DEBUG] Active agents: {list(manager.active_agents.keys())}")
    agent_ws = manager.active_agents.get(station_id)
    if agent_ws:
        try:
            await agent_ws.send_text(json.dumps(payload))
            logger.info(f"Launch command sent to Station {station_id}")
            return {"status": "launched", "station_id": station_id, "config": payload}
        except Exception as e:
            logger.error(f"Failed to send to Station {station_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to reach agent: {e}")
    else:
        raise HTTPException(status_code=404, detail="Station Agent not connected")

@router.post("/station/{station_id}/install_mod/{mod_id}")
async def install_mod(station_id: int, mod_id: int, db: Session = Depends(get_db)):
    """
    Command an Agent to download and install a specific Mod.
    """
    logger.info(f"Requesting install of Mod {mod_id} to Station {station_id}")
    
    # 1. Fetch Station
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # 2. Fetch Mod
    from ..models import Mod
    mod = db.query(Mod).filter(Mod.id == mod_id).first()
    if not mod:
         raise HTTPException(status_code=404, detail="Mod not found")
         
    # 3. Construct Download URL
    # Agent needs to reach Backend. We assume backend is reachable via the WebSocket URL's base?
    # Or we use a configurable "download_base_url".
    # Ideally, we should use the same host/port the Agent connects to.
    
    # For now, let's assume standard port 8000 on the server IP.
    # In a real scenario, we might need to send the IP exposed to the LAN.
    # Let's use a "hardcoded" guess or rely on ENV.
    # Actually, we can just send the relative path if the Agent knows the server base URL.
    # But for simplicity, let's send a full URL if we can, or a relative one.
    
    # We'll send a RELATIVE path, and the Agent (which knows SERVER_URL) will append it.
    # The download endpoint is typically served via static or a specific download route.
    # We don't have a specific "download mod zip" endpoint exposed yet?
    # `backend/app/routers/mods.py` uses STORAGE_DIR.
    # We should confirm if `STORAGE_DIR` is mounted as static.
    # In `main.py` (backend), usually storage is mounted.
    
    # Let's check `backend/app/main.py` first to see static mounts?
    # Assuming it is mounted at /static or similar.
    # Wait, looking at `mods.py`: 
    # `base_url = f"/static/{str(rel_path).replace(os.sep, '/')}"`
    # So yes, `/static` points to `STORAGE_DIR`.
    
    from pathlib import Path
    from ..paths import STORAGE_DIR
    import os
    
    mod_path = Path(mod.source_path).resolve()
    # mod.source_path is the EXTRACTED folder. 
    # We need the ZIP file? 
    # Ah, we extracted it and maybe kept the zip? 
    # In `mods.py`, `final_archive_path = mod_dir / safe_filename`.
    # And `extract_dir = mod_dir / "content"`.
    
    # We need to find the archive file in `mod_path.parent` (which is `mod_dir`).
    mod_dir = mod_path.parent
    archive_file = None
    for f in os.listdir(mod_dir):
        if f.endswith(".zip") or f.endswith(".rar") or f.endswith(".7z"):
             archive_file = f
             break
             
    if not archive_file:
         raise HTTPException(status_code=500, detail="Original archive not found for this mod")
         
    rel_path = (mod_dir / archive_file).resolve().relative_to(STORAGE_DIR.resolve())
    download_url_path = f"/static/{str(rel_path).replace(os.sep, '/')}"
    
    payload = {
        "command": "install_mod",
        "mod_name": mod.name,
        "mod_type": mod.type, # 'car' or 'track'
        "download_url": download_url_path,
        "file_name": archive_file
    }
    
    agent_ws = manager.active_agents.get(station_id)
    if agent_ws:
        await agent_ws.send_text(json.dumps(payload))
        return {"status": "installing", "payload": payload}
    else:
        logger.warning(f"Station {station_id} not connected")
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")


@router.get("/station/{station_id}/content")
async def get_station_content(station_id: int, db: Session = Depends(get_db)):
    """
    Request the Agent to scan its local AC content folder.
    Note: This returns immediately; the scan happens async on the Agent.
    For MVP, we return mock data. Real implementation would use WebSocket response.
    """
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail=f"Station {station_id} not found")
    
    # Send scan command to Agent
    agent_ws = manager.active_agents.get(station_id)
    if agent_ws:
        try:
            await agent_ws.send_text(json.dumps({
                "command": "scan_content",
                "ac_path": station.ac_path
            }))
            # For now, return a pending status. Real implementation would wait for response.
            return {
                "status": "scan_requested",
                "station_id": station_id,
                "message": "Content scan triggered. Query /mods/cars and /mods/tracks for cached results."
            }
        except Exception as e:
            logger.error(f"Failed to send scan command: {e}")
            raise HTTPException(status_code=500, detail="Failed to communicate with Agent")
    else:
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")


@router.post("/station/{station_id}/stop")
async def stop_station_session(station_id: int):
    """
    Stop the current session on a station (kills the game).
    """
    logger.info(f"Stopping session on Station {station_id}")
    
    agent_ws = manager.active_agents.get(station_id)
    if agent_ws:
        try:
            await agent_ws.send_text(json.dumps({"command": "stop_session"}))
            return {"status": "stopped", "station_id": station_id}
        except Exception as e:
            logger.error(f"Failed to send stop command: {e}")
            raise HTTPException(status_code=500, detail="Failed to communicate with Agent")
    else:
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")


# --- WHEEL PROFILES ENDPOINTS ---

@router.get("/profiles", response_model=list[dict])
async def list_wheel_profiles(db: Session = Depends(get_db)):
    """List all wheel profiles"""
    from ..models import WheelProfile
    profiles = db.query(WheelProfile).filter(WheelProfile.is_active == True).all()
    return [{"id": p.id, "name": p.name, "description": p.description, "model_type": p.model_type} for p in profiles]

@router.post("/profiles")
async def create_wheel_profile(data: dict, db: Session = Depends(get_db)):
    """Create a new wheel profile"""
    from ..models import WheelProfile
    
    if db.query(WheelProfile).filter(WheelProfile.name == data['name']).first():
        raise HTTPException(status_code=400, detail="Profile name already exists")
        
    profile = WheelProfile(
        name=data['name'],
        description=data.get('description'),
        config_ini=data.get('config_ini'),
        model_type=data.get('model_type', 'custom')
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile

@router.post("/station/{station_id}/profile/{profile_id}")
async def apply_wheel_profile(station_id: int, profile_id: int, db: Session = Depends(get_db)):
    """
    Send a set_controls command to the agent with the profile content.
    """
    # 1. Get Profile
    from ..models import WheelProfile
    profile = db.query(WheelProfile).filter(WheelProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    # 2. Get Agent
    agent_ws = manager.active_agents.get(station_id)
    if not agent_ws:
        raise HTTPException(status_code=404, detail="Station not online")
        
    # 3. Send Command
    payload = {
        "command": "set_controls",
        "profile_name": profile.name,
        "ini_content": profile.config_ini
    }
    
    try:
        await agent_ws.send_text(json.dumps(payload))
        logger.info(f"Sent profile '{profile.name}' to Station {station_id}")
        return {"status": "sent", "profile": profile.name}
    except Exception as e:
        logger.error(f"Failed to send profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to send command to agent")

