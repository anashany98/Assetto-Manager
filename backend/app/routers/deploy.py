from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from .. import models, database
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
    Triggers a background task to sync 'backend/storage/mods/content' 
    to ALL active stations.
    """
    stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    
    if not stations:
        return {"message": "No active stations found to deploy to.", "status": "warning"}

    # Run in background to avoid blocking API
    background_tasks.add_task(_deploy_task, stations, db)
    
    return {"message": f"Deployment started for {len(stations)} stations.", "status": "started"}

from concurrent.futures import ThreadPoolExecutor, as_completed

def _deploy_task(stations: List[models.Station], db: Session):
    source_dir = Path("backend/storage/mods/content").resolve()
    
    if not source_dir.exists():
        logger.warning("No content to deploy (backend/storage/mods/content missing)")
        return

    # MAX WORKERS: 3 concurrent copies
    # 3x Robocopy is enough to saturate a standard SATA SSD or 1Gbps Link
    # Too many workers = Disk Trashing (Head jumping) -> Slower overall
    MAX_WORKERS = 3
    
    logger.info(f"Starting PARALLEL deployment to {len(stations)} stations (Threads: {MAX_WORKERS})...")
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all tasks
        future_to_station = {
            executor.submit(_sync_station_content, station, source_dir): station 
            for station in stations
        }
        
        for future in as_completed(future_to_station):
            station = future_to_station[future]
            try:
                status = future.result()
                station.status = status
            except Exception as e:
                logger.error(f"Deployment exception for {station.name}: {e}")
                station.status = "error"
            
            # We need a new DB session here because objects from the main thread 
            # might be detached or we need thread safety. 
            # Ideally each thread handles its own DB, but for simple status update
            # we can do it here in the main callback loop.
            
            # Re-fetch to ensure attached? Or just update ID
            # Simpler to just log for now as DB threading complex in rapid updates
            logger.info(f"Station {station.name} finished with status: {station.status}")

def _sync_station_content(station: models.Station, source_dir: Path) -> str:
    """
    Worker function to sync a single station.
    Returns status string.
    """
    if not station.ip_address:
        return "config_error"
        
    target_path = f"\\\\{station.ip_address}\\AssettoContent"
    
    try:
        logger.info(f"[{station.name}] Syncing...")
        
        # Robocopy Config for Large Deployments
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
        
        # Capture output only on error or extensive debug
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Robocopy Exit Codes: < 8 is Success
        if result.returncode > 7:
            logger.error(f"[{station.name}] Robocopy Failed: {result.stderr}")
            return "sync_error"
        else:
            logger.info(f"[{station.name}] Sync Complete.")
            return "ready"
            
    except Exception as e:
        logger.error(f"[{station.name}] Connection Failed: {e}")
        return "connection_error"
