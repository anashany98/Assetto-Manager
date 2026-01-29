"""
Pilot Portal Router - Public endpoints for drivers to view their personal statistics
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from .. import database, models
from .leaderboard import format_lap_time

router = APIRouter(
    prefix="/portal",
    tags=["pilot-portal"]
)

# --- Response Schemas ---

class SessionHistoryItem(BaseModel):
    id: int
    car: str
    track: str
    best_lap: str
    best_lap_raw: int
    session_type: str
    date: datetime

class DriverStats(BaseModel):
    total_sessions: int
    total_laps: int
    total_time_seconds: int
    favorite_car: Optional[str]
    favorite_track: Optional[str]
    best_lap_time: Optional[str]
    best_lap_track: Optional[str]

class BadgeInfo(BaseModel):
    name: str
    description: str
    icon: str
    unlocked_at: Optional[datetime]

class PortalProfile(BaseModel):
    driver_name: str
    email: Optional[str]
    elo_rating: float
    total_wins: int
    total_podiums: int
    total_races: int
    membership_tier: str
    loyalty_points: int
    created_at: datetime


# --- Endpoints ---

@router.get("/{identifier}/profile")
def get_pilot_profile(identifier: str, db: Session = Depends(database.get_db)):
    """
    Get pilot profile by email or driver name.
    Public endpoint - no auth required.
    """
    # Try to find by email first, then by name
    driver = db.query(models.Driver).filter(
        (models.Driver.email == identifier) | (models.Driver.name == identifier)
    ).first()
    
    if not driver:
        raise HTTPException(status_code=404, detail="Piloto no encontrado")
    
    return PortalProfile(
        driver_name=driver.name,
        email=driver.email,
        elo_rating=driver.elo_rating or 1200.0,
        total_wins=driver.total_wins or 0,
        total_podiums=driver.total_podiums or 0,
        total_races=driver.total_races or 0,
        membership_tier=driver.membership_tier or "bronze",
        loyalty_points=driver.loyalty_points or 0,
        created_at=driver.created_at
    )


@router.get("/{identifier}/sessions", response_model=List[SessionHistoryItem])
def get_pilot_sessions(
    identifier: str, 
    limit: int = 20,
    skip: int = 0,
    db: Session = Depends(database.get_db)
):
    """
    Get session history for a pilot.
    Public endpoint - no auth required.
    """
    # Find sessions by driver name (SessionResult uses driver_name string)
    # First try to resolve identifier to driver name if it's an email
    driver = db.query(models.Driver).filter(models.Driver.email == identifier).first()
    driver_name = driver.name if driver else identifier
    
    sessions = db.query(models.SessionResult).filter(
        models.SessionResult.driver_name == driver_name
    ).order_by(desc(models.SessionResult.date)).offset(skip).limit(limit).all()
    
    return [
        SessionHistoryItem(
            id=s.id,
            car=s.car_model,
            track=s.track_name,
            best_lap=format_lap_time(s.best_lap),
            best_lap_raw=s.best_lap,
            session_type=s.session_type or "practice",
            date=s.date
        ) for s in sessions
    ]


@router.get("/{identifier}/stats")
def get_pilot_stats(identifier: str, db: Session = Depends(database.get_db)):
    """
    Get aggregated statistics for a pilot.
    """
    driver = db.query(models.Driver).filter(models.Driver.email == identifier).first()
    driver_name = driver.name if driver else identifier
    
    sessions = db.query(models.SessionResult).filter(
        models.SessionResult.driver_name == driver_name
    ).all()
    
    if not sessions:
        return DriverStats(
            total_sessions=0,
            total_laps=0,
            total_time_seconds=0,
            favorite_car=None,
            favorite_track=None,
            best_lap_time=None,
            best_lap_track=None
        )
    
    # Calculate stats
    total_sessions = len(sessions)
    total_laps = sum(1 for _ in sessions)  # Each result is a lap essentially
    
    # Best lap
    best_session = min(sessions, key=lambda s: s.best_lap if s.best_lap and s.best_lap > 0 else float('inf'))
    best_lap_time = format_lap_time(best_session.best_lap) if best_session.best_lap else None
    best_lap_track = best_session.track_name if best_session else None
    
    # Favorites (most used)
    car_counts = {}
    track_counts = {}
    for s in sessions:
        car_counts[s.car_model] = car_counts.get(s.car_model, 0) + 1
        track_counts[s.track_name] = track_counts.get(s.track_name, 0) + 1
    
    favorite_car = max(car_counts, key=car_counts.get) if car_counts else None
    favorite_track = max(track_counts, key=track_counts.get) if track_counts else None
    
    return DriverStats(
        total_sessions=total_sessions,
        total_laps=total_laps,
        total_time_seconds=0,
        favorite_car=favorite_car,
        favorite_track=favorite_track,
        best_lap_time=best_lap_time,
        best_lap_track=best_lap_track
    )


@router.get("/{identifier}/badges", response_model=List[BadgeInfo])
def get_pilot_badges(identifier: str, db: Session = Depends(database.get_db)):
    """
    Get badges/achievements for a pilot.
    Returns unlocked badges based on performance.
    """
    driver = db.query(models.Driver).filter(
        (models.Driver.email == identifier) | (models.Driver.name == identifier)
    ).first()
    
    if not driver:
        return []
    
    badges = []
    
    # First Session Badge
    if driver.total_races and driver.total_races >= 1:
        badges.append(BadgeInfo(
            name="Primera Carrera",
            description="Completaste tu primera sesión",
            icon="🏁",
            unlocked_at=driver.created_at
        ))
    
    # 10 Races Badge
    if driver.total_races and driver.total_races >= 10:
        badges.append(BadgeInfo(
            name="Piloto Regular",
            description="Completaste 10 sesiones",
            icon="🏎️",
            unlocked_at=None
        ))
    
    # First Win Badge
    if driver.total_wins and driver.total_wins >= 1:
        badges.append(BadgeInfo(
            name="Primera Victoria",
            description="Ganaste tu primera carrera",
            icon="🥇",
            unlocked_at=None
        ))
    
    # Podium Badge
    if driver.total_podiums and driver.total_podiums >= 5:
        badges.append(BadgeInfo(
            name="Podio Habitual",
            description="Conseguiste 5 podios",
            icon="🏆",
            unlocked_at=None
        ))
    
    # High ELO Badge
    if driver.elo_rating and driver.elo_rating >= 1500:
        badges.append(BadgeInfo(
            name="Piloto Elite",
            description="Alcanzaste ELO 1500+",
            icon="⭐",
            unlocked_at=None
        ))
    
    # Loyalty Badge
    if driver.membership_tier in ["gold", "platinum"]:
        badges.append(BadgeInfo(
            name="Cliente VIP",
            description=f"Nivel {driver.membership_tier.title()}",
            icon="💎",
            unlocked_at=None
        ))
    
    return badges


@router.get("/{identifier}/rankings")
def get_pilot_rankings(identifier: str, limit: int = 5, db: Session = Depends(database.get_db)):
    """
    Get pilot's position in various leaderboards.
    """
    driver = db.query(models.Driver).filter(
        (models.Driver.email == identifier) | (models.Driver.name == identifier)
    ).first()
    
    driver_name = driver.name if driver else identifier
    
    # Get pilot's best times per track
    results = db.query(models.SessionResult).filter(
        models.SessionResult.driver_name == driver_name,
        models.SessionResult.best_lap > 0
    ).all()
    
    rankings = []
    tracks_seen = set()
    
    for r in results:
        if r.track_name in tracks_seen:
            continue
        tracks_seen.add(r.track_name)
        
        # Count how many people are faster
        faster_count = db.query(models.SessionResult).filter(
            models.SessionResult.track_name == r.track_name,
            models.SessionResult.best_lap < r.best_lap,
            models.SessionResult.best_lap > 0
        ).distinct(models.SessionResult.driver_name).count()
        
        rankings.append({
            "track": r.track_name,
            "position": faster_count + 1,
            "time": format_lap_time(r.best_lap)
        })
    
    return rankings[:limit]
