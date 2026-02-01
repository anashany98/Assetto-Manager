from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
import json
from pathlib import Path
from .. import database, models, schemas
from ..paths import STORAGE_DIR
from ..routers.auth import require_admin
from pydantic import BaseModel

router = APIRouter(
    prefix="/wallpapers",
    tags=["wallpapers"]
)

WALLPAPERS_DIR = STORAGE_DIR / "wallpapers"
WALLPAPERS_DIR.mkdir(parents=True, exist_ok=True)

class WallpaperFile(BaseModel):
    filename: str
    url: str
    size: int

class WallpaperConfig(BaseModel):
    interval_seconds: int
    active_wallpapers: List[str] # List of filenames

@router.get("/files", response_model=List[WallpaperFile])
def list_wallpapers():
    files = []
    if not WALLPAPERS_DIR.exists():
        return []
    
    for f in WALLPAPERS_DIR.iterdir():
        if f.is_file() and f.suffix.lower() in ['.mp4', '.webm', '.mkv', '.mov']:
            files.append(WallpaperFile(
                filename=f.name,
                url=f"/static/wallpapers/{f.name}",
                size=f.stat().st_size
            ))
    return files

@router.post("/files")
async def upload_wallpaper(file: UploadFile = File(...), user: models.User = Depends(require_admin)):
    # Validate file type
    if not file.filename.lower().endswith(('.mp4', '.webm', '.mkv', '.mov')):
        raise HTTPException(status_code=400, detail="Invalid file type. Only video files allowed.")
    
    file_path = WALLPAPERS_DIR / file.filename
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"filename": file.filename, "status": "uploaded"}

@router.delete("/files/{filename}")
def delete_wallpaper(filename: str, user: models.User = Depends(require_admin)):
    file_path = WALLPAPERS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    os.remove(file_path)
    
    # Also remove from active config if present
    # We need to fetch current config, remove it, and save it back
    # But since config is stored in DB settings, we'll do best effort in the config endpoint or let UI handle it
    
    return {"status": "deleted"}

@router.get("/config", response_model=WallpaperConfig)
def get_config(db: Session = Depends(database.get_db)):
    # Fetch from GlobalSettings
    interval_setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "wallpaper_interval").first()
    playlist_setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "wallpaper_playlist").first()
    
    interval = int(interval_setting.value) if interval_setting else 30
    try:
        playlist = json.loads(playlist_setting.value) if playlist_setting and playlist_setting.value else []
    except:
        playlist = []
        
    return WallpaperConfig(interval_seconds=interval, active_wallpapers=playlist)

@router.post("/config")
def update_config(config: WallpaperConfig, db: Session = Depends(database.get_db), user: models.User = Depends(require_admin)):
    # Update Interval
    interval_setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "wallpaper_interval").first()
    if not interval_setting:
        interval_setting = models.GlobalSettings(key="wallpaper_interval", value=str(config.interval_seconds))
        db.add(interval_setting)
    else:
        interval_setting.value = str(config.interval_seconds)
        
    # Update Playlist
    playlist_setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "wallpaper_playlist").first()
    if not playlist_setting:
        playlist_setting = models.GlobalSettings(key="wallpaper_playlist", value=json.dumps(config.active_wallpapers))
        db.add(playlist_setting)
    else:
        playlist_setting.value = json.dumps(config.active_wallpapers)
        
    db.commit()
    return config
