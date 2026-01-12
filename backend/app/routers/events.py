from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

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
            is_active=True
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
        models.SessionResult.driver_name,
        func.min(models.SessionResult.best_lap).label('best_time')
    ).filter(models.SessionResult.event_id == event_id).group_by(models.SessionResult.driver_name).order_by('best_time').limit(size).all()
    
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

@router.get("/{event_id}/bracket")
def get_bracket(event_id: int, db: Session = Depends(database.get_db)):
    matches = db.query(models.TournamentMatch).filter(models.TournamentMatch.event_id == event_id).order_by(models.TournamentMatch.round_number.desc(), models.TournamentMatch.match_number).all()
    
    if not matches:
        return {"rounds": []}

    # Group by round
    # round_number is usually High for early rounds (e.g. 4 -> 2 -> 1) OR logic depends on implementation
    # In generate_bracket: round_num = size // 2. (e.g. 4 for RO8). Then decreases? 
    # Check generate logic: round_num starts at size // 2. While round_num > 1: round_num //= 2.
    # So Rounds are: 4, 2, 1? 
    # Frontend likely expects Round 0 (First), Round 1 (Semis)...
    # TournamentTV.tsx: `getRoundName(index, total)` uses index 0..N.
    # So I should return rounds sorted by logical progression (Start -> Final).
    # If standard logic: Round 1 (Quarter), Round 2 (Semi), Round 3 (Final).
    # My generate_bracket logic (lines 96-148) seemed to use "Matches per Round" or similar?
    # Let's check: 
    # round_num = size // 2. (e.g. 4).
    # Loop `while round_num > 1`: round_num //= 2.
    # So if size=8. First round uses `round_num`? It uses loop variable?
    # Actually lines 115: `round_number=round_num`. (Initial value).
    # If size=8, round_num=4.
    # Then loop: round_num becomes 2, then 1.
    # So DB has: 4, 2, 1. (Number of matches/players? No, it's confusing naming).
    # Actually, usually Round Number = 1, 2, 3.
    # Let's check `generate_bracket` loop again.
    
    # Logic in generate_bracket (lines 96+):
    # `round_num = size // 2`. (e.g. 4).
    # Matches created with `round_number=round_num`.
    # Then `while round_num > 1`: ... `round_number=round_num`.
    # So for 8 players:
    # First Round (Quarters) -> round_number=4
    # Second Round (Semis) -> round_number=2
    # Final -> round_number=1
    
    # Frontend Iterates `rounds.map`. Round 0 should be Quarters. Round Last should be Final.
    # So I should sort rounds by round_number DESCENDING (4, 2, 1).
    
    rounds_map = {}
    for m in matches:
        if m.round_number not in rounds_map:
            rounds_map[m.round_number] = []
        
        rounds_map[m.round_number].append({
            "id": m.id,
            "round": m.round_number,
            "match": m.match_number,
            "player1": m.player1,
            "player2": m.player2,
            "winner": m.winner,
            "score1": 0, # Placeholder
            "score2": 0
        })
        
    # Sort keys: 4, 2, 1 (Descending) -> List of lists
    sorted_keys = sorted(rounds_map.keys(), reverse=True)
    rounds_list = [sorted(rounds_map[k], key=lambda x: x["match"]) for k in sorted_keys]
    
    return {"rounds": rounds_list}

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
