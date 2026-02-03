"""
Mod Sync Module: Synchronizes content across all simulator stations.
Scans all stations for installed cars/tracks, registers them in the database,
and replicates missing content to ensure all stations have identical libraries.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from .. import models, database
from ..database import SessionLocal
from .websockets import manager
import logging
import json
import asyncio

logger = logging.getLogger("api.deploy.sync")

router = APIRouter(
    prefix="/deploy",
    tags=["deploy"]
)


@router.post("/sync-all", response_model=dict)
async def sync_all_stations(
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    """
    Scans all active stations for installed content (cars/tracks),
    computes the union of all content, registers any new mods in the database,
    and replicates missing content to stations that don't have it.
    """
    stations = db.query(models.Station).filter(
        models.Station.is_active == True,
        models.Station.is_online == True
    ).all()
    
    if len(stations) < 1:
        return {"message": "No online stations found.", "status": "warning"}
    
    # Collect content from all stations (from cached data)
    all_content = _collect_all_station_content(stations)
    
    if not all_content:
        return {"message": "No content found on any station.", "status": "warning"}
    
    # Compute union of all content
    union_cars, union_tracks = _compute_content_union(all_content)
    
    if not union_cars and not union_tracks:
        return {"message": "No cars or tracks found.", "status": "warning"}
    
    # Register new mods in database
    stats = _register_discovered_mods(db, union_cars, union_tracks)
    
    # Schedule background task for content sync between stations
    asyncio.create_task(
        _sync_missing_content_task(
            [s.id for s in stations],
            all_content,
            union_cars,
            union_tracks
        )
    )
    
    return {
        "message": f"Sync started. Found {len(union_cars)} cars, {len(union_tracks)} tracks. Registered {stats['new_mods']} new mods.",
        "status": "started",
        "stats": stats
    }


def _collect_all_station_content(stations: List[models.Station]) -> Dict[int, Dict[str, Any]]:
    """
    Collects content_cache from all stations.
    Returns: {station_id: {"ip": ..., "name": ..., "cars": [...], "tracks": [...]}, ...}
    """
    all_content = {}
    for station in stations:
        if station.content_cache:
            all_content[station.id] = {
                "ip": station.ip_address,
                "name": station.name,
                "cars": station.content_cache.get("cars", []),
                "tracks": station.content_cache.get("tracks", [])
            }
    return all_content


def _compute_content_union(all_content: Dict[int, Dict[str, Any]]) -> tuple:
    """
    Computes the union of all cars and tracks across all stations.
    Returns: (dict of car_id -> info, dict of track_id -> info)
    """
    union_cars = {}
    union_tracks = {}
    
    for station_id, content in all_content.items():
        for car in content.get("cars", []):
            car_id = car.get("id")
            if car_id and car_id not in union_cars:
                union_cars[car_id] = {
                    "name": car.get("name", car_id),
                    "brand": car.get("brand", ""),
                    "source_station_id": station_id,
                    "source_ip": content.get("ip")
                }
        
        for track in content.get("tracks", []):
            track_id = track.get("id")
            if track_id and track_id not in union_tracks:
                union_tracks[track_id] = {
                    "name": track.get("name", track_id),
                    "source_station_id": station_id,
                    "source_ip": content.get("ip")
                }
    
    return union_cars, union_tracks


def _register_discovered_mods(db: Session, union_cars: dict, union_tracks: dict) -> dict:
    """
    Registers any NEW mods in the database that don't already exist.
    """
    stats = {"new_mods": 0, "cars_registered": 0, "tracks_registered": 0}

    existing_cars = db.query(models.Mod).filter(models.Mod.type == "car").all()
    existing_car_folders = {
        (m.manifest or {}).get("folder_name")
        for m in existing_cars
        if (m.manifest or {}).get("folder_name")
    }

    for car_id, car_info in union_cars.items():
        if car_id in existing_car_folders:
            continue
        source_ip = car_info.get("source_ip", "")
        new_mod = models.Mod(
            name=car_info.get("name", car_id),
            version="discovered",
            type="car",
            status="installed",
            source_path=f"\\\\{source_ip}\\AssettoContent\\content\\cars\\{car_id}" if source_ip else None,
            is_active=True,
            manifest={"folder_name": car_id, "brand": car_info.get("brand", "")}
        )
        db.add(new_mod)
        existing_car_folders.add(car_id)
        stats["new_mods"] += 1
        stats["cars_registered"] += 1

    existing_tracks = db.query(models.Mod).filter(models.Mod.type == "track").all()
    existing_track_folders = {
        (m.manifest or {}).get("folder_name")
        for m in existing_tracks
        if (m.manifest or {}).get("folder_name")
    }
    
    for track_id, track_info in union_tracks.items():
        if track_id in existing_track_folders:
            continue
        source_ip = track_info.get("source_ip", "")
        new_mod = models.Mod(
            name=track_info.get("name", track_id),
            version="discovered",
            type="track",
            status="installed",
            source_path=f"\\\\{source_ip}\\AssettoContent\\content\\tracks\\{track_id}" if source_ip else None,
            is_active=True,
            manifest={"folder_name": track_id}
        )
        db.add(new_mod)
        existing_track_folders.add(track_id)
        stats["new_mods"] += 1
        stats["tracks_registered"] += 1
    
    db.commit()
    logger.info(f"Registered {stats['new_mods']} new mods ({stats['cars_registered']} cars, {stats['tracks_registered']} tracks)")
    return stats


async def _sync_missing_content_task(station_ids: List[int], all_content: dict, union_cars: dict, union_tracks: dict):
    """
    Background task to send copy commands to agents for missing content.
    """
    with SessionLocal() as session:
        stations = session.query(models.Station).filter(models.Station.id.in_(station_ids)).all()
        
        for station in stations:
            station_data = all_content.get(station.id, {})
            station_cars = set(c.get("id") for c in station_data.get("cars", []))
            station_tracks = set(t.get("id") for t in station_data.get("tracks", []))
            
            missing_cars = set(union_cars.keys()) - station_cars
            missing_tracks = set(union_tracks.keys()) - station_tracks
            
            if not missing_cars and not missing_tracks:
                logger.info(f"[{station.name}] Already has all content. Skipping.")
                continue
            
            logger.info(f"[{station.name}] Missing {len(missing_cars)} cars, {len(missing_tracks)} tracks. Syncing...")
            
            ws = manager.active_agents.get(station.id)
            if not ws:
                logger.warning(f"[{station.name}] No WebSocket connection. Cannot sync.")
                continue
            
            try:
                for car_id in missing_cars:
                    car_info = union_cars[car_id]
                    await _send_copy_command(ws, "car", car_id, car_info["source_ip"])
                
                for track_id in missing_tracks:
                    track_info = union_tracks[track_id]
                    await _send_copy_command(ws, "track", track_id, track_info["source_ip"])
                logger.info(f"[{station.name}] Sent {len(missing_cars) + len(missing_tracks)} copy commands.")
            except Exception as e:
                logger.error(f"[{station.name}] Failed to send copy commands: {e}")


async def _send_copy_command(ws, content_type: str, content_id: str, source_ip: str):
    """Send a copy_content command to an agent via WebSocket."""
    await ws.send_text(json.dumps({
        "command": "copy_content",
        "type": content_type,
        "id": content_id,
        "source_ip": source_ip
    }))
