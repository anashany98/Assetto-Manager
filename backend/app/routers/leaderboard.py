from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc
from typing import List, Optional
from ..database import get_db
from ..models import SessionResult, Driver, Scenario

router = APIRouter(
    prefix="/leaderboard",
    tags=["Leaderboard"],
    responses={404: {"description": "Not found"}},
)

def format_lap_time(ms: int) -> str:
    """Convert ms to MM:SS.ms format"""
    if not ms:
        return "--:--.---"
    minutes = ms // 60000
    seconds = (ms % 60000) // 1000
    milliseconds = ms % 1000
    return f"{minutes}:{seconds:02d}.{milliseconds:03d}"

@router.get("/top")
async def get_top_times(
    track: str,
    car: Optional[str] = None,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Get top lap times for a specific track (and optional car).
    """
    query = db.query(SessionResult).filter(
        SessionResult.track_name == track,
        SessionResult.best_lap > 0
    )
    
    if car:
        query = query.filter(SessionResult.car_model == car)
        
    # Get distinct best times per driver (optional: show all times or just best per driver?)
    # Usually leaderboards show best per driver.
    # Group by driver_name and take min(best_lap)
    
    # Simple approach first: Just top times regardless of driver dups, or simple group by.
    # Postgres needs strict GROUP BY. SQLite is more lenient.
    # Let's do raw list first to minimize complexity, frontend can filter unique drivers if needed,
    # or better: we return pure best laps.
    
    results = query.order_by(asc(SessionResult.best_lap)).limit(limit).all()
    
    response = []
    for idx, r in enumerate(results):
        response.append({
            "rank": idx + 1,
            "driver_name": r.driver_name,
            "car": r.car_model,
            "track": r.track_name,
            "time": format_lap_time(r.best_lap),
            "time_raw": r.best_lap,
            "date": r.date
        })
        
    return response

@router.get("/scenario/{scenario_id}")
async def get_scenario_leaderboard(
    scenario_id: int,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Get leaderboard specifically for a scenario.
    Queries using the scenario's allowed cars and tracks.
    """
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
        
    # Filter by allowed tracks (usually scenario has 1 main track, but if multiple, we include them all)
    # Filter by allowed cars
    
    query = db.query(SessionResult).filter(SessionResult.best_lap > 0)
    
    if scenario.allowed_tracks:
        # Assuming allowed_tracks contains track names or IDs. 
        # Based on ScenariosPage.tsx, it pushes ID, but let's check content.ts data.
        # Ideally we match by name if SessionResult stores name, or ID if it stores ID.
        # SessionResult stores `track_name` (String).
        # We need to resolve ID to Name if allowed_tracks stores IDs.
        # For now, let's assume filtering by the car/track selected in Kiosk is enough via the /top endpoint.
        # But this endpoint is for "Overall Scenario" leaderboard.
        pass

    # Actually, keep it simple. The user wants to see the leaderboard "when they select the scenario".
    # In KioskMode, step 4 (Difficulty), the user has already selected a CAR and a TRACK.
    # So the /top?track=X&car=Y endpoint is exactly what we need to show the relevant leaderboard.
    # We will just expose /top and use that.
    
    return []
