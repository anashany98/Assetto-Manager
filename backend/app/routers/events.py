from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_, or_
from typing import List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

from .. import models, schemas, database
from . import tournament
from .auth import get_current_active_user

router = APIRouter(
    prefix="/events",
    tags=["events"]
)

@router.get("/", response_model=List[schemas.Event])
def list_events(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    name: Optional[str] = None,
    championship_id: Optional[int] = None,
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Event)

    if status:
        query = query.filter(models.Event.status == status)

    if name:
        query = query.filter(models.Event.name.ilike(f"%{name}%"))

    if championship_id:
        query = query.filter(models.Event.championship_id == championship_id)

    # Sort by start_date desc
    query = query.order_by(desc(models.Event.start_date))

    events = query.offset(skip).limit(limit).all()
    return events

@router.post("/", response_model=schemas.Event)
def create_event(event: schemas.EventCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    try:
        new_event = models.Event(
            name=event.name,
            description=event.description,
            start_date=event.start_date,
            end_date=event.end_date,
            track_name=event.track_name,
            allowed_cars=event.allowed_cars,
            status=event.status,
            rules=event.rules,
            is_active=event.status == "active"
        )
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        logger.info(f"Successfully created event: ID={new_event.id}, Name='{new_event.name}'")
        return new_event
    except Exception as e:
        logger.error(f"Error creating event: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{event_id}", response_model=schemas.Event)
def update_event(event_id: int, event_update: schemas.EventCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event.name = event_update.name
    event.description = event_update.description
    event.start_date = event_update.start_date
    event.end_date = event_update.end_date
    event.track_name = event_update.track_name
    event.allowed_cars = event_update.allowed_cars
    event.status = event_update.status
    event.rules = event_update.rules
    event.is_active = event_update.status == "active"
    
    db.commit()
    db.refresh(event)
    logger.info(f"Updated event {event_id}: {event.name}")
    return event

@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    db.delete(event)
    db.commit()
    logger.info(f"Deleted event {event_id}")
    return {"message": "Event deleted successfully"}

@router.post("/{event_id}/results/manual", response_model=schemas.Event)
def submit_manual_results(event_id: int, results: schemas.EventResultManual, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Update event status
    event.status = "completed"
    event.is_active = False
    
    # In a full match, we would create Leaderboard entries here.
    # For now, we just mark it as completed, log the winner, and create synthetic results.
    logger.info(f"Event {event_id} completed manually. Winner: {results.winner_name}")

    # Create synthetic results for the podium to ensure Championship points are awarded
    current_time = datetime.now()
    
    # 1. Winner (Best Time = 1ms)
    db.add(models.SessionResult(
        event_id=event.id,
        driver_name=results.winner_name,
        best_lap=1,
        car_model="Manual Entry",
        track_name=event.track_name or "Unknown",
        session_type="RACE_MANUAL",
        date=current_time
    ))

    # 2. Second Place (Best Time = 2ms)
    if results.second_name:
        db.add(models.SessionResult(
            event_id=event.id,
            driver_name=results.second_name,
            best_lap=2,
            car_model="Manual Entry",
            track_name=event.track_name or "Unknown",
            session_type="RACE_MANUAL",
            date=current_time
        ))

    # 3. Third Place (Best Time = 3ms)
    if results.third_name:
        db.add(models.SessionResult(
            event_id=event.id,
            driver_name=results.third_name,
            best_lap=3,
            car_model="Manual Entry",
            track_name=event.track_name or "Unknown",
            session_type="RACE_MANUAL",
            date=current_time
        ))
    
    db.commit()
    db.refresh(event)
    return event

@router.get("/active", response_model=Optional[schemas.Event])
def get_active_event(db: Session = Depends(database.get_db)):
    # Find event where current time is between start and end
    now = datetime.now()
    active_filter = or_(
        models.Event.is_active == True,
        and_(
            models.Event.status == "active",
            or_(models.Event.start_date == None, models.Event.start_date <= now),
            or_(models.Event.end_date == None, models.Event.end_date >= now),
        ),
    )
    return (
        db.query(models.Event)
        .filter(active_filter)
        .order_by(models.Event.start_date.desc())
        .first()
    )

@router.post("/{event_id}/generate_bracket")
def generate_bracket(event_id: int, size: int = 8, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    """
    Generate a single-elimination bracket for the top N players.
    Size must be a power of 2 (2, 4, 8, 16...).
    """
    if size < 2 or (size & (size - 1)) != 0:
        raise HTTPException(status_code=400, detail="Size must be a power of 2")

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    results = db.query(
        models.SessionResult.driver_name,
        func.min(models.SessionResult.best_lap).label('best_time')
    ).filter(
        models.SessionResult.event_id == event_id,
        models.SessionResult.best_lap > 0
    ).group_by(models.SessionResult.driver_name).order_by('best_time').limit(size).all()
    
    if len(results) < 2:
        raise HTTPException(status_code=400, detail="Not enough players to generate a bracket")

    drivers = [r[0] for r in results]
    while len(drivers) < size:
        drivers.append("BYE")

    # Seed: 1 vs N, 2 vs N-1, ...
    seeded = []
    l = len(drivers)
    for i in range(l // 2):
        seeded.extend([drivers[i], drivers[l - 1 - i]])

    bracket = tournament.build_bracket(seeded)
    tournament.save_bracket(event, bracket, db)
    return bracket

@router.get("/{event_id}/bracket")
def get_bracket(event_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    bracket = tournament.load_bracket(event)
    if not bracket:
        return {"status": "empty", "message": "El cuadro no ha sido generado aún"}

    return bracket

@router.post("/match/{match_id}/winner")
def set_match_winner(
    match_id: int,
    winner_name: str,
    score1: int = 0,
    score2: int = 0,
    event_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    events = []
    if event_id is not None:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if event:
            events = [event]
    else:
        events = db.query(models.Event).filter(models.Event.bracket_data != None).all()

    for event in events:
        bracket = tournament.load_bracket(event)
        if not bracket:
            continue
        try:
            updated = tournament.update_bracket_match(bracket, match_id, score1, score2, winner_name)
        except HTTPException:
            continue
        tournament.save_bracket(event, updated, db)
        return {"status": "updated", "winner": winner_name}

    raise HTTPException(status_code=404, detail="Match not found")

@router.get("/{event_id}", response_model=schemas.Event)
def get_event(event_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

@router.post("/{championship_id}/events/{event_id}")
def add_event_to_championship(championship_id: int, event_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    try:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            logger.warning(f"Add event failed: Event {event_id} not found")
            raise HTTPException(status_code=404, detail="Event not found")
        
        event.championship_id = championship_id
        db.commit()
        logger.info(f"Linked event {event_id} to championship {championship_id}")
        return {"message": "Event added to championship"}
    except Exception as e:
        logger.error(f"Error linking event to championship: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{event_id}/leaderboard", response_model=List[schemas.LeaderboardEntry])
def get_event_leaderboard(
    event_id: int,
    limit: int = 50,
    db: Session = Depends(database.get_db)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Get best lap for each driver within this event
    # We filter by event_id on SessionResult
    
    subquery = db.query(
        models.SessionResult.driver_name,
        func.min(models.SessionResult.best_lap).label('min_lap')
    ).filter(
        models.SessionResult.event_id == event_id,
        models.SessionResult.best_lap > 0
    ).group_by(models.SessionResult.driver_name).subquery()
    
    results = db.query(models.SessionResult).join(
        subquery,
        (models.SessionResult.driver_name == subquery.c.driver_name) &
        (models.SessionResult.best_lap == subquery.c.min_lap)
    ).filter(
        models.SessionResult.event_id == event_id
    ).order_by(models.SessionResult.best_lap.asc()).limit(limit).all()
    
    leaderboard = []
    if not results:
        return []
        
    best_time = results[0].best_lap
    
    for i, res in enumerate(results):
        gap = res.best_lap - best_time if i > 0 else 0
        leaderboard.append(schemas.LeaderboardEntry(
            rank=i + 1,
            lap_id=res.id,
            driver_name=res.driver_name,
            car_model=res.car_model,
            track_name=res.track_name,
            lap_time=res.best_lap,
            timestamp=res.date, # Using session time as lap time approx
            gap=gap,
            event_id=res.event_id
        ))
        
    return leaderboard


@router.post("/{event_id}/process_results")
def process_event_results(event_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_active_user)):
    """
    Finalize event results:
    1. Calculate and Update ELO for all participants.
    2. Update Pilot Stats (Wins, Podiums, Races).
    3. Mark event as completed.
    """
    from ..services.elo import calculate_race_elo_changes, DEFAULT_RATING

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    if event.status == "completed":
        raise HTTPException(status_code=400, detail="Event already processed")

    # Get Leaderboard (Sorted by position i.e. Best Lap Ascending)
    subquery = db.query(
        models.SessionResult.driver_name,
        func.min(models.SessionResult.best_lap).label('min_lap')
    ).filter(
        models.SessionResult.event_id == event_id,
        models.SessionResult.best_lap > 0
    ).group_by(models.SessionResult.driver_name).subquery()
    
    results = db.query(models.SessionResult).join(
        subquery,
        (models.SessionResult.driver_name == subquery.c.driver_name) &
        (models.SessionResult.best_lap == subquery.c.min_lap)
    ).filter(
        models.SessionResult.event_id == event_id
    ).order_by(models.SessionResult.best_lap.asc()).all()
    
    if not results:
        return {"message": "No results to process"}

    # 1. Prepare Data & Update Stats
    elo_input = []
    drivers_by_id = {}

    for idx, result in enumerate(results):
        driver = db.query(models.Driver).filter(models.Driver.name == result.driver_name).first()
        if not driver:
            driver = models.Driver(name=result.driver_name, elo_rating=DEFAULT_RATING)
            db.add(driver)
            db.commit()
            db.refresh(driver)
        
        drivers_by_id[driver.id] = driver
        
        # Stats Update
        driver.total_races += 1
        if idx == 0: driver.total_wins += 1
        if idx < 3: driver.total_podiums += 1 # 1st, 2nd, 3rd
        
        elo_input.append({
            'driver_id': driver.id,
            'rating': float(driver.elo_rating) if driver.elo_rating else DEFAULT_RATING,
            'position': idx + 1
        })

    # 2. Calculate ELO Changes
    changes = calculate_race_elo_changes(elo_input)
    
    # 3. Apply ELO Changes
    for driver_id, change in changes.items():
        if driver_id in drivers_by_id:
            driver = drivers_by_id[driver_id]
            current = float(driver.elo_rating) if driver.elo_rating else DEFAULT_RATING
            driver.elo_rating = current + change
            
            # Log for debugging
            logger.info(f"Driver {driver.name}: {current} -> {driver.elo_rating} (Change: {change})")
        
    event.status = "completed"
    db.commit()
    
    return {
        "message": "Results processed", 
        "participants": len(results),
        "elo_changes": changes
    }

