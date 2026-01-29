"""
Reservations Router - Online booking system for SimCenter sessions
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from .. import database, models
from .auth import get_current_active_user, require_admin_or_public_token

router = APIRouter(
    prefix="/reservations",
    tags=["reservations"]
)

# --- Pydantic Schemas ---

class ReservationCreate(BaseModel):
    station_id: Optional[int] = None
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    start_time: datetime
    duration_minutes: int = 30
    notes: Optional[str] = None
    price: Optional[float] = None

class ReservationUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    paid: Optional[bool] = None

class ReservationResponse(BaseModel):
    id: int
    station_id: Optional[int]
    station_name: Optional[str] = None
    client_name: str
    client_email: Optional[str]
    client_phone: Optional[str]
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    status: str
    notes: Optional[str]
    price: Optional[float]
    paid: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.post("/", response_model=ReservationResponse, dependencies=[Depends(require_admin_or_public_token)])
def create_reservation(reservation: ReservationCreate, db: Session = Depends(database.get_db)):
    """Create a new reservation (booking)"""
    
    # Calculate end time
    end_time = reservation.start_time + timedelta(minutes=reservation.duration_minutes)
    
    # Check for conflicts if station specified
    if reservation.station_id:
        conflict = db.query(models.Reservation).filter(
            and_(
                models.Reservation.station_id == reservation.station_id,
                models.Reservation.status.in_(["pending", "confirmed"]),
                models.Reservation.start_time < end_time,
                models.Reservation.end_time > reservation.start_time
            )
        ).first()
        
        if conflict:
            raise HTTPException(
                status_code=409, 
                detail=f"Conflicto: Ya existe una reserva en ese horario"
            )
    
    db_reservation = models.Reservation(
        station_id=reservation.station_id,
        client_name=reservation.client_name,
        client_email=reservation.client_email,
        client_phone=reservation.client_phone,
        start_time=reservation.start_time,
        end_time=end_time,
        duration_minutes=reservation.duration_minutes,
        notes=reservation.notes,
        price=reservation.price,
        status="pending"
    )
    
    db.add(db_reservation)
    db.commit()
    db.refresh(db_reservation)
    
    return _to_response(db_reservation)


@router.get("/", response_model=List[ReservationResponse], dependencies=[Depends(get_current_active_user)])
def list_reservations(
    station_id: Optional[int] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db)
):
    """List reservations with optional filters"""
    query = db.query(models.Reservation)
    
    if station_id:
        query = query.filter(models.Reservation.station_id == station_id)
    if status:
        query = query.filter(models.Reservation.status == status)
    if date:
        try:
            target_date = datetime.fromisoformat(date.replace("Z", "+00:00"))
            start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            query = query.filter(
                models.Reservation.start_time >= start_of_day,
                models.Reservation.start_time < end_of_day
            )
        except:
            pass
    
    reservations = query.order_by(models.Reservation.start_time).offset(skip).limit(limit).all()
    return [_to_response(r) for r in reservations]


@router.get("/today", response_model=List[ReservationResponse], dependencies=[Depends(get_current_active_user)])
def get_today_reservations(db: Session = Depends(database.get_db)):
    """Get all reservations for today"""
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    reservations = db.query(models.Reservation).filter(
        models.Reservation.start_time >= start_of_day,
        models.Reservation.start_time < end_of_day
    ).order_by(models.Reservation.start_time).all()
    
    return [_to_response(r) for r in reservations]


@router.get("/upcoming", response_model=List[ReservationResponse], dependencies=[Depends(get_current_active_user)])
def get_upcoming_reservations(limit: int = 10, db: Session = Depends(database.get_db)):
    """Get upcoming reservations from now"""
    now = datetime.now(timezone.utc)
    
    reservations = db.query(models.Reservation).filter(
        models.Reservation.start_time >= now,
        models.Reservation.status.in_(["pending", "confirmed"])
    ).order_by(models.Reservation.start_time).limit(limit).all()
    
    return [_to_response(r) for r in reservations]


@router.get("/{reservation_id}", response_model=ReservationResponse, dependencies=[Depends(get_current_active_user)])
def get_reservation(reservation_id: int, db: Session = Depends(database.get_db)):
    """Get a specific reservation"""
    reservation = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    return _to_response(reservation)


@router.put("/{reservation_id}", response_model=ReservationResponse, dependencies=[Depends(get_current_active_user)])
def update_reservation(reservation_id: int, update: ReservationUpdate, db: Session = Depends(database.get_db)):
    """Update a reservation (status, notes, paid)"""
    reservation = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    if update.status:
        reservation.status = update.status
    if update.notes is not None:
        reservation.notes = update.notes
    if update.paid is not None:
        reservation.paid = update.paid
    
    db.commit()
    db.refresh(reservation)
    return _to_response(reservation)


@router.delete("/{reservation_id}", dependencies=[Depends(get_current_active_user)])
def cancel_reservation(reservation_id: int, db: Session = Depends(database.get_db)):
    """Cancel (soft delete) a reservation"""
    reservation = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    reservation.status = "cancelled"
    db.commit()
    return {"status": "ok", "message": "Reserva cancelada"}


# --- Helper ---

def _to_response(r: models.Reservation) -> ReservationResponse:
    return ReservationResponse(
        id=r.id,
        station_id=r.station_id,
        station_name=r.station.name if r.station else None,
        client_name=r.client_name,
        client_email=r.client_email,
        client_phone=r.client_phone,
        start_time=r.start_time,
        end_time=r.end_time,
        duration_minutes=r.duration_minutes,
        status=r.status,
        notes=r.notes,
        price=r.price,
        paid=r.paid,
        created_at=r.created_at
    )
