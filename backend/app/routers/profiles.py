from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Any
from .. import models, schemas, database

router = APIRouter(
    prefix="/profiles",
    tags=["profiles"]
)

@router.post("/", response_model=schemas.Profile)
def create_profile(profile: schemas.ProfileCreate, db: Session = Depends(database.get_db)):
    # 1. Create Profile
    new_profile = models.Profile(name=profile.name, description=profile.description)
    db.add(new_profile)
    db.commit()
    
    # 2. Assign Mods with Recursive Dependency Resolution
    if profile.mod_ids:
        requested_mods = db.query(models.Mod).filter(models.Mod.id.in_(profile.mod_ids)).all()
        
        final_mod_list = set()
        
        def resolve_dependencies(mods_list):
            for mod in mods_list:
                if mod.id in final_mod_list:
                    continue
                final_mod_list.add(mod.id)
                new_profile.mods.append(mod)
                resolve_dependencies(mod.dependencies)
                
        resolve_dependencies(requested_mods)
        db.commit()
        
    db.refresh(new_profile)
    return new_profile

@router.get("/", response_model=List[schemas.Profile])
def list_profiles(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    return db.query(models.Profile).offset(skip).limit(limit).all()

@router.get("/{profile_id}", response_model=schemas.Profile)
def get_profile(profile_id: int, db: Session = Depends(database.get_db)):
    profile = db.query(models.Profile).filter(models.Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile

@router.put("/{profile_id}/assign", response_model=schemas.Station)
def assign_profile_to_station(profile_id: int, payload: Any = Body(...), db: Session = Depends(database.get_db)):
    if isinstance(payload, dict):
        station_id = payload.get("station_id")
    else:
        station_id = payload

    try:
        station_id = int(station_id)
    except Exception:
        raise HTTPException(status_code=400, detail="station_id is required")
    # Verify Profile exists
    profile = db.query(models.Profile).filter(models.Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    # Verify Station exists
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # Assign
    station.active_profile = profile
    station.status = "syncing" # Trigger sync flow on next heartbeat
    db.commit()
    db.refresh(station)
    return station
