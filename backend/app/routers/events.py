from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_, or_
from typing import List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

from .. import models, schemas, database
from . import tournament

router = APIRouter(
    prefix="/events",
    tags=["events"]
)

@router.get("/", response_model=List[schemas.Event])
def list_events(
    status: Optional[str] = None, 
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Event)
    if status:
        query = query.filter(models.Event.status == status)
    
    # Sort by start_date desc
    query = query.order_by(desc(models.Event.start_date))
        
    return query.offset(skip).limit(limit).all()

@router.post("/", response_model=schemas.Event)
def create_event(event: schemas.EventCreate, db: Session = Depends(database.get_db)):
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
def generate_bracket(event_id: int, size: int = 8, db: Session = Depends(database.get_db)):
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
    db: Session = Depends(database.get_db)
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
def add_event_to_championship(championship_id: int, event_id: int, db: Session = Depends(database.get_db)):
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
def process_event_results(event_id: int, db: Session = Depends(database.get_db)):
    """
    Finalize event results:
    1. Calculate and Update ELO for all participants.
    2. Update Pilot Stats (Wins, Podiums, Races).
    3. Mark event as completed.
    """
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    if event.status == "completed":
        raise HTTPException(status_code=400, detail="Event already processed")

    # Get Leaderboard (Sorted by position)
    # Re-using logic from get_event_leaderboard but we need the driver objects
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

    # Update Stats
    for idx, result in enumerate(results):
        driver = db.query(models.Driver).filter(models.Driver.name == result.driver_name).first()
        if not driver:
            driver = models.Driver(name=result.driver_name, elo_rating=1200.0)
            db.add(driver)
        
        driver.total_races += 1
        if idx == 0: driver.total_wins += 1
        if idx < 3: driver.total_podiums += 1
        
        # ELO Calculation
        # Simple implementation: compare vs average ELO of the field? 
        # Or better: Standard Multiplayer ELO.
        # Let's use a simplified approach: ELO change = (PerformanceRating - CurrentELO) * Multiplier?
        # No, let's use: Change = K * (ActualScore - ExpectedScore)
        # Actual Score for P1 = 1.0, P_Last = 0.0?
        # Let's do a Pairwise Sum approach for accuracy or just simple position weight.
        
        # Simplified:
        # P1 gains 20, P2 gains 10, P3 gains 5. 
        # Lower half loses points.
        # This is a placeholder. A real ELO system requires pairwise comparisons or a complex generalized formula.
        
        # Implementation of Linear Weights for now (e.g. F1 style points converted to ELO?)
        # Let's try to be a bit smarter: Compare against the Field Average ELO.
        
        # 1. Calculate Field Average
        # (Optimized: we could fetch all drivers first, but for loop ok for <20 drivers)
        # ... Skipping exact math for MVP, using Position Bonus/Penalty
        
        k_factor = 32
        n_players = len(results)
        expected_pos = n_players / 2 # Middle of pack
        
        # Inverted position (0 is best) -> Score from 1 to 0
        actual_score = (n_players - 1 - idx) / max(1, (n_players - 1)) # Normalized 1.0 to 0.0
        
        # Expected score based on rating diff vs field average (simplified)
        # Using 1200 as baseline if everyone equal
        # Rating Diff = DriverElo - FieldAvg
        # Expected = 1 / (1 + 10 ** (-Diff / 400))
        
        # Let's assume field average is 1200 for now or calculate strict?
        # Let's just reward Top 50% and punish Bottom 50%
        
        rating_change = 0
        if idx < n_players / 2:
            rating_change = k_factor * (1.0 - (idx / n_players)) # Gain
        else:
            rating_change = -k_factor * ((idx / n_players)) # Loss
            
        driver.elo_rating += rating_change
        
    event.status = "completed"
    db.commit()
    
    return {"message": "Results processed", "participants": len(results)}
