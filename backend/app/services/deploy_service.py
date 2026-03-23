import logging
import os
import subprocess
from pathlib import Path
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from .. import models, database
from ..database import SessionLocal

logger = logging.getLogger("api.deploy_service")

# Configuration
# Assuming typical Steam path, but this should be configurable
DEFAULT_AC_CONTENT_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\assettocorsa\content"
ROBOCOPY_TIMEOUT_SECONDS = int(os.getenv("ROBOCOPY_TIMEOUT_SECONDS", "3600"))

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

def _sync_station_content(station_id: int, station_name: str, ip_address: str, sources: List[Path]) -> str:
    """
    Worker function to sync a single station.
    Returns status string.
    """
    if not ip_address:
        return "config_error"
        
    target_path = f"\\\\{ip_address}\\AssettoContent"
    
    try:
        logger.info(f"[{station_name}] Syncing...")
        
        for source_dir in sources:
            cmd = [
                "robocopy",
                str(source_dir),
                target_path,
                "/E",     # Recurse
                "/Z",     # Restartable mode
                "/XO",    # Exclude Older
                "/FFT",   # Fat File Time
                "/R:3",   # Retry 3 times
                "/W:5",   # Wait 5 sec
                "/MT:4",  # Internal Robocopy threads
                "/NFL",   # No File List
                "/NDL"    # No Dir List
            ]
            
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=ROBOCOPY_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                logger.error(f"[{station_name}] Robocopy timed out after {ROBOCOPY_TIMEOUT_SECONDS}s")
                return "sync_error"
            
            # Robocopy return codes 0-7 are success/info. 8+ is error.
            if result.returncode > 7:
                logger.error(f"[{station_name}] Robocopy Failed: {result.stderr}")
                return "sync_error"

        logger.info(f"[{station_name}] Sync Complete.")
        return "ready"
            
    except Exception as e:
        logger.error(f"[{station_name}] Connection Failed: {e}")
        return "connection_error"

def _deploy_task_sync(station_ids: List[int]):
    """
    Internal synchronous task that manages the thread pool.
    """
    with SessionLocal() as db:
        sources = _collect_content_sources(db)
        stations = db.query(models.Station).filter(models.Station.id.in_(station_ids)).all()
        # Store info to avoid session issues in threads
        station_info = [{"id": s.id, "name": s.name, "ip": s.ip_address} for s in stations]
        
    if not sources or not station_info:
        logger.warning("No mod content or active stations found to deploy")
        return

    MAX_WORKERS = int(os.getenv("DEPLOY_MAX_WORKERS", "5"))
    logger.info(f"Starting PARALLEL deployment to {len(station_info)} stations (Threads: {MAX_WORKERS})...")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_station = {
            executor.submit(_sync_station_content, info["id"], info["name"], info["ip"], sources): info["id"]
            for info in station_info
        }
        
        for future in as_completed(future_to_station):
            station_id = future_to_station[future]
            try:
                status = future.result()
            except Exception as e:
                logger.error(f"Deployment exception for station {station_id}: {e}")
                status = "error"

            with SessionLocal() as db:
                station = db.query(models.Station).filter(models.Station.id == station_id).first()
                if station:
                    station.status = status
                    db.commit()
                    logger.info(f"Station {station.name} finished with status: {status}")

def trigger_push(db: Session, background_tasks: BackgroundTasks):
    """
    Public entry point to trigger a push to all active stations.
    """
    stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    if not stations:
        logger.info("No active stations to deploy to.")
        return False
        
    station_ids = [s.id for s in stations]
    background_tasks.add_task(_deploy_task_sync, station_ids)
    return True

def trigger_scheduled_push():
    """
    Entry point for scheduler (no background_tasks object, runs directly in thread).
    """
    with SessionLocal() as db:
        stations = db.query(models.Station).filter(models.Station.is_active == True).all()
        if not stations:
            return
        station_ids = [s.id for s in stations]
        logger.info("Starting scheduled global mod push...")
        _deploy_task_sync(station_ids)
