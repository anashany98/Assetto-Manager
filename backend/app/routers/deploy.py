from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from .. import models, database
from ..database import SessionLocal
import logging
import shutil
import os
import subprocess
from pathlib import Path

router = APIRouter(
    prefix="/deploy",
    tags=["deploy"]
)

logger = logging.getLogger("api.deploy")

# Configuration (In a real app, from Settings DB)
# Assuming typical Steam path, but this should be configurable
DEFAULT_AC_CONTENT_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\assettocorsa\content"

@router.post("/push", response_model=dict)
def push_content_to_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    """
    Triggers a background task to sync mod content to all active stations.
    """
    stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    
    if not stations:
        return {"message": "No active stations found to deploy to.", "status": "warning"}

    # Run in background to avoid blocking API
    background_tasks.add_task(_deploy_task, stations)
    
    return {"message": f"Deployment started for {len(stations)} stations.", "status": "started"}

from concurrent.futures import ThreadPoolExecutor, as_completed

def _collect_content_sources(db: Session) -> List[Path]:
    sources: List[Path] = []
    mods = db.query(models.Mod).filter(models.Mod.is_active == True).all()
    for mod in mods:
        if not mod.source_path:
            continue
        base = Path(mod.source_path)
        content_dir = base / "content"
        if content_dir.exists():
            sources.append(content_dir)
        elif base.exists():
            sources.append(base)
    return sources

def _deploy_task(stations: List[models.Station]):
    with SessionLocal() as session:
        sources = _collect_content_sources(session)
    if not sources:
        logger.warning("No mod content found to deploy")
        return

    # MAX WORKERS: 5 concurrent copies (User Configured for 5 Servers)
    # Ensure Network/Disk can handle 5x Robocopy streams.
    MAX_WORKERS = 5
    
    logger.info(f"Starting PARALLEL deployment to {len(stations)} stations (Threads: {MAX_WORKERS})...")
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all tasks
        future_to_station = {
            executor.submit(_sync_station_content, station, sources): station.id 
            for station in stations
        }
        
        for future in as_completed(future_to_station):
            station_id = future_to_station[future]
            try:
                status = future.result()
            except Exception as e:
                logger.error(f"Deployment exception for station {station_id}: {e}")
                status = "error"

            with SessionLocal() as session:
                station = session.query(models.Station).filter(models.Station.id == station_id).first()
                if station:
                    station.status = status
                    session.commit()
                    logger.info(f"Station {station.name} finished with status: {station.status}")

def _sync_station_content(station: models.Station, sources: List[Path]) -> str:
    """
    Worker function to sync a single station.
    Returns status string.
    """
    if not station.ip_address:
        return "config_error"
        
    target_path = f"\\\\{station.ip_address}\\AssettoContent"
    
    try:
        logger.info(f"[{station.name}] Syncing...")
        
        for source_dir in sources:
            cmd = [
                "robocopy",
                str(source_dir),
                target_path,
                "/E",     # Recurse
                "/Z",     # Restartable mode (Good for large files network fail)
                "/XO",    # Exclude Older
                "/FFT",   # Fat File Time (Network share leniency)
                "/R:3",   # Retry 3 times
                "/W:5",   # Wait 5 sec
                "/MT:4",  # Internal Robocopy threads (4 is good per instance if running 3 instances)
                "/NFL",   # No File List (Reduce log spam)
                "/NDL"    # No Dir List
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode > 7:
                logger.error(f"[{station.name}] Robocopy Failed: {result.stderr}")
                return "sync_error"

        logger.info(f"[{station.name}] Sync Complete.")
        return "ready"
            
    except Exception as e:
        logger.error(f"[{station.name}] Connection Failed: {e}")
        return "connection_error"
