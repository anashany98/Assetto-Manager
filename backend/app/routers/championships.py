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
    return db.query(models.Championship).filter(models.Championship.is_active == True).all()

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

@router.get("/{championship_id}/standings")
def get_championship_standings(championship_id: int, db: Session = Depends(database.get_db)):
    """
    Calculate championship standings based on event results.
    F1 Point System: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1
    """
    POINTS_SYSTEM = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}
    
    # Get all events for this championship
    events = db.query(models.Event).filter(models.Event.championship_id == championship_id).all()
    
    driver_stats: Dict[str, Dict[str, Any]] = {}

    for event in events:
        # Get best laps for each driver in this event to determine rank
        results = db.query(
            models.LapTime.driver_name,
            func.min(models.LapTime.lap_time).label('best_time')
        ).join(models.SessionResult).filter(models.SessionResult.event_id == event.id).group_by(models.LapTime.driver_name).order_by('best_time').all()
        
        for rank, row in enumerate(results, 1):
             driver = row.driver_name
             points = POINTS_SYSTEM.get(rank, 0)
             
             if driver not in driver_stats:
                 driver_stats[driver] = {
                     "driver_name": driver,
                     "total_points": 0,
                     "events_participated": 0,
                     "wins": 0,
                     "podiums": 0
                 }
             
             driver_stats[driver]["total_points"] += points
             driver_stats[driver]["events_participated"] += 1
             if rank == 1: driver_stats[driver]["wins"] += 1
             if rank <= 3: driver_stats[driver]["podiums"] += 1

    # Convert to list and sort
    standings = list(driver_stats.values())
    standings.sort(key=lambda x: x["total_points"], reverse=True)
    
    return standings
