from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database
import shutil
import os

router = APIRouter(
    prefix="/settings",
    tags=["settings"]
)

@router.get("/", response_model=List[schemas.GlobalSettings])
def get_settings(db: Session = Depends(database.get_db)):
    return db.query(models.GlobalSettings).all()

@router.get("/{key}")
def get_setting(key: str, db: Session = Depends(database.get_db)):
    setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == key).first()
    if not setting:
        return {"key": key, "value": ""}
    return setting

@router.post("/")
def update_setting(setting_data: schemas.GlobalSettingsBase, db: Session = Depends(database.get_db)):
    import logging
    logger = logging.getLogger("api.settings")
    logger.info(f"Updating setting: {setting_data.key} -> {setting_data.value}")

    existing = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == setting_data.key).first()
    if existing:
        existing.value = setting_data.value
    else:
        new_setting = models.GlobalSettings(key=setting_data.key, value=setting_data.value)
        db.add(new_setting)
    
    db.commit()
    return {"status": "ok"}

@router.post("/upload-logo")
async def upload_logo(file: UploadFile = File(...), db: Session = Depends(database.get_db)):
    # Create branding directory if it doesn't exist
    upload_dir = "backend/storage/branding"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate path
    file_path = os.path.join(upload_dir, "logo_" + file.filename)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Generate public URL (relative to the server)
    # The /static prefix is mounted to backend/storage
    # Use relative URL so frontend can prepend its own host (or window.location)
    logo_url = f"/static/branding/logo_{file.filename}"
    
    # Update setting
    update_setting(schemas.GlobalSettingsBase(key="bar_logo", value=logo_url), db)
    
    return {"status": "ok", "url": logo_url}
