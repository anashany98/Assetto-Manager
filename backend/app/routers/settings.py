from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List
from .. import models, schemas, database
from .auth import require_admin, require_admin_or_public_token, require_public_token
from ..paths import PUBLIC_STORAGE_DIR
from pathlib import Path
import shutil
import os
from ..utils.uploads import sanitize_filename, ensure_allowed_extension, save_upload_file

router = APIRouter(
    prefix="/settings",
    tags=["settings"]
)

SENSITIVE_PREFIXES = ("stripe_", "payment_", "bizum_", "smtp_", "vapid_", "license_")

def _is_sensitive(key: str) -> bool:
    return key.startswith(SENSITIVE_PREFIXES)

@router.get("/", response_model=List[schemas.GlobalSettings])
def get_settings(db: Session = Depends(database.get_db), _auth: object = Depends(require_admin_or_public_token)):
    settings = db.query(models.GlobalSettings).all()
    return [s for s in settings if not _is_sensitive(s.key)]

@router.get("/secure", response_model=List[schemas.GlobalSettings])
def get_secure_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    settings = db.query(models.GlobalSettings).filter(
        or_(
            models.GlobalSettings.key.like("stripe_%"),
            models.GlobalSettings.key.like("payment_%"),
            models.GlobalSettings.key.like("bizum_%"),
        )
    ).all()
    return settings

@router.get("/{key}", response_model=schemas.GlobalSettings)
def get_setting(key: str, db: Session = Depends(database.get_db), _auth: object = Depends(require_admin_or_public_token)):
    if _is_sensitive(key):
        return {"key": key, "value": ""}
    setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == key).first()
    if not setting:
        return {"key": key, "value": ""}
    return setting

@router.post("/", response_model=schemas.GlobalSettings)
def update_setting(setting_data: schemas.GlobalSettingsBase, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
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
def upload_logo(file: UploadFile = File(...), db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    # Create branding directory if it doesn't exist
    upload_dir = PUBLIC_STORAGE_DIR / "branding"
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate path
    ensure_allowed_extension(file.filename, {".png", ".jpg", ".jpeg", ".webp"})
    safe_name = sanitize_filename(file.filename, fallback="logo.png")
    file_path = upload_dir / ("logo_" + safe_name)

    max_bytes = int(os.getenv("MAX_LOGO_UPLOAD_MB", "5")) * 1024 * 1024
    save_upload_file(file, file_path, max_bytes)
    
    # Generate public URL (relative to the server)
    # The /static prefix is mounted to backend/storage
    # Use relative URL so frontend can prepend its own host (or window.location)
    logo_url = f"/static/branding/logo_{safe_name}"
    
    # Update setting
    update_setting(schemas.GlobalSettingsBase(key="bar_logo", value=logo_url), db)
    
    return {"status": "ok", "url": logo_url}

class KioskPairRequest(schemas.BaseModel):
    code: str

@router.post("/kiosk/pair")
def pair_kiosk(payload: KioskPairRequest, db: Session = Depends(database.get_db), _auth: object = Depends(require_public_token)):
    code = payload.code.strip().upper()
    station = db.query(models.Station).filter(models.Station.kiosk_code == code).first()
    
    if not station:
        raise HTTPException(status_code=404, detail="Invalid kiosk code")
    
    return {"station_id": station.id, "name": station.name, "kiosk_code": station.kiosk_code}
