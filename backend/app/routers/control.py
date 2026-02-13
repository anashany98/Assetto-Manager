from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.orm import Session
from .websockets import manager
from ..database import get_db
from ..models import Station as StationModel
from ..routers.auth import require_admin, require_admin_or_public_token
from .. import models
import logging
import json
from ..security.api_keys import is_client_token_allowed

router = APIRouter(
    prefix="/control",
    tags=["Control"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

def _is_admin(user_or_client: object) -> bool:
    return hasattr(user_or_client, "role") and getattr(user_or_client, "role") == "admin"

def _require_kiosk_access(station: StationModel, kiosk_code: Optional[str], user_or_client: object):
    if _is_admin(user_or_client):
        return
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if not station.is_kiosk_mode:
        raise HTTPException(status_code=403, detail="Kiosk mode disabled for station")
    if not kiosk_code or station.kiosk_code != kiosk_code:
        raise HTTPException(status_code=403, detail="Invalid kiosk code")


def _require_client_scope(user_or_client: object, required_scope: str) -> None:
    # Admin bypass.
    if _is_admin(user_or_client):
        return
    token = None if user_or_client in (None, "public") else str(user_or_client)
    if not is_client_token_allowed(token=token, required_scopes=(required_scope,)):
        raise HTTPException(status_code=403, detail="Client token missing required scope")

class WeatherCommand(BaseModel):
    weather_type: str # solar, windy, rainy, storm, fog, clear

@router.post("/global/weather", dependencies=[Depends(require_admin)])
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

@router.post("/global/panic", dependencies=[Depends(require_admin)])
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

@router.post("/station/{station_id}/kiosk", dependencies=[Depends(require_admin)])
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
    
    payload = {"command": "set_kiosk", "enabled": cmd.enabled}
    ok = await manager.send_command(station_id, payload)
    if ok:
        logger.info(f"Kiosk mode {'ENABLED' if cmd.enabled else 'DISABLED'} for Station {station_id}")
        return {"status": "ok", "kiosk_mode": cmd.enabled}
    logger.warning(f"Station {station_id} offline, but DB updated.")
    return {"status": "offline_updated", "message": "Station updated in DB but is offline."}


@router.post("/station/{station_id}/config", dependencies=[Depends(require_admin)])
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
    difficulty: str = "amateur"  # novice, amateur, pro
    duration_minutes: int = Field(default=15, ge=1, le=300)
    transmission: str = "automatic"
    time_of_day: str = "noon"
    weather: str = "sun"
    session_type: str = "practice"
    ai_count: Optional[int] = Field(default=0, ge=0, le=23)
    tyre_compound: Optional[str] = "semislicks"


def resolve_asset_name(db: Session, asset_id_or_name: str, asset_type: str) -> str:
    """
    Assetto Corsa needs folder names (ks_ferrari_458), but Kiosk UI might send 
    internal Database IDs (e.g. "184"). This resolves IDs to folder names.
    """
    if asset_id_or_name and str(asset_id_or_name).isdigit():
        from ..models import Mod
        mod = db.query(Mod).filter(Mod.id == int(asset_id_or_name)).first()
        if mod:
             # Folder name is stored in source_path: "auto_scan::folder_name" 
             # or for uploaded mods it's the folder name itself.
             if mod.source_path:
                 if "auto_scan::" in mod.source_path:
                     return mod.source_path.split("::")[-1]
                 from pathlib import Path
                 return Path(mod.source_path).name
    return asset_id_or_name

@router.post("/station/{station_id}/launch")
async def launch_station_session(
    station_id: int,
    cmd: LaunchSessionCommand,
    db: Session = Depends(get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code")
):
    """
    Send launch command to a specific station Agent.
    The Agent will configure assists based on difficulty and start the game.
    """
    # Resolve IDs to folder names
    car_model = resolve_asset_name(db, cmd.car, "car")
    track_name = resolve_asset_name(db, cmd.track, "track")

    logger.info(f"Launching session on Station {station_id}: {car_model} @ {track_name} ({cmd.difficulty}) [Original IDs: {cmd.car}, {cmd.track}]")

    # Fetch station from DB to get ac_path
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    ac_path = station.ac_path if station else None

    # Enforce kiosk access for public clients
    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(station, kiosk_code, user_or_client)

    # Map difficulty to assist settings
    assists = {
        "novice": {"abs": 1, "tc": 1, "auto_shifter": 1, "stability_aid": 0.5},
        "amateur": {"abs": 2, "tc": 2, "auto_shifter": 0, "stability_aid": 0},  # Factory
        "pro": {"abs": 0, "tc": 0, "auto_shifter": 0, "stability_aid": 0},
    }

    difficulty_key = (cmd.difficulty or "amateur").lower()

    payload = {
        "command": "launch_session",
        "car": car_model,
        "track": track_name,
        "assists": assists.get(difficulty_key, assists["amateur"]),
        "duration_minutes": cmd.duration_minutes,
        "driver_name": cmd.driver_name or f"Driver_{cmd.driver_id or 'Guest'}",
        "ac_path": ac_path,
        "transmission": (cmd.transmission or "automatic").lower(),
        "time_of_day": (cmd.time_of_day or "noon").lower(),
        "weather": (cmd.weather or "sun").lower(),
        "session_type": (cmd.session_type or "practice").lower(),
        "ai_count": int(cmd.ai_count or 0),
        "tyre_compound": cmd.tyre_compound,
        "is_vr": station.is_vr if station else False
    }

    ok = await manager.send_command(station_id, payload)
    if not ok:
        raise HTTPException(status_code=404, detail="Station Agent not connected")
    logger.info("Launch command sent to Station %s", station_id)
    return {"status": "launched", "station_id": station_id, "config": payload}

@router.post("/station/{station_id}/install_mod/{mod_id}", dependencies=[Depends(require_admin)])
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
    # `backend/app/routers/mods.py` uses PUBLIC_STORAGE_DIR for public assets.
    # `/static` points to PUBLIC_STORAGE_DIR.
    # In `main.py` (backend), usually storage is mounted.
    
    # Let's check `backend/app/main.py` first to see static mounts?
    # Assuming it is mounted at /static or similar.
    # Wait, looking at `mods.py`: 
    # `base_url = f"/static/{str(rel_path).replace(os.sep, '/')}"`
    # So yes, `/static` points to `PUBLIC_STORAGE_DIR`.
    
    from pathlib import Path
    from ..paths import PUBLIC_STORAGE_DIR
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
         
    rel_path = (mod_dir / archive_file).resolve().relative_to(PUBLIC_STORAGE_DIR.resolve())
    download_url_path = f"/static/{str(rel_path).replace(os.sep, '/')}"
    
    payload = {
        "command": "install_mod",
        "mod_name": mod.name,
        "mod_type": mod.type, # 'car' or 'track'
        "download_url": download_url_path,
        "file_name": archive_file
    }
    
    ok = await manager.send_command(station_id, payload)
    if not ok:
        logger.warning(f"Station {station_id} not connected")
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")
    return {"status": "installing", "payload": payload}


@router.get("/station/{station_id}/content", dependencies=[Depends(require_admin)])
async def get_station_content(station_id: int, db: Session = Depends(get_db)):
    """
    Request the Agent to scan its local AC content folder.
    Note: This returns immediately; the scan happens async on the Agent.
    For MVP, we return mock data. Real implementation would use WebSocket response.
    """
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail=f"Station {station_id} not found")
    
    ok = await manager.send_command(station_id, {
        "command": "scan_content",
        "ac_path": station.ac_path,
        "station_ip": station.ip_address
    })
    if not ok:
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")

    return {
        "status": "scan_requested",
        "station_id": station_id,
        "message": "Content scan triggered. Query /mods/cars and /mods/tracks for cached results."
    }


@router.post("/station/{station_id}/sync", dependencies=[Depends(require_admin)])
async def sync_station_content(station_id: int):
    """
    Force a content sync on a specific station agent.
    """
    ok = await manager.send_command(station_id, {"command": "sync_content"})
    if not ok:
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")
    return {"status": "sync_requested", "station_id": station_id}


@router.post("/station/{station_id}/restart-agent", dependencies=[Depends(require_admin)])
async def restart_station_agent(station_id: int):
    """
    Restart the agent process on a station.
    """
    ok = await manager.send_command(station_id, {"command": "restart_agent"})
    if not ok:
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")
    return {"status": "restart_requested", "station_id": station_id}


@router.post("/station/{station_id}/stop")
@router.post("/station/{station_id}/panic")
async def stop_station_session(
    request: Request,
    station_id: int,
    db: Session = Depends(get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code")
):
    """
    Stop the current session on a station (kills the game).
    """
    logger.info(f"Stopping session on Station {station_id}")
    
    station = db.query(StationModel).filter(StationModel.id == station_id).first()
    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(station, kiosk_code, user_or_client)

    command = "panic" if request.url.path.endswith("/panic") else "stop_session"
    ok = await manager.send_command(station_id, {"command": command})
    if not ok:
        raise HTTPException(status_code=404, detail=f"Station {station_id} is not online")
    return {"status": "stopped" if command == "stop_session" else "panic_sent", "station_id": station_id}






# --- WHEEL PROFILES ENDPOINTS ---

@router.get("/profiles", response_model=list[dict], dependencies=[Depends(require_admin)])
async def list_wheel_profiles(db: Session = Depends(get_db)):
    """List all wheel profiles"""
    from ..models import WheelProfile
    profiles = db.query(WheelProfile).filter(WheelProfile.is_active == True).all()
    return [{"id": p.id, "name": p.name, "description": p.description, "model_type": p.model_type} for p in profiles]

@router.post("/profiles", dependencies=[Depends(require_admin)])
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

@router.post("/station/{station_id}/profile/{profile_id}", dependencies=[Depends(require_admin)])
async def apply_wheel_profile(station_id: int, profile_id: int, db: Session = Depends(get_db)):
    """
    Send a set_controls command to the agent with the profile content.
    """
    # 1. Get Profile
    from ..models import WheelProfile
    profile = db.query(WheelProfile).filter(WheelProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    # 2. Ensure Agent is reachable (may be on another worker via WS pubsub)
        
    # 3. Send Command
    payload = {
        "command": "set_controls",
        "profile_name": profile.name,
        "ini_content": profile.config_ini
    }
    
    ok = await manager.send_command(station_id, payload)
    if not ok:
        raise HTTPException(status_code=404, detail="Station not online")
    logger.info(f"Sent profile '{profile.name}' to Station {station_id}")
    return {"status": "sent", "profile": profile.name}
