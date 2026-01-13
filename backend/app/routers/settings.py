from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database
from ..paths import STORAGE_DIR
from pathlib import Path
import shutil
import os

router = APIRouter(
    prefix="/settings",
    tags=["settings"]
)

@router.get("/", response_model=List[schemas.GlobalSettings])
def get_settings(db: Session = Depends(database.get_db)):
    return db.query(models.GlobalSettings).all()

@router.get("/{key}", response_model=schemas.GlobalSettings)
def get_setting(key: str, db: Session = Depends(database.get_db)):
    setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == key).first()
    if not setting:
        return {"key": key, "value": ""}
    return setting

@router.post("/", response_model=schemas.GlobalSettings)
def update_setting(setting_data: schemas.GlobalSettingsBase, db: Session = Depends(database.get_db)):
    import logging
    logger = logging.getLogger("api.settings")
    logger.info(f"Updating setting: {setting_data.key} -> {setting_data.value}")

    existing = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == setting_data.key).first()
    if existing:
        existing.value = setting_data.value
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_setting = models.GlobalSettings(key=setting_data.key, value=setting_data.value)
        db.add(new_setting)
    
    db.commit()
    db.refresh(new_setting)
    return new_setting

@router.post("/upload-logo")
async def upload_logo(file: UploadFile = File(...), db: Session = Depends(database.get_db)):
    # Create branding directory if it doesn't exist
    upload_dir = STORAGE_DIR / "branding"
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate path
    safe_name = Path(file.filename).name
    file_path = upload_dir / ("logo_" + safe_name)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Generate public URL (relative to the server)
    # The /static prefix is mounted to backend/storage
    # Use relative URL so frontend can prepend its own host (or window.location)
    logo_url = f"/static/branding/logo_{safe_name}"
    
    # Update setting
    update_setting(schemas.GlobalSettingsBase(key="bar_logo", value=logo_url), db)
    
    return {"status": "ok", "url": logo_url}
