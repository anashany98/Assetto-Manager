from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from ..database import get_db
from .. import models, schemas
from .auth import require_admin, require_admin_or_public_token

router = APIRouter(
    prefix="/maintenance",
    tags=["maintenance"],
    dependencies=[Depends(require_admin)]
)

# --- Maintenance Logs ---

@router.post("/logs", response_model=schemas.StationMaintenance)
def create_maintenance_log(
    log: schemas.StationMaintenanceCreate,
    db: Session = Depends(get_db)
):
    """Record a maintenance action for a station."""
    db_log = models.StationMaintenance(**log.model_dump())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

@router.get("/logs", response_model=List[schemas.StationMaintenance])
def get_all_maintenance_logs(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get recent maintenance logs across all stations."""
    return db.query(models.StationMaintenance).order_by(
        models.StationMaintenance.date.desc()
    ).limit(limit).all()

@router.get("/logs/{station_id}", response_model=List[schemas.StationMaintenance])
def get_station_maintenance_logs(
    station_id: int,
    db: Session = Depends(get_db)
):
    """Get all maintenance logs for a specific station."""
    return db.query(models.StationMaintenance).filter(
        models.StationMaintenance.station_id == station_id
    ).order_by(models.StationMaintenance.date.desc()).all()

@router.get("/usage/summary")
def get_usage_summary(db: Session = Depends(get_db)):
    """Get total usage hours summed across all stations."""
    all_usage = db.query(models.HardwareUsage).all()
    return {
        "total_hours_pc": round(sum(u.total_hours_pc for u in all_usage), 1),
        "total_hours_base": round(sum(u.total_hours_base for u in all_usage), 1),
        "total_hours_pedals": round(sum(u.total_hours_pedals for u in all_usage), 1),
        "total_hours_vr": round(sum(u.total_hours_vr for u in all_usage), 1),
        "station_count": len(all_usage),
    }

# --- Hardware Usage ---

@router.get("/usage/{station_id}", response_model=schemas.HardwareUsage)
def get_hardware_usage(
    station_id: int,
    db: Session = Depends(get_db)
):
    """Get cumulative usage hours for a station's hardware."""
    usage = db.query(models.HardwareUsage).filter(
        models.HardwareUsage.station_id == station_id
    ).first()
    
    if not usage:
        # Initialize if not exists
        usage = models.HardwareUsage(station_id=station_id)
        db.add(usage)
        db.commit()
        db.refresh(usage)
        
    return usage

@router.post("/usage/{station_id}/update")
def update_hardware_usage(
    station_id: int,
    hours_base: float = 0,
    hours_pedals: float = 0,
    hours_vr: float = 0,
    hours_pc: float = 0,
    db: Session = Depends(get_db)
):
    """Update (increment) hardware usage hours. Typically called by internal services."""
    usage = db.query(models.HardwareUsage).filter(
        models.HardwareUsage.station_id == station_id
    ).first()
    
    if not usage:
        usage = models.HardwareUsage(station_id=station_id)
        db.add(usage)
    
    usage.total_hours_base += hours_base
    usage.total_hours_pedals += hours_pedals
    usage.total_hours_vr += hours_vr
    usage.total_hours_pc += hours_pc
    
    db.commit()
    db.refresh(usage)
    return usage

@router.post("/usage/{station_id}/reset")
def reset_hardware_usage(
    station_id: int,
    component: str, # base, pedals, vr, pc
    db: Session = Depends(get_db)
):
    """Reset usage hours for a specific component (e.g. after replacement)."""
    usage = db.query(models.HardwareUsage).filter(
        models.HardwareUsage.station_id == station_id
    ).first()
    
    if not usage:
        raise HTTPException(status_code=404, detail="Usage record not found")
        
    if component == "base": usage.total_hours_base = 0
    elif component == "pedals": usage.total_hours_pedals = 0
    elif component == "vr": usage.total_hours_vr = 0
    elif component == "pc": usage.total_hours_pc = 0
    else:
        raise HTTPException(status_code=400, detail="Invalid component type")
        
    usage.last_maintenance_date = datetime.now(timezone.utc)
    db.commit()
    return {"status": "reset", "component": component}

# --- Consent Logs ---

@router.post("/consent", response_model=schemas.ConsentLog)
def log_driver_consent(
    consent: schemas.ConsentLogCreate,
    db: Session = Depends(get_db)
):
    """Record a driver's legal/GDPR consent."""
    db_consent = models.ConsentLog(**consent.model_dump())
    db.add(db_consent)
    db.commit()
    db.refresh(db_consent)
    return db_consent

@router.get("/consent/{driver_id}", response_model=List[schemas.ConsentLog])
def get_driver_consents(
    driver_id: int,
    db: Session = Depends(get_db)
):
    """Get all consent logs for a specific driver."""
    return db.query(models.ConsentLog).filter(
        models.ConsentLog.driver_id == driver_id
    ).order_by(models.ConsentLog.signed_at.desc()).all()
