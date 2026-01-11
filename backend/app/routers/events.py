from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime

from .. import models, schemas, database

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
    new_event = models.Event(
        name=event.name,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        track_name=event.track_name,
        allowed_cars=event.allowed_cars,
        status=event.status,
        rules=event.rules,
        is_active=True
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

@router.get("/active", response_model=Optional[schemas.Event])
def get_active_event(db: Session = Depends(database.get_db)):
    # Find event where current time is between start and end
    now = datetime.now()
    event = db.query(models.Event).filter(
        models.Event.status == "active",
        models.Event.start_date <= now,
        models.Event.end_date >= now
    ).first()
    return event

@router.post("/{event_id}/generate_bracket")
def generate_bracket(event_id: int, size: int = 8, db: Session = Depends(database.get_db)):
    """
    Generate a single-elimination bracket for the top N players.
    Size must be a power of 2 (2, 4, 8, 16...).
    """
    # 1. Fetch Top Drivers
    results = db.query(
        models.LapTime.driver_name,
        func.min(models.LapTime.lap_time_ms).label('best_time')
    ).filter(models.LapTime.event_id == event_id).group_by(models.LapTime.driver_name).order_by('best_time').limit(size).all()
    
    if len(results) < 2:
        raise HTTPException(status_code=400, detail="Not enough players to generate a bracket")

    # Pad with "BYE" if not enough players for requested size
    drivers = [r[0] for r in results]
    while len(drivers) < size:
        drivers.append(None) # Bye

    # Clear existing matches
    db.query(models.TournamentMatch).filter(models.TournamentMatch.event_id == event_id).delete()
    
    matches = []
    
    # Logic to generate bracket levels
    # Example for size 4: 
    # Round 2 (Semis): 2 Matches
    # Round 1 (Final): 1 Match
    
    current_round_players = drivers
    round_num = size // 2 # Initial round number (e.g. 4 for quarter finals if size=8)
    
    # Store match objects to link them later
    round_matches = [] 

    # Create First Round Matches
    # Seeding: 1 vs 8, 2 vs 7, 3 vs 6, 4 vs 5 (Standard Snake)
    seeds = []
    l = len(drivers)
    for i in range(l // 2):
        seeds.append((drivers[i], drivers[l - 1 - i]))
        
    next_round_matches = []
    
    # Create DB objects for Round 1
    current_matches = []
    for i, (p1, p2) in enumerate(seeds):
        m = models.TournamentMatch(
            event_id=event_id,
            round_number=round_num,
            match_number=i + 1,
            player1=p1,
            player2=p2,
            winner=p1 if p2 is None else None # Auto-win if BYE
        )
        db.add(m)
        current_matches.append(m)
        
    db.flush() # Get IDs
    
    # Build subsequent rounds up to Final (Round 1)
    prev_round_matches = current_matches
    
    while round_num > 1:
        round_num //= 2
        new_matches = []
        for i in range(0, len(prev_round_matches), 2):
            m = models.TournamentMatch(
                event_id=event_id,
                round_number=round_num,
                match_number=(i // 2) + 1,
                player1=None,
                player2=None
            )
            db.add(m)
            db.flush()
            new_matches.append(m)
            
            # Link previous matches to this one
            prev_round_matches[i].next_match_id = m.id
            prev_round_matches[i+1].next_match_id = m.id
            
        prev_round_matches = new_matches

    db.commit()
    return {"message": "Bracket generated", "size": size}

@router.get("/{event_id}/bracket", response_model=List[schemas.Match])
def get_bracket(event_id: int, db: Session = Depends(database.get_db)):
    return db.query(models.TournamentMatch).filter(models.TournamentMatch.event_id == event_id).order_by(models.TournamentMatch.round_number.desc(), models.TournamentMatch.match_number).all()

@router.post("/match/{match_id}/winner")
def set_match_winner(match_id: int, winner_name: str, db: Session = Depends(database.get_db)):
    match = db.query(models.TournamentMatch).filter(models.TournamentMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    match.winner = winner_name
    
    # Propagate to next match
    if match.next_match_id:
        next_match = db.query(models.TournamentMatch).filter(models.TournamentMatch.id == match.next_match_id).first()
        if next_match:
            # Determine if this was the 'top' or 'bottom' feeder for the next match
            # Simple heuristic: Odd match numbers feed player1, Even feed player2? 
            # Better: check if match.id is the first or second of the pair that feeds next_match
            # We can imply based on match_number.
            # Match N and N+1 feed NextMatch M.
            # Actually easier: Check which slot is empty or if we want strict ordering.
            # Let's use the match_number parity from the previous round.
            
            # Previous round match numbers: 1, 2 -> Next 1. 3, 4 -> Next 2.
            # If match.match_number is Odd (1, 3, 5) -> It's Player 1 of next match
            # If match.match_number is Even (2, 4, 6) -> It's Player 2 of next match
            
            if match.match_number % 2 != 0:
                next_match.player1 = winner_name
            else:
                next_match.player2 = winner_name
                
    db.commit()
    return {"status": "updated", "winner": winner_name}

@router.get("/{event_id}", response_model=schemas.Event)
def get_event(event_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

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
            timestamp=res.created_at, # Using session time as lap time approx
            gap=gap,
            event_id=res.event_id
        ))
        
    return leaderboard
