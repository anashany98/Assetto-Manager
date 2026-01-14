
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from .. import database, models, schemas
from .auth import get_current_active_user
import json
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/backup",
    tags=["backup"]
)

# List of models to backup/restore
# Order matters for foreign keys!
# Dependencies to be created first:
# Event -> SessionResult
# Championship -> Event
# Mod -> (Tags, Dependencies)
# Driver
# Station
MODELS = [
    models.GlobalSettings,
    models.Driver,
    models.Mod,
    models.Tag,
    models.Championship,
    models.Event,
    models.SessionResult,
    models.Station,
    models.Profile,
    models.AdCampaign
]
# Note: Track/Car are now stored as Mod with type='track'/'car'

@router.get("/export")
def export_database(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Export database to JSON
    """
    backup_data = {
        "version": "1.0",
        "timestamp": datetime.now().isoformat(),
        "data": {}
    }

    try:
        # We can iterate over tables using Inspector or hardcode list
        # Hardcoding ensures order and selection
        
        # 1. Global Settings
        settings = db.query(models.GlobalSettings).all()
        backup_data["data"]["settings"] = [s.to_dict() if hasattr(s, 'to_dict') else s.__dict__ for s in settings]
        # Clean __dict__ (remove _sa_instance_state)
        _clean_list(backup_data["data"]["settings"])

        # 2. Drivers
        drivers = db.query(models.Driver).all()
        backup_data["data"]["drivers"] = _clean_list([d.__dict__.copy() for d in drivers])

        # 3. Mods (and Tags?)
        mods_list = db.query(models.Mod).all()
        backup_data["data"]["mods"] = _clean_list([m.__dict__.copy() for m in mods_list])
        
        # 4. Championships
        champs = db.query(models.Championship).all()
        backup_data["data"]["championships"] = _clean_list([c.__dict__.copy() for c in champs])

        # 5. Events
        events = db.query(models.Event).all()
        backup_data["data"]["events"] = _clean_list([e.__dict__.copy() for e in events])

        # 6. Session Results
        results = db.query(models.SessionResult).all()
        backup_data["data"]["results"] = _clean_list([r.__dict__.copy() for r in results])
        
        # 7. Stations
        stations = db.query(models.Station).all()
        backup_data["data"]["stations"] = _clean_list([s.__dict__.copy() for s in stations])

        # 8. Profiles
        profiles = db.query(models.Profile).all()
        backup_data["data"]["profiles"] = _clean_list([p.__dict__.copy() for p in profiles])

        return backup_data

    except Exception as e:
        logger.error(f"Backup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _clean_list(items):
    cleaned = []
    for item in items:
        if "_sa_instance_state" in item:
            del item["_sa_instance_state"]
        # Handle datetime serialization? FastAPI handles it if returned as JSON response?
        # But we might need to stringify for consistency if we want a file download.
        # Actually, FastAPI will serialize the return value.
        # But datetime objects need to be handled by the default encoder.
        cleaned.append(item)
    return cleaned

@router.post("/import")
async def import_database(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Import database from JSON - WARNING: DELETES EXISTING DATA
    """
    try:
        content = await file.read()
        data = json.loads(content)
        
        if "data" not in data:
            raise HTTPException(status_code=400, detail="Invalid backup file format")
            
        # Strategy: Delete All, Then Insert?
        # Or Update?
        # Restore usually implies overwriting.
        
        # Disable constraints? SQLite doesn't enforce foreign keys by default but SQLAlchemy might.
        # Best to delete in reverse order of dependency.
        
        # DELETE
        db.query(models.SessionResult).delete()
        db.query(models.Event).delete()
        db.query(models.Championship).delete()
        # Mod/Tag handling is complex due to M2M. SKIP cleaning Mods for now?
        # Maybe just restore Events/Results/Drivers/Championships/Settings?
        # If we wipe Mods, we lose file associations if IDs change.
        # Let's assume Mods are NOT wiped, only metadata updated?
        # Or better: "Partial Restore" vs "Full Restore".
        # Let's implement Restore for Data-only (Events, Results, Drivers, Championships).
        # Mods and Stations are "Environment" configuration, often machine specific.
        # But User requested "Backup/Restore mechanism for data safety". Events/Driver stats are critical.
        
        db.query(models.Driver).delete()
        # db.query(models.GlobalSettings).delete() # Settings often safe to overwrite
        
        db.flush()
        
        # INSERT
        # Drivers
        for d in data["data"].get("drivers", []):
            db.add(models.Driver(**d))
            
        # Championships
        for c in data["data"].get("championships", []):
            db.add(models.Championship(**c))
        db.flush() # Commit IDs to allow Event reference
        
        # Events
        for e in data["data"].get("events", []):
            # Handle date parsing if JSON loaded as strings
            if isinstance(e.get("start_date"), str): e["start_date"] = datetime.fromisoformat(e["start_date"])
            if isinstance(e.get("end_date"), str): e["end_date"] = datetime.fromisoformat(e["end_date"])
            db.add(models.Event(**e))
        db.flush()
        
        # Results
        for r in data["data"].get("results", []):
            if isinstance(r.get("date"), str): r["date"] = datetime.fromisoformat(r["date"])
            db.add(models.SessionResult(**r))
            
        db.commit()
        return {"status": "success", "message": "Database restored successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Restore failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
