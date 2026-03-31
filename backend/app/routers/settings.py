from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List
from .. import models, schemas, database
from .auth import require_admin, require_admin_or_public_token, require_public_token
from ..paths import PUBLIC_STORAGE_DIR
from pathlib import Path
import shutil
import os
import time
import threading
from collections import defaultdict
from ..utils.uploads import sanitize_filename, ensure_allowed_extension, save_upload_file

router = APIRouter(
    prefix="/settings",
    tags=["settings"]
)

SENSITIVE_PREFIXES = ("stripe_", "payment_", "bizum_", "smtp_", "vapid_", "license_")
NON_SENSITIVE_PAYMENT_KEYS = {"payment_currency", "payment_public_kiosk_url"}

_pair_attempts: dict[str, list[float]] = defaultdict(list)
_pair_lock = threading.Lock()
_PAIR_RATE_LIMIT = 10
_PAIR_RATE_WINDOW = 60


def _check_pair_rate_limit(client_ip: str) -> None:
    now = time.time()
    with _pair_lock:
        _pair_attempts[client_ip] = [t for t in _pair_attempts[client_ip] if now - t < _PAIR_RATE_WINDOW]
        if len(_pair_attempts[client_ip]) >= _PAIR_RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many pairing attempts. Try again later.")
        _pair_attempts[client_ip].append(now)

SENSITIVE_PREFIXES = ("stripe_", "payment_", "bizum_", "smtp_", "vapid_", "license_")
NON_SENSITIVE_PAYMENT_KEYS = {"payment_currency", "payment_public_kiosk_url"}

def _is_sensitive(key: str) -> bool:
    return key.startswith(SENSITIVE_PREFIXES) and key not in NON_SENSITIVE_PAYMENT_KEYS

@router.get("/", response_model=List[schemas.GlobalSettings])
def get_settings(db: Session = Depends(database.get_db), _auth: object = Depends(require_admin_or_public_token)):
    settings = db.query(models.GlobalSettings).all()
    return [s for s in settings if not _is_sensitive(s.key)]

@router.get("/secure", response_model=List[schemas.GlobalSettings])
def get_secure_settings(db: Session = Depends(database.get_db), current_user: models.User = Depends(require_admin)):
    settings = db.query(models.GlobalSettings).filter(
        or_(
            models.GlobalSettings.key.like("stripe_%"),
            models.GlobalSettings.key.like("bizum_%"),
            and_(
                models.GlobalSettings.key.like("payment_%"),
                ~models.GlobalSettings.key.in_(NON_SENSITIVE_PAYMENT_KEYS),
            ),
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


class KioskPairByStationRequest(schemas.BaseModel):
    station_id: int


def _serialize_public_station(station: models.Station) -> dict:
    return {
        "id": station.id,
        "name": station.name,
        "ip_address": station.ip_address,
        "is_active": station.is_active,
        "is_online": station.is_online,
        "is_kiosk_mode": station.is_kiosk_mode,
        "status": station.status,
    }


@router.get("/kiosk/stations")
def list_public_kiosk_stations(
    db: Session = Depends(database.get_db),
    _auth: object = Depends(require_admin),
):
    stations = (
        db.query(models.Station)
        .filter(models.Station.deleted_at.is_(None))
        .order_by(models.Station.id.asc())
        .all()
    )
    return [_serialize_public_station(station) for station in stations]


@router.post("/kiosk/pair")
def pair_kiosk(
    request: Request,
    payload: KioskPairRequest,
    db: Session = Depends(database.get_db),
    _auth: object = Depends(require_public_token),
):
    _check_pair_rate_limit(request.client.host if request.client else "unknown")
    code = payload.code.strip().upper()
    station = db.query(models.Station).filter(models.Station.kiosk_code == code).first()
    
    if not station:
        raise HTTPException(status_code=404, detail="Invalid kiosk code")
    
    if not station.is_active:
        raise HTTPException(status_code=403, detail="Station is not active")
    if not station.is_kiosk_mode:
        raise HTTPException(status_code=403, detail="Station is not in kiosk mode")
    
    return {
        "station_id": station.id,
        "name": station.name,
        "kiosk_code": station.kiosk_code,
        "ip_address": station.ip_address,
        "status": station.status,
        "is_active": station.is_active,
    }


@router.post("/kiosk/pair-station")
def pair_kiosk_station(
    payload: KioskPairByStationRequest,
    db: Session = Depends(database.get_db),
    _auth: object = Depends(require_public_token),
):
    station = (
        db.query(models.Station)
        .filter(models.Station.id == payload.station_id, models.Station.deleted_at.is_(None))
        .first()
    )
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if not station.is_active:
        raise HTTPException(status_code=409, detail="Station is inactive")
    if not station.kiosk_code:
        raise HTTPException(status_code=409, detail="Station has no kiosk code")

    return {
        "station_id": station.id,
        "name": station.name,
        "kiosk_code": station.kiosk_code,
        "ip_address": station.ip_address,
        "status": station.status,
        "is_active": station.is_active,
    }
