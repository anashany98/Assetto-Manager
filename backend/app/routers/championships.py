from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any
from .. import models, schemas, database

router = APIRouter(
    prefix="/championships",
    tags=["championships"]
)

@router.get("/", response_model=List[schemas.Championship])
def get_championships(db: Session = Depends(database.get_db)):
    return db.query(models.Championship).all()

@router.post("/", response_model=schemas.Championship)
def create_championship(championship: schemas.ChampionshipCreate, db: Session = Depends(database.get_db)):
    db_champ = models.Championship(**championship.dict())
    db.add(db_champ)
    db.commit()
    db.refresh(db_champ)
    return db_champ

@router.get("/{championship_id}", response_model=schemas.Championship)
def get_championship(championship_id: int, db: Session = Depends(database.get_db)):
    return db.query(models.Championship).filter(models.Championship.id == championship_id).first()

@router.post("/{championship_id}/events/{event_id}")
def add_event_to_championship(championship_id: int, event_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event.championship_id = championship_id
    db.commit()
    return {"message": "Event added to championship"}

@router.post("/{championship_id}/events/{event_id}/link-session/{session_id}")
def link_session_to_event(championship_id: int, event_id: int, session_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id, models.Event.championship_id == championship_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found in championship")
    
    session_result = db.query(models.SessionResult).filter(models.SessionResult.id == session_id).first()
    if not session_result:
        raise HTTPException(status_code=404, detail="Session result not found")
    
    session_result.event_id = event_id
    db.commit()
    session_result.event_id = event_id
    db.commit()
    return {"message": "Session linked to event", "session_id": session_id, "event_id": event_id}

@router.post("/{championship_id}/events/{event_id}/auto-detect")
def auto_detect_matches(championship_id: int, event_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id, models.Event.championship_id == championship_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event.start_date or not event.end_date or not event.track_name:
         raise HTTPException(status_code=400, detail="Event must have start_date, end_date and track_name defined")

    # Find matching sessions that are NOT yet linked to this event
    # We use ILIKE for track name to be safe/flexible
    query = db.query(models.SessionResult).filter(
        func.lower(models.SessionResult.track_name) == event.track_name.lower(),
        models.SessionResult.date >= event.start_date,
        models.SessionResult.date <= event.end_date,
        (models.SessionResult.event_id == None) | (models.SessionResult.event_id != event_id) # Optional: Re-link or only link orphans? Let's link orphans or steal from others? Let's just link anything in window.
    )
    
    matches = query.all()
    count = 0
    for session in matches:
        session.event_id = event_id
        count += 1
        
    db.commit()
    return {"message": f"Auto-detected and linked {count} sessions", "count": count}

@router.get("/{championship_id}/standings")
def get_championship_standings(championship_id: int, db: Session = Depends(database.get_db)):
    """
    Calculate championship standings based on linked event results.
    Uses scoring_rules if defined, otherwise F1 standard.
    """
    champ = db.query(models.Championship).filter(models.Championship.id == championship_id).first()
    if not champ:
        raise HTTPException(status_code=404, detail="Championship not found")
    
    # Default F1 scoring: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1
    POINTS_SYSTEM = champ.scoring_rules or {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}
    # Ensure keys are integers if they come from JSON as strings
    POINTS_SYSTEM = {int(k): v for k, v in POINTS_SYSTEM.items()}
    
    driver_stats: Dict[str, Dict[str, Any]] = {}

    # Get all events for this championship
    events = db.query(models.Event).filter(models.Event.championship_id == championship_id).all()
    
    for event in events:
        # Each event can have multiple session results linked (from different days/stations)
        # We take the best lap for each driver across ALL results for THIS event
        results = db.query(
            models.SessionResult.driver_name,
            func.min(models.SessionResult.best_lap).label('best_lap')
        ).filter(models.SessionResult.event_id == event.id).group_by(models.SessionResult.driver_name).order_by('best_lap').all()
        
        for rank, row in enumerate(results, 1):
             driver = row.driver_name
             points = POINTS_SYSTEM.get(rank, 0)
             
             if driver not in driver_stats:
                 driver_stats[driver] = {
                     "driver_name": driver,
                     "total_points": 0,
                     "events_participated": 0,
                     "wins": 0,
                     "podiums": 0,
                     "best_lap_ever": row.best_lap
                 }
             
             driver_stats[driver]["total_points"] += points
             driver_stats[driver]["events_participated"] += 1
             driver_stats[driver]["best_lap_ever"] = min(driver_stats[driver]["best_lap_ever"], row.best_lap)
             if rank == 1: driver_stats[driver]["wins"] += 1
             if rank <= 3: driver_stats[driver]["podiums"] += 1

    # Convert to list and sort
    standings = list(driver_stats.values())
    standings.sort(key=lambda x: x["total_points"], reverse=True)
    
    return standings
