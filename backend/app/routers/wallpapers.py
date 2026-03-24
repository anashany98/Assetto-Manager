from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
import json
from pathlib import Path
from .. import database, models, schemas
from ..paths import PUBLIC_STORAGE_DIR
from ..routers.auth import require_admin, require_admin_or_public_token
from pydantic import BaseModel
from ..utils.uploads import sanitize_filename, ensure_allowed_extension, save_upload_file

router = APIRouter(
    prefix="/wallpapers",
    tags=["wallpapers"]
)

WALLPAPERS_DIR = PUBLIC_STORAGE_DIR / "wallpapers"
WALLPAPERS_DIR.mkdir(parents=True, exist_ok=True)

class WallpaperFile(BaseModel):
    filename: str
    url: str
    size: int

class WallpaperConfig(BaseModel):
    interval_seconds: int
    active_wallpapers: List[str] # List of filenames

@router.get("/files", response_model=List[WallpaperFile], dependencies=[Depends(require_admin)])
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
def upload_wallpaper(file: UploadFile = File(...), user: models.User = Depends(require_admin)):
    # Validate file type
    ensure_allowed_extension(file.filename, {".mp4", ".webm", ".mkv", ".mov"})
    safe_name = sanitize_filename(file.filename, fallback="wallpaper.mp4")
    file_path = WALLPAPERS_DIR / safe_name

    max_bytes = int(os.getenv("MAX_WALLPAPER_UPLOAD_MB", "500")) * 1024 * 1024
    save_upload_file(file, file_path, max_bytes)
        
    return {"filename": safe_name, "status": "uploaded"}

@router.delete("/files/{filename}")
def delete_wallpaper(filename: str, user: models.User = Depends(require_admin)):
    safe_name = Path(filename).name
    file_path = (WALLPAPERS_DIR / safe_name).resolve()
    if file_path.parent != WALLPAPERS_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    os.remove(file_path)
    
    # Also remove from active config if present
    # We need to fetch current config, remove it, and save it back
    # But since config is stored in DB settings, we'll do best effort in the config endpoint or let UI handle it
    
    return {"status": "deleted"}

@router.get("/config", response_model=WallpaperConfig)
def get_config(db: Session = Depends(database.get_db), _auth: object = Depends(require_admin_or_public_token)):
    # Fetch from GlobalSettings
    interval_setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "wallpaper_interval").first()
    playlist_setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "wallpaper_playlist").first()
    
    interval = int(interval_setting.value) if interval_setting else 30
    try:
        playlist = json.loads(playlist_setting.value) if playlist_setting and playlist_setting.value else []
    except Exception:
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
