from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from pydantic import BaseModel
from .. import models, database
from .auth import require_admin
import logging
import shutil
from pathlib import Path
import configparser
from ..paths import STORAGE_DIR

router = APIRouter(
    prefix="/configs",
    tags=["configs"],
    dependencies=[Depends(require_admin)]
)

logger = logging.getLogger("api.configs")

CONFIG_ROOT = STORAGE_DIR / "configs"

# Map Category -> Target Filename in Assetto Corsa cfg folder
CATEGORY_MAP = {
    "controls": "controls.ini",
    "gameplay": "assetto_corsa.ini",  # Main gameplay/assists file
    "video": "video.ini",
    "audio": "audio.ini",
    "camera": "cameras.ini",  # Camera settings
    "race": "race.ini",       # AI and race settings
    "weather": "weather.ini", # Weather/time of day
}

# Ensure directories exist
for cat in CATEGORY_MAP.keys():
    (CONFIG_ROOT / cat).mkdir(parents=True, exist_ok=True)

@router.get("/profiles", response_model=Dict[str, List[str]])
def list_profiles():
    """Returns a dict of categories and their available profile names (files)."""
    result = {}
    for cat in CATEGORY_MAP.keys():
        path = CONFIG_ROOT / cat
        # List .ini files, remove extension for cleaner display if desired, keeping simple for now
        files = [f.name for f in path.glob("*.ini")]
        result[cat] = files
    return result

@router.get("/profile/{category}/{filename}")
def get_profile_content(category: str, filename: str):
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    safe_filename = Path(filename).name
    fpath = CONFIG_ROOT / category / safe_filename
    if not fpath.exists():
         return {"content": ""}
         
    try:
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/profile/{category}/{filename}")
def save_profile_content(category: str, filename: str, content: str = Body(...)):
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    # Sanitize filename
    filename = Path(filename).name
    if not filename.endswith(".ini"):
        filename += ".ini"
        
    fpath = CONFIG_ROOT / category / filename
    fpath.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        return {"status": "saved", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/profile/{category}/{filename}")
def delete_profile(category: str, filename: str):
    """Delete a profile file."""
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    safe_filename = Path(filename).name
    fpath = CONFIG_ROOT / category / safe_filename
    
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Profile not found")
    
    try:
        fpath.unlink()
        return {"status": "deleted", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/profile/{category}/{filename}/parsed")
def get_profile_content_parsed(category: str, filename: str):
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    safe_filename = Path(filename).name
    fpath = CONFIG_ROOT / category / safe_filename
    if not fpath.exists():
         return {"sections": {}}
         
    try:
        # Use simple parsing to preserve some order, but configparser is easiest standard
        parser = configparser.ConfigParser(strict=False)
        # Preserve case sensitivity
        parser.optionxform = str 
        parser.read(fpath, encoding="utf-8")
        
        sections = {}
        for section in parser.sections():
            sections[section] = dict(parser.items(section))
            
        return {"sections": sections}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/profile/{category}/{filename}/parsed")
def save_profile_content_parsed(category: str, filename: str, data: Dict = Body(...)):
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    # Sanitize filename
    filename = Path(filename).name
    if not filename.endswith(".ini"):
        filename += ".ini"
        
    fpath = CONFIG_ROOT / category / filename
    fpath.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        parser = configparser.ConfigParser(strict=False)
        parser.optionxform = str
        
        # Accept either {"sections": {...}}, {"data": {"sections": {...}}} or a raw sections dict
        payload = data or {}
        sections = payload.get("sections")
        if sections is None and isinstance(payload.get("data"), dict):
            inner = payload["data"]
            sections = inner.get("sections", inner)
        if sections is None and payload and all(isinstance(v, dict) for v in payload.values()):
            sections = payload

        if not sections:
            raise HTTPException(status_code=400, detail="No sections provided")
        
        for section_name, items in sections.items():
            parser.add_section(section_name)
            for k, v in items.items():
                parser.set(section_name, k, str(v))
                
        with open(fpath, "w", encoding="utf-8") as f:
            parser.write(f)
            
        return {"status": "saved", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DeployRequest(BaseModel):
    deploy_map: Dict[str, str]  # { "controls": "Logitech.ini", "video": "Ultra.ini" }
    station_ids: Optional[List[int]] = None  # If None, deploy to all active stations


@router.post("/deploy", response_model=dict)
def deploy_profiles(
    background_tasks: BackgroundTasks,
    request: DeployRequest,
    db: Session = Depends(database.get_db)
):
    """
    Deploys selected profiles to stations.
    If station_ids is provided, deploy only to those stations.
    If station_ids is None or empty, deploy to ALL active stations.
    """
    if request.station_ids:
        stations = db.query(models.Station).filter(
            models.Station.id.in_(request.station_ids)
        ).all()
    else:
        stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    
    if not stations:
         return {"message": "No stations found", "count": 0}
         
    background_tasks.add_task(_deploy_profiles_task, stations, request.deploy_map)
    
    station_names = [s.name for s in stations]
    return {
        "message": f"Profile deployment started to: {', '.join(station_names)}", 
        "count": len(stations),
        "stations": station_names
    }


@router.post("/deploy/{station_id}", response_model=dict)
def deploy_profiles_to_station(
    station_id: int,
    background_tasks: BackgroundTasks,
    deploy_map: Dict[str, str] = Body(...),
    db: Session = Depends(database.get_db)
):
    """
    Deploys selected profiles to a SINGLE specific station.
    """
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    if not station.ip_address:
        raise HTTPException(status_code=400, detail="Station has no IP address configured")
         
    background_tasks.add_task(_deploy_profiles_task, [station], deploy_map)
    
    return {
        "message": f"Profile deployment started to: {station.name}", 
        "count": 1,
        "station": station.name
    }


def _deploy_profiles_task(stations: List[models.Station], deploy_map: Dict[str, str]):
    from concurrent.futures import ThreadPoolExecutor
    
    MAX_WORKERS = 5
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for station in stations:
            if not station.ip_address: continue
            executor.submit(_sync_station_profiles, station, deploy_map)

def _sync_station_profiles(station: models.Station, deploy_map: Dict[str, str]):
    # Target: \\IP\AC_Config (Mapped to Documents/Assetto Corsa/cfg)
    target_base = f"\\\\{station.ip_address}\\AC_Config"
    
    logger.info(f"Deploying profiles to {station.name}...")
    
    try:
        if not Path(target_base).exists():
             logger.error(f"Share not found at {target_base}")
             return

        count = 0
        for category, profile_name in deploy_map.items():
            if category not in CATEGORY_MAP: continue
            
            src = CONFIG_ROOT / category / profile_name
            if not src.exists(): continue
            
            target_filename = CATEGORY_MAP[category]
            dst = Path(target_base) / target_filename
            
            shutil.copy2(src, dst)
            count += 1
            
        logger.info(f"Deployed {count} profiles to {station.name}")
        
    except Exception as e:
        logger.error(f"Profile deploy failed for {station.name}: {e}")
