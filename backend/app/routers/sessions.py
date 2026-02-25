from fastapi import APIRouter, Depends, HTTPException, Body, Header
from sqlalchemy.orm import Session as DBSession
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from ..database import get_db
from ..models import Session, Station
from .. import schemas, models
from ..services.pricing import calculate_price
from ..routers.auth import require_admin, require_admin_or_public_token
from ..security.api_keys import is_client_token_allowed

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"],
)


def _is_admin(user_or_client: object) -> bool:
    return hasattr(user_or_client, "role") and getattr(user_or_client, "role") == "admin"


def _require_client_scope(user_or_client: object, required_scope: str) -> None:
    if _is_admin(user_or_client):
        return
    token = None if user_or_client in (None, "public") else str(user_or_client)
    if not is_client_token_allowed(token=token, required_scopes=(required_scope,)):
        raise HTTPException(status_code=403, detail="Client token missing required scope")


def _require_kiosk_access(station: Station, kiosk_code: Optional[str], user_or_client: object) -> None:
    if _is_admin(user_or_client):
        return
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if not station.is_kiosk_mode:
        raise HTTPException(status_code=403, detail="Kiosk mode disabled for station")
    if not kiosk_code or station.kiosk_code != kiosk_code:
        raise HTTPException(status_code=403, detail="Invalid kiosk code")


@router.post("/start", response_model=schemas.SessionResponse)
def start_session(
    session_data: schemas.SessionStart,
    db: DBSession = Depends(get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token),
    kiosk_code: Optional[str] = Header(None, alias="X-Kiosk-Code"),
):
    # Check if station exists
    station = db.query(Station).filter(Station.id == session_data.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    # Public clients can only create sessions for their paired kiosk station.
    _require_client_scope(user_or_client, "kiosk:control")
    _require_kiosk_access(station, kiosk_code, user_or_client)

    # Check if station already has an active session
    active_session = db.query(Session).filter(
        Session.station_id == session_data.station_id,
        Session.status.in_(["active", "paused"])
    ).first()

    if active_session:
        # Auto-close existing session to prevent "stuck" stations
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

    return [_map_session_response(s, s.station.name) for s in valid_sessions]


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
