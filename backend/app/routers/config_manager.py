from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body
from sqlalchemy.orm import Session
from typing import List, Dict
from .. import models, database
import logging
import shutil
from pathlib import Path
import configparser
from ..paths import STORAGE_DIR

router = APIRouter(
    prefix="/configs",
    tags=["configs"]
)

logger = logging.getLogger("api.configs")

CONFIG_ROOT = STORAGE_DIR / "configs"

# Map Category -> Target Filename in Assetto Corsa
CATEGORY_MAP = {
    "controls": "controls.ini",
    "gameplay": "gameplay.ini",
    "video": "video.ini",
    "audio": "audio.ini",
    "race": "race.ini"
}

# Ensure directories exist and seed defaults if empty
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

@router.post("/deploy", response_model=dict)
def deploy_profiles(
    background_tasks: BackgroundTasks,
    deploy_map: Dict[str, str] = Body(...), # { "controls": "Logitech.ini", "video": "Ultra.ini" }
    db: Session = Depends(database.get_db)
):
    """
    Deploys selected profiles to ALL active stations.
    Maps local profile file -> remote target file (e.g. controls/Logitech.ini -> .../cfg/controls.ini)
    """
    stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    if not stations:
         return {"message": "No stations", "count": 0}
         
    background_tasks.add_task(_deploy_profiles_task, stations, deploy_map)
    return {"message": "Profile deployment started", "count": len(stations)}

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
            
            target_filename = CATEGORY_MAP[category] # e.g. "controls.ini"
            dst = Path(target_base) / target_filename
            
            shutil.copy2(src, dst)
            count += 1
            
        logger.info(f"Deployed {count} profiles to {station.name}")
        
    except Exception as e:
        logger.error(f"Profile deploy failed for {station.name}: {e}")
