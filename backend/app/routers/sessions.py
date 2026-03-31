import logging
import asyncio
import os
import json
from fastapi import APIRouter, Depends, HTTPException, Body, Header
from sqlalchemy.orm import Session as DBSession
from typing import List, Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

from ..database import get_db, SessionLocal
from ..models import Session, Station
from .. import schemas, models
from ..services.pricing import calculate_price
from ..routers.auth import require_admin, require_admin_or_public_token_or_kiosk, require_agent_token
from ..dependencies import require_client_scope as _require_client_scope, require_kiosk_access as _require_kiosk_access

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"],
)


@router.post("/start", response_model=schemas.SessionResponse)
def start_session(
    session_data: schemas.SessionStart,
    db: DBSession = Depends(get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token_or_kiosk),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    # Check if station exists
    station = db.query(Station).filter(Station.id == session_data.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    # Public clients can only create sessions for their paired kiosk station.
    _require_kiosk_access(station, kiosk_code, user_or_client)
    _require_client_scope(user_or_client, "kiosk:control")

    # Check if station already has an active session
    active_session = db.query(Session).filter(
        Session.station_id == session_data.station_id,
        Session.status.in_(["active", "paused"])
    ).first()

    if active_session:
        # Auto-close existing session to prevent "stuck" stations
        logger.warning(
            "Auto-closing stuck session id=%s for station_id=%s before starting new session",
            active_session.id,
            session_data.station_id,
        )
        active_session.status = "completed"
        active_session.end_time = datetime.now(timezone.utc)
        db.add(active_session)
        db.commit()

    now = datetime.now(timezone.utc)
    end_time = now + timedelta(minutes=session_data.duration_minutes)

    price = session_data.price
    if price is None or price <= 0:
        price = calculate_price(db, session_data.duration_minutes, session_data.is_vr)

    new_session = Session(
        station_id=session_data.station_id,
        driver_name=session_data.driver_name,
        duration_minutes=session_data.duration_minutes,
        start_time=now,
        end_time=end_time,
        status="active",
        price=price,
        payment_method=session_data.payment_method,
        is_vr=session_data.is_vr,
        is_paid=True,  # Assuming started via this endpoint implies payment or intent
        notes=session_data.notes
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return _map_session_response(new_session, station.name)


@router.get("/active", response_model=List[schemas.SessionResponse], dependencies=[Depends(require_admin)])
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

    return [_map_session_response(s, s.station.name if s.station else "Unknown") for s in valid_sessions]


@router.post("/{session_id}/stop", dependencies=[Depends(require_admin)])
def stop_session(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "completed"
    session.end_time = datetime.now(timezone.utc)  # Set actual end time
    db.commit()

    return {"status": "ok", "message": "Session stopped"}


@router.post("/{session_id}/add-time", dependencies=[Depends(require_admin)])
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
    def _to_utc(dt: Optional[datetime]) -> Optional[datetime]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    now = datetime.now(timezone.utc)
    remaining = 0.0
    start_time = _to_utc(session.start_time)
    end_time = _to_utc(session.end_time)

    if session.status == "active" and end_time:
        delta = end_time - now
        remaining = max(0.0, delta.total_seconds() / 60)
    elif session.status == "paused":
        # Simplified: If paused, calculate remaining from duration and elapsed (logic can be more complex)
        # For now, just show original duration or estimated
        if end_time:
            delta = end_time - now
            remaining = max(0.0, delta.total_seconds() / 60)

    # Create response object manually to match schema structure
    return schemas.SessionResponse(
        id=session.id,
        station_id=session.station_id,
        station_name=station_name,  # Not in DB, passed from join
        driver_name=session.driver_name,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=session.duration_minutes,
        remaining_minutes=round(remaining, 1),
        status=session.status,
        price=session.price,
        is_paid=session.is_paid,
        notes=session.notes,
        payment_method=session.payment_method
    )


async def start_session_background_tasks():
    """Start background tasks for session management."""
    enable_warnings = os.getenv("SESSION_TIME_WARNINGS_ENABLED", "true").lower() in {"1", "true", "yes"}
    enable_orphan_detection = os.getenv("ORPHAN_SESSION_DETECTION_ENABLED", "true").lower() in {"1", "true", "yes"}
    
    tasks = []
    
    if enable_warnings:
        tasks.append(asyncio.create_task(check_session_time_warnings()))
        logger.info("Session time warnings task started")
    
    if enable_orphan_detection:
        tasks.append(asyncio.create_task(detect_orphan_sessions()))
        logger.info("Orphan session detection task started")
    
    return tasks


# Background task: Check session time and send warnings
async def check_session_time_warnings():
    """Send warnings to clients when session time is running low."""
    warning_minutes = [5, 1]
    check_interval = int(os.getenv("SESSION_WARNING_CHECK_INTERVAL", "30"))  # seconds
    
    while True:
        try:
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                active_sessions = db.query(Session).filter(Session.status == "active").all()
                
                for session in active_sessions:
                    if not session.end_time:
                        continue
                    
                    remaining_minutes = (session.end_time - now).total_seconds() / 60
                    
                    for warn_min in warning_minutes:
                        if 0 < remaining_minutes <= warn_min:
                            # Check if we already sent this warning
                            warning_key = f"session_{session.id}_warning_{warn_min}"
                            from ..utils.cache import content_cache
                            already_sent = await content_cache.get(warning_key)
                            
                            if not already_sent:
                                # Send warning via WebSocket
                                from .websockets import manager
                                await manager.broadcast(json.dumps({
                                    "type": "session_warning",
                                    "session_id": session.id,
                                    "station_id": session.station_id,
                                    "remaining_minutes": int(remaining_minutes),
                                    "message": f"¡Quedan {int(remaining_minutes)} minuto(s) de sesión!"
                                }))
                                
                                # Mark as sent
                                await content_cache.set(warning_key, "sent", ttl=300)
                                
                                logger.info(f"Session {session.id} warning sent: {warn_min} minutes remaining")
                                
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in session time warnings: {e}")
        
        await asyncio.sleep(check_interval)


# Background task: Detect and close orphan sessions
async def detect_orphan_sessions():
    """Close sessions where the agent is disconnected for too long."""
    orphan_minutes = int(os.getenv("ORPHAN_SESSION_MINUTES", "5"))
    check_interval = int(os.getenv("ORPHAN_SESSION_CHECK_INTERVAL", "60"))  # seconds
    
    while True:
        try:
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                active_sessions = db.query(Session).filter(Session.status == "active").all()
                
                for session in active_sessions:
                    # Check if station is offline
                    station = db.query(Station).filter(Station.id == session.station_id).first()
                    if not station or not station.is_online:
                        # Calculate how long the station has been offline
                        last_seen = station.last_seen if station else None
                        if last_seen:
                            offline_duration = (now - last_seen).total_seconds() / 60
                            
                            if offline_duration >= orphan_minutes:
                                # Close the orphan session
                                session.status = "expired"
                                session.end_time = now
                                db.commit()
                                
                                logger.warning(
                                    f"Closed orphan session {session.id} for station {session.station_id}. "
                                    f"Agent offline for {offline_duration:.1f} minutes"
                                )
                                
                                # Notify clients
                                from .websockets import manager
                                await manager.broadcast(json.dumps({
                                    "type": "session_expired",
                                    "session_id": session.id,
                                    "station_id": session.station_id,
                                    "reason": "orphan",
                                    "message": "Sesión cerrada: simulador desconectado"
                                }))
                                
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in orphan session detection: {e}")
        
        await asyncio.sleep(check_interval)


@router.post("/sync")
def sync_offline_sessions(
    sessions: List[dict] = Body(...),
    db: DBSession = Depends(get_db),
    _auth=Depends(require_agent_token),
):
    """Receive offline sessions synced from an agent."""
    created_ids = []
    for session_data in sessions:
        try:
            station_id = session_data.get("station_id")
            if not station_id:
                continue

            start_time = session_data.get("start_time")
            if isinstance(start_time, str):
                try:
                    start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                except Exception:
                    start_time = datetime.now(timezone.utc)
            else:
                start_time = datetime.now(timezone.utc)

            duration = session_data.get("duration_minutes", 15)
            end_time = start_time + timedelta(minutes=duration)

            db_session = Session(
                station_id=station_id,
                driver_name=session_data.get("driver_name", "Guest"),
                start_time=start_time,
                end_time=end_time,
                duration_minutes=duration,
                price=session_data.get("price", 0.0),
                is_paid=True,
                payment_method=session_data.get("payment_method", "cash"),
                status="completed",
                notes=f"offline_synced|{session_data.get('offline_session_id', '')}",
            )
            db.add(db_session)
            db.flush()
            created_ids.append(session_data.get("offline_session_id"))
        except Exception as e:
            logger.error(f"Failed to sync offline session: {e}")
            continue

    db.commit()
    return {"synced": len(created_ids), "offline_ids": created_ids}
