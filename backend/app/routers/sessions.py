from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from ..database import get_db
from ..models import Session, Station
from .. import schemas

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"]
)

@router.post("/start", response_model=schemas.SessionResponse)
def start_session(
    session_data: schemas.SessionStart, 
    db: DBSession = Depends(get_db)
):
    # Check if station exists
    station = db.query(Station).filter(Station.id == session_data.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # Check if station already has an active session
    active_session = db.query(Session).filter(
        Session.station_id == session_data.station_id,
        Session.status.in_(["active", "paused"])
    ).first()
    
    if active_session:
        raise HTTPException(status_code=400, detail="Station already has an active session")
    
    now = datetime.now(timezone.utc)
    end_time = now + timedelta(minutes=session_data.duration_minutes)
    
    new_session = Session(
        station_id=session_data.station_id,
        driver_name=session_data.driver_name,
        duration_minutes=session_data.duration_minutes,
        start_time=now,
        end_time=end_time,
        status="active",
        price=session_data.price,
        payment_method=session_data.payment_method,
        is_vr=session_data.is_vr,
        is_paid=True, # Assuming started via this endpoint implies payment or intent
        notes=session_data.notes
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    return _map_session_response(new_session, station.name)

@router.get("/active", response_model=List[schemas.SessionResponse])
def get_active_sessions(db: DBSession = Depends(get_db)):
    active_sessions = db.query(Session).join(Station).filter(
        Session.status.in_(["active", "paused"])
    ).all()
    
    # Auto-expire sessions
    now = datetime.now(timezone.utc)
    valid_sessions = []
    
    for session in active_sessions:
        if session.status == "active" and session.end_time and session.end_time < now:
            session.status = "expired"
            db.add(session)
            # Potentially trigger websocket alert here?
        else:
            valid_sessions.append(session)
            
    if len(valid_sessions) != len(active_sessions):
        db.commit()
        
    return [_map_session_response(s, s.station.name) for s in valid_sessions]

@router.post("/{session_id}/stop")
def stop_session(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session.status = "completed"
    session.end_time = datetime.now(timezone.utc) # Set actual end time
    db.commit()
    
    return {"status": "ok", "message": "Session stopped"}

@router.post("/{session_id}/add-time")
def add_time(session_id: int, minutes: int = Body(..., embed=True), db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.status not in ["active", "paused"]:
        raise HTTPException(status_code=400, detail="Session is not active")
        
    session.duration_minutes += minutes
    if session.end_time:
        session.end_time += timedelta(minutes=minutes)
        
    db.commit()
    db.refresh(session)
    
    return _map_session_response(session, session.station.name)

def _map_session_response(session: Session, station_name: str) -> schemas.SessionResponse:
    now = datetime.now(timezone.utc)
    remaining = 0.0
    
    if session.status == "active" and session.end_time:
        delta = session.end_time - now
        remaining = max(0.0, delta.total_seconds() / 60)
    elif session.status == "paused":
        # Simplified: If paused, calculate remaining from duration and elapsed (logic can be more complex)
        # For now, just show original duration or estimated
        if session.end_time:
             delta = session.end_time - now
             remaining = max(0.0, delta.total_seconds() / 60)
             
    # Create response object manually to match schema structure
    return schemas.SessionResponse(
        id=session.id,
        station_id=session.station_id,
        station_name=station_name, # Not in DB, passed from join
        driver_name=session.driver_name,
        start_time=session.start_time,
        end_time=session.end_time,
        duration_minutes=session.duration_minutes,
        remaining_minutes=round(remaining, 1),
        status=session.status,
        price=session.price,
        is_paid=session.is_paid,
        notes=session.notes,
        payment_method=session.payment_method
    )
