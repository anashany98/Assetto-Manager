from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database

router = APIRouter(
    prefix="/stations",
    tags=["stations"]
)

@router.post("/", response_model=schemas.Station)
def register_station(station: schemas.StationCreate, db: Session = Depends(database.get_db)):
    db_station = db.query(models.Station).filter(models.Station.mac_address == station.mac_address).first()
    if db_station:
        # Update existing registration info if IP/Hostname changed
        if db_station.ip_address != station.ip_address:
            db_station.ip_address = station.ip_address
        if db_station.hostname != station.hostname:
            db_station.hostname = station.hostname
        # Optional: Reset status to online on fresh register
        db_station.is_online = True 
        db.commit()
        db.refresh(db_station)
        return db_station
    
    new_station = models.Station(**station.model_dump())
    db.add(new_station)
    db.commit()
    db.refresh(new_station)
    return new_station

@router.get("/", response_model=List[schemas.Station])
def read_stations(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    stations = db.query(models.Station).offset(skip).limit(limit).all()
    return stations

import json

@router.put("/{station_id}", response_model=schemas.Station)
def update_station(station_id: int, station_update: schemas.StationUpdate, db: Session = Depends(database.get_db)):
    db_station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not db_station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    update_data = station_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_station, key, value)
    
    db.commit()
    db.refresh(db_station)
    db.refresh(db_station)
    return db_station

@router.get("/stats")
def get_station_stats(db: Session = Depends(database.get_db)):
    total = db.query(models.Station).count()
    online = db.query(models.Station).filter(models.Station.is_online == True).count()
    syncing = db.query(models.Station).filter(models.Station.status == "syncing").count()
    
    # Get active profile name if any station has one (assuming unified profile for arcade)
    active_profile = "Ninguno"
    active_station = db.query(models.Station).filter(models.Station.active_profile_id != None).first()
    if active_station and active_station.active_profile:
        active_profile = active_station.active_profile.name
        
    return {
        "total_stations": total,
        "online_stations": online,
        "syncing_stations": syncing,
        "active_profile": active_profile
    }

@router.get("/{station_id}/target-manifest")
def get_target_manifest(station_id: int, db: Session = Depends(database.get_db)):
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    if not station.active_profile:
        return {}
    
    master_manifest = {}
    for mod in station.active_profile.mods:
        if not mod.manifest: continue
        try:
            mod_manifest = json.loads(mod.manifest)
            safe_mod_name = mod.name.replace(" ", "_")
            
            for file_path, info in mod_manifest.items():
                # Construct download URL (relative to server root)
                # Assumes static mount at /static/mods/{mod_name}/content/{file_path}
                # info is {hash, size, last_modified}
                info['url'] = f"/static/mods/{safe_mod_name}/content/{file_path}"
                master_manifest[file_path] = info
        except json.JSONDecodeError:
            continue
            
    return master_manifest
