from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
from pathlib import Path

from ..database import get_db
from ..models import Driver
from ..paths import PUBLIC_STORAGE_DIR
from ..routers.auth import require_admin
from ..utils.uploads import sanitize_filename, ensure_allowed_extension, save_upload_file
from ..security.license import require_license_module

router = APIRouter(
    prefix="/drivers",
    tags=["drivers"],
    responses={404: {"description": "Not found"}},
    dependencies=[Depends(require_license_module("drivers"))],
)

# Ensure drivers storage directory exists
DRIVERS_DIR = PUBLIC_STORAGE_DIR / "drivers"
DRIVERS_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/", response_model=List[dict])
def read_drivers(skip: int = 0, limit: int = 100, include_deleted: bool = False, db: Session = Depends(get_db), _auth: object = Depends(require_admin)):
    query = db.query(Driver)
    if not include_deleted:
        query = query.filter(Driver.deleted_at.is_(None))
    drivers = query.offset(skip).limit(limit).all()
    # Map to schema-like dict manually for simplicity or use Pydantic schema
    return [
        {
            "id": d.id,
            "name": d.name,
            "country": d.country,
            "total_races": d.total_races,
            "total_wins": d.total_wins,
            "total_podiums": d.total_podiums,
            "best_lap": 0, # Placeholder or calc
            "photo_url": f"/static/drivers/{Path(d.photo_path).name}" if d.photo_path else None,
            "phone": d.phone,
            "membership_tier": d.membership_tier,
            "elo_rating": d.elo_rating
        } for d in drivers
    ]

@router.get("/{driver_id}")
def read_driver(driver_id: int, db: Session = Depends(get_db), _auth: object = Depends(require_admin)):
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.deleted_at.is_(None)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    return {
        "id": driver.id,
        "name": driver.name,
        "country": driver.country,
        "total_races": driver.total_races,
        "total_wins": driver.total_wins,
        "total_podiums": driver.total_podiums,
        "photo_url": f"/static/drivers/{Path(driver.photo_path).name}" if driver.photo_path else None,
        "phone": driver.phone,
        "membership_tier": driver.membership_tier,
        "elo_rating": driver.elo_rating,
        "safety_rating": driver.safety_rating,
        "loyalty_points": driver.loyalty_points
    }

@router.post("/{driver_id}/photo")
def upload_driver_photo(
    driver_id: int, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    _auth: object = Depends(require_admin)
):
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.deleted_at.is_(None)).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Validate file extension
    ensure_allowed_extension(file.filename, {".jpg", ".jpeg", ".png", ".webp"})
    file_ext = Path(file.filename).suffix.lower()

    # Create safe filename
    filename = f"driver_{driver_id}_{int(os.path.getmtime(Path(__file__)) if os.path.exists(__file__) else 0)}{file_ext}" # Simple unique-ish name
    # Better unique name using UUID or timestamp
    import time
    filename = sanitize_filename(f"driver_{driver_id}_{int(time.time())}{file_ext}", fallback=f"driver_{driver_id}{file_ext}")
    
    file_path = DRIVERS_DIR / filename
    
    # Save file
    try:
        max_bytes = int(os.getenv("MAX_DRIVER_PHOTO_MB", "5")) * 1024 * 1024
        save_upload_file(file, file_path, max_bytes)
            
        # Update DB - store relative path inside storage
        # If there was an old photo, we could delete it here to save space
        driver.photo_path = str(file_path)
        db.commit()
        db.refresh(driver)
        
        return {
            "message": "Photo uploaded successfully", 
            "photo_url": f"/static/drivers/{filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
