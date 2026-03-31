"""
Seed stock content (cars and tracks) from Assetto Corsa base game.

This module provides functions to seed the database with all stock
vehicles and tracks from Assetto Corsa, ensuring that new installations
have content available immediately.
"""

import os
import json
import logging
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

# Path to the stock content JSON file
STOCK_CONTENT_PATH = os.path.join(os.path.dirname(__file__), "data", "stock_content.json")


def load_stock_content() -> Dict[str, List]:
    """Load stock content from JSON file."""
    try:
        with open(STOCK_CONTENT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning(f"Stock content file not found: {STOCK_CONTENT_PATH}")
        return {"cars": [], "tracks": []}
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse stock content JSON: {e}")
        return {"cars": [], "tracks": []}


def get_or_create_tag(db: Session, name: str, color: str = "#3b82f6") -> models.Tag:
    """Get or create a tag with the given name and color."""
    tag = db.query(models.Tag).filter(models.Tag.name == name).first()
    if not tag:
        tag = models.Tag(name=name, color=color)
        db.add(tag)
        db.flush()  # Flush to get the ID without committing
    return tag


def seed_stock_content(db: Session, force: bool = False) -> Dict[str, any]:
    """
    Seed stock content if not already present in the database.
    
    Args:
        db: Database session
        force: If True, re-seed even if stock content exists
        
    Returns:
        Dictionary with seeding results
    """
    # Check if stock content already exists
    existing_stock_count = db.query(models.Mod).filter(models.Mod.is_stock == True).count()
    
    if existing_stock_count > 0 and not force:
        logger.info(f"Stock content already exists ({existing_stock_count} items). Skipping seed.")
        return {
            "message": "Stock content already seeded",
            "skipped": True,
            "existing_stock_count": existing_stock_count
        }
    
    # Load stock content from JSON
    stock_data = load_stock_content()
    
    if not stock_data.get("cars") and not stock_data.get("tracks"):
        logger.warning("No stock content found in JSON file")
        return {"message": "No stock content found", "skipped": True}
    
    # If forcing, delete existing stock content first
    if force and existing_stock_count > 0:
        logger.info(f"Force mode: Deleting {existing_stock_count} existing stock items")
        db.query(models.Mod).filter(models.Mod.is_stock == True).delete()
        db.commit()
    
    # Get or create tags
    stock_tag = get_or_create_tag(db, "Stock", "#8b5cf6")
    car_tag = get_or_create_tag(db, "Car", "#3b82f6")
    track_tag = get_or_create_tag(db, "Track", "#10b981")
    
    # Seed cars
    cars_added = 0
    for car in stock_data.get("cars", []):
        # Check if car already exists
        existing = db.query(models.Mod).filter(
            models.Mod.name == car["name"],
            models.Mod.type == "car"
        ).first()
        
        if existing:
            # Update existing mod to mark as stock if not already
            if not existing.is_stock:
                existing.is_stock = True
                if stock_tag not in existing.tags:
                    existing.tags.append(stock_tag)
            continue
        
        # Create new mod entry
        mod = models.Mod(
            name=car["name"],
            type="car",
            version="stock",
            source_path=f"stock::{car['folder_name']}",
            is_active=True,
            is_stock=True,
            status="approved",
            manifest=json.dumps(car.get("specs", {}))
        )
        
        # Add tags
        mod.tags.append(stock_tag)
        mod.tags.append(car_tag)
        
        # Add brand tag if available
        brand = car.get("brand")
        if brand:
            brand_tag = get_or_create_tag(db, brand, "#6366f1")
            mod.tags.append(brand_tag)
        
        # Add class tag if available
        car_class = car.get("class")
        if car_class:
            class_tag = get_or_create_tag(db, car_class, "#f59e0b")
            mod.tags.append(class_tag)
        
        db.add(mod)
        cars_added += 1
    
    # Seed tracks
    tracks_added = 0
    for track in stock_data.get("tracks", []):
        layouts = track.get("layouts", [{"layout_id": "default", "name": "Default"}])
        
        for layout in layouts:
            # Build full track name with layout if there are multiple layouts
            if len(layouts) > 1:
                full_name = f"{track['name']} - {layout['name']}"
            else:
                full_name = track["name"]
            
            source_path = f"stock::{track['folder_name']}/{layout['layout_id']}"
            
            # Check if track already exists
            existing = db.query(models.Mod).filter(
                models.Mod.name == full_name,
                models.Mod.type == "track"
            ).first()
            
            if existing:
                # Update existing mod to mark as stock if not already
                if not existing.is_stock:
                    existing.is_stock = True
                    if stock_tag not in existing.tags:
                        existing.tags.append(stock_tag)
                continue
            
            # Create new mod entry
            mod = models.Mod(
                name=full_name,
                type="track",
                version="stock",
                source_path=source_path,
                is_active=True,
                is_stock=True,
                status="approved",
                manifest=json.dumps({
                    "layout": layout["name"],
                    "layout_id": layout["layout_id"],
                    "country": layout.get("country", "Unknown")
                })
            )
            
            # Add tags
            mod.tags.append(stock_tag)
            mod.tags.append(track_tag)
            
            # Add country tag if available
            country = layout.get("country")
            if country:
                country_tag = get_or_create_tag(db, country, "#ef4444")
                mod.tags.append(country_tag)
            
            db.add(mod)
            tracks_added += 1
    
    # Commit changes
    try:
        db.commit()
        logger.info(f"Stock content seeded: {cars_added} cars, {tracks_added} tracks")
        return {
            "message": "Stock content seeded successfully",
            "skipped": False,
            "cars_added": cars_added,
            "tracks_added": tracks_added,
            "total_stock_items": db.query(models.Mod).filter(models.Mod.is_stock == True).count()
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to seed stock content: {e}")
        return {"message": f"Failed to seed stock content: {e}", "error": True}


def update_station_content_cache_with_stock(db: Session, station: models.Station) -> None:
    """
    Update station content cache to include both stock and mod content.
    
    This ensures the kiosk UI shows all available content.
    """
    # Get all active mods (both stock and custom)
    all_cars = db.query(models.Mod).filter(
        models.Mod.type == "car",
        models.Mod.is_active == True
    ).all()
    
    all_tracks = db.query(models.Mod).filter(
        models.Mod.type == "track",
        models.Mod.is_active == True
    ).all()
    
    # Build cache data
    cache_data = {
        "cars": [
            {
                "id": c.source_path.split("::")[-1] if c.source_path and "::" in c.source_path else (c.source_path or str(c.id)),
                "name": c.name,
                "brand": c.name.split(" ")[0] if " " in c.name else "Brand",
                "is_stock": c.is_stock,
                "specs": json.loads(c.manifest) if c.manifest else {}
            }
            for c in all_cars
        ],
        "tracks": [
            {
                "id": t.source_path.split("::")[-1] if t.source_path and "::" in t.source_path else (t.source_path or str(t.id)),
                "name": t.name,
                "is_stock": t.is_stock,
                "layout": t.name.split(" - ")[-1] if " - " in t.name else "Default"
            }
            for t in all_tracks
        ]
    }
    
    # Update station
    station.content_cache = cache_data
    from datetime import datetime
    station.content_cache_updated = datetime.utcnow()
    
    try:
        db.commit()
        logger.info(f"Station {station.id} content cache updated with {len(cache_data['cars'])} cars and {len(cache_data['tracks'])} tracks")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update station content cache: {e}")


def get_stock_stats(db: Session) -> Dict[str, int]:
    """Get statistics about stock content."""
    stock_cars = db.query(models.Mod).filter(
        models.Mod.is_stock == True,
        models.Mod.type == "car"
    ).count()
    
    stock_tracks = db.query(models.Mod).filter(
        models.Mod.is_stock == True,
        models.Mod.type == "track"
    ).count()
    
    mod_cars = db.query(models.Mod).filter(
        models.Mod.is_stock == False,
        models.Mod.type == "car"
    ).count()
    
    mod_tracks = db.query(models.Mod).filter(
        models.Mod.is_stock == False,
        models.Mod.type == "track"
    ).count()
    
    return {
        "stock_cars": stock_cars,
        "stock_tracks": stock_tracks,
        "mod_cars": mod_cars,
        "mod_tracks": mod_tracks,
        "total_cars": stock_cars + mod_cars,
        "total_tracks": stock_tracks + mod_tracks
    }
