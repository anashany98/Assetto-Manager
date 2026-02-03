from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timezone, timedelta
import logging

from ... import models, schemas, database
from ..auth import require_agent_token
from .. import tournament
from .base import _coerce_json_value, logger

router = APIRouter(tags=["telemetry-live"])

def process_tournament_logic(session_id: int, event_id: int, driver_name: str, session_type: str, session_date: datetime):
    """
    Background task to process tournament advancement.
    Isolated from the main request loop to prevent race conditions and reduce latency.
    """
    if session_type != 'race' or not event_id:
        return

    # Create a new DB session for the background task
    db = database.SessionLocal()
    try:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if event and event.bracket_data:
            bracket = tournament.load_bracket(event)
            if bracket:
                match = tournament.find_active_match(bracket, driver_name)
                if match:
                    # Simple locking mechanism could be added here (e.g. redis lock), 
                    # but for now, moving out of the request loop mitigates the DoS risk.
                    # Logic remains susceptible to strict parallel race conditions without row locking, 
                    # but assumes low frequency of simultaneous finishes.
                    
                    opponent_name = match["player2"] if match["player1"] == driver_name else match["player1"]
                    
                    if opponent_name and opponent_name != "BYE":
                        # Look for opponent's recent session
                        since = datetime.now(timezone.utc) - timedelta(hours=1)
                        
                        opp_session = db.query(models.SessionResult).filter(
                            models.SessionResult.event_id == event.id,
                            models.SessionResult.driver_name == opponent_name,
                            models.SessionResult.session_type == 'race',
                            models.SessionResult.date >= since
                        ).order_by(desc(models.SessionResult.date)).first()
                        
                        if opp_session:
                            # Verify if both have completed the race criteria
                            # This re-queries the just-committed session to be sure
                            my_laps_count = db.query(models.LapTime).filter(models.LapTime.session_id == session_id).count()
                            opp_laps_count = db.query(models.LapTime).filter(models.LapTime.session_id == opp_session.id).count()
                            
                            winner = None
                            # Simple logic: Most laps, then fastest time
                            if my_laps_count != opp_laps_count:
                                winner = driver_name if my_laps_count > opp_laps_count else opponent_name
                            else:
                                my_total_time = db.query(func.sum(models.LapTime.time)).filter(models.LapTime.session_id == session_id).scalar() or 0
                                opp_total_time = db.query(func.sum(models.LapTime.time)).filter(models.LapTime.session_id == opp_session.id).scalar() or 0
                                
                                if my_total_time and opp_total_time:
                                    winner = driver_name if my_total_time < opp_total_time else opponent_name
                                    
                            if winner:
                                logger.info(f"Tournament Match Auto-Decided: {winner} wins against {opponent_name if winner == driver_name else driver_name}")
                                tournament.advance_bracket_for_winner(event, winner, db)
    except Exception as e:
        logger.error(f"Background Tournament Error: {e}")
    finally:
        db.close()


@router.post("/session", status_code=201, dependencies=[Depends(require_agent_token)])
def upload_session_result(
    session_data: schemas.SessionResultCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    try:
        # 1. Create Session Record
        new_session = models.SessionResult(
            station_id=session_data.station_id,
            track_name=session_data.track_name,
            track_config=session_data.track_config,
            car_model=session_data.car_model,
            driver_name=session_data.driver_name,
            session_type=session_data.session_type,
            date=session_data.date,
            best_lap=session_data.best_lap,
            event_id=session_data.event_id
        )
        
        # Live Linking: If no event_id provided, check if matches an active event
        if not new_session.event_id:
            active_event = db.query(models.Event).join(models.Championship).filter(
                models.Championship.is_active == True,
                func.lower(models.Event.track_name) == session_data.track_name.lower(),
                models.Event.start_date <= new_session.date,
                models.Event.end_date >= new_session.date
            ).first()
            
            if active_event:
                new_session.event_id = active_event.id
                logger.info(f"Auto-linked session {new_session.date} to event {active_event.id} ({active_event.name})")

        db.add(new_session)
        db.flush()
        
        # 2. Process Laps
        for idx, lap in enumerate(session_data.laps, start=1):
            if not lap.is_valid:
                continue
    
            telemetry_payload = _coerce_json_value(lap.telemetry_data)
                
            new_lap = models.LapTime(
                session_id=new_session.id,
                lap_number=idx,
                time=lap.time,
                splits=lap.sectors,
                telemetry_data=telemetry_payload,
                valid=lap.is_valid
            )
            db.add(new_lap)
        
        db.commit()

        # 3. Offload Tournament Logic
        if new_session.event_id:
            background_tasks.add_task(
                process_tournament_logic,
                session_id=new_session.id,
                event_id=new_session.event_id,
                driver_name=new_session.driver_name,
                session_type=new_session.session_type,
                session_date=new_session.date
            )

        return {"status": "ok", "session_id": new_session.id}

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to upload session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
