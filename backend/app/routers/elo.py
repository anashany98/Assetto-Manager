"""
ELO Rating API Router
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional

from ..database import get_db
from ..models import Driver
from ..services.elo import (
    get_elo_tier, 
    get_elo_color, 
    calculate_race_elo_changes,
    update_driver_elo,
    DEFAULT_RATING
)

router = APIRouter(
    prefix="/elo",
    tags=["elo"]
)


@router.get("/rankings")
def get_elo_rankings(
    limit: int = 50,
    tier: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get drivers ranked by ELO rating."""
    query = db.query(Driver).filter(Driver.total_races > 0)
    
    # Filter by tier if specified
    if tier:
        tier_ranges = {
            "grandmaster": (2400, 9999),
            "master": (2000, 2399),
            "diamond": (1700, 1999),
            "platinum": (1400, 1699),
            "gold": (1200, 1399),
            "silver": (1000, 1199),
            "bronze": (0, 999),
        }
        if tier in tier_ranges:
            min_elo, max_elo = tier_ranges[tier]
            query = query.filter(Driver.elo_rating >= min_elo, Driver.elo_rating <= max_elo)
    
    drivers = query.order_by(desc(Driver.elo_rating)).limit(limit).all()
    
    return [
        {
            "rank": idx + 1,
            "name": d.name,
            "elo_rating": round(d.elo_rating or DEFAULT_RATING, 1),
            "tier": get_elo_tier(d.elo_rating or DEFAULT_RATING),
            "tier_color": get_elo_color(get_elo_tier(d.elo_rating or DEFAULT_RATING)),
            "total_races": d.total_races or 0,
            "total_wins": d.total_wins or 0,
            "win_rate": round((d.total_wins / d.total_races * 100) if d.total_races > 0 else 0, 1),
        }
        for idx, d in enumerate(drivers)
    ]


@router.get("/driver/{driver_name}")
def get_driver_elo(driver_name: str, db: Session = Depends(get_db)):
    """Get ELO rating details for a specific driver."""
    driver = db.query(Driver).filter(Driver.name == driver_name).first()
    
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    elo = driver.elo_rating or DEFAULT_RATING
    tier = get_elo_tier(elo)
    
    # Get ranking position
    rank = db.query(Driver).filter(
        Driver.elo_rating > elo,
        Driver.total_races > 0
    ).count() + 1
    
    return {
        "name": driver.name,
        "elo_rating": round(elo, 1),
        "tier": tier,
        "tier_color": get_elo_color(tier),
        "rank": rank,
        "total_races": driver.total_races or 0,
        "total_wins": driver.total_wins or 0,
        "total_podiums": driver.total_podiums or 0,
    }


@router.get("/tiers")
def get_tier_info():
    """Get information about all ELO tiers."""
    tiers = [
        {"name": "grandmaster", "min_elo": 2400, "color": "#FF4500", "icon": "👑"},
        {"name": "master", "min_elo": 2000, "color": "#9B30FF", "icon": "💎"},
        {"name": "diamond", "min_elo": 1700, "color": "#00BFFF", "icon": "💠"},
        {"name": "platinum", "min_elo": 1400, "color": "#00CED1", "icon": "🔷"},
        {"name": "gold", "min_elo": 1200, "color": "#FFD700", "icon": "🥇"},
        {"name": "silver", "min_elo": 1000, "color": "#C0C0C0", "icon": "🥈"},
        {"name": "bronze", "min_elo": 0, "color": "#CD7F32", "icon": "🥉"},
    ]
    return tiers
