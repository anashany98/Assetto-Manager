"""
Bookings Router - Manage simulator time slot reservations
"""
from fastapi import APIRouter, HTTPException, Query, Depends, BackgroundTasks, Request
from pydantic import BaseModel, EmailStr, field_validator, Field
from typing import Optional, List
from datetime import datetime, date as dt_date, timedelta, time as dt_time
import os
import logging

from .. import models
from ..database import get_db
from ..services.email_service import send_booking_confirmation, send_booking_status_update
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..routers.auth import require_admin
from ..limiters import limiter
from ..utils.ttl_cache import TTLCache
from ..security.license import require_license_module

router = APIRouter(prefix="/bookings", tags=["bookings"])

logger = logging.getLogger("api.bookings")

AVAILABILITY_CACHE_TTL = int(os.getenv("BOOKING_AVAILABILITY_CACHE_TTL", "30"))
CALENDAR_CACHE_TTL = int(os.getenv("BOOKING_CALENDAR_CACHE_TTL", "30"))

_availability_cache = TTLCache(ttl_seconds=AVAILABILITY_CACHE_TTL, maxsize=512)
_calendar_cache = TTLCache(ttl_seconds=CALENDAR_CACHE_TTL, maxsize=128)


def _invalidate_booking_caches() -> None:
    _availability_cache.clear()
    _calendar_cache.clear()


def _booking_lock_key(target_date: dt_date, time_slot: str, station_id: Optional[int]) -> int:
    import hashlib
    base = f"{target_date.isoformat()}|{time_slot}|{station_id or 'any'}"
    digest = hashlib.sha256(base.encode("utf-8")).digest()[:8]
    key = int.from_bytes(digest, "big", signed=False)
    if key >= 2**63:
        key -= 2**64
    return key


# Time slots configuration
TIME_SLOTS = [
    "10:00-11:00",
    "11:00-12:00",
    "12:00-13:00",
    "13:00-14:00",
    "14:00-15:00",
    "15:00-16:00",
    "16:00-17:00",
    "17:00-18:00",
    "18:00-19:00",
    "19:00-20:00",
    "20:00-21:00",
    "21:00-22:00",
]


# Schemas
class BookingCreate(BaseModel):
    station_id: Optional[int] = None
    customer_name: str = Field(..., min_length=1, max_length=120)
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    num_players: int = Field(default=1, ge=1, le=50)
    date: Optional[dt_date] = None
    time_slot: Optional[str] = None
    start_time: Optional[datetime] = None
    duration_minutes: int = Field(default=60, ge=5, le=480)
    notes: Optional[str] = Field(default=None, max_length=1000)
    price: Optional[float] = Field(default=None, ge=0)
    paid: Optional[bool] = False


class BookingUpdate(BaseModel):
    status: str  # pending, confirmed, cancelled, completed
    notes: Optional[str] = None
    paid: Optional[bool] = None


def _parse_time_slot(slot: str) -> tuple[dt_time, dt_time]:
    parts = (slot or "").split("-")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid time slot format")
    try:
        start_t = datetime.strptime(parts[0].strip(), "%H:%M").time()
        end_t = datetime.strptime(parts[1].strip(), "%H:%M").time()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid time slot format") from exc
    return start_t, end_t


def _resolve_booking_input(data: BookingCreate) -> tuple[dt_date, str, datetime, datetime]:
    if data.start_time:
        start_dt = data.start_time
        end_dt = start_dt + timedelta(minutes=data.duration_minutes)
        booking_date = start_dt.date()
        time_slot = data.time_slot or _time_slot_from_datetime(start_dt, data.duration_minutes)
        return booking_date, time_slot, start_dt, end_dt
    if data.date and data.time_slot:
        start_t, end_t = _parse_time_slot(data.time_slot)
        start_dt = datetime.combine(data.date, start_t)
        end_dt = datetime.combine(data.date, end_t)
        if end_dt <= start_dt:
            end_dt = start_dt + timedelta(minutes=data.duration_minutes)
        return data.date, data.time_slot, start_dt, end_dt
    raise HTTPException(status_code=400, detail="Provide start_time or date + time_slot")


def _time_slot_from_datetime(start_time: datetime, duration_minutes: int) -> str:
    end_time = start_time + timedelta(minutes=duration_minutes)
    return f"{start_time.strftime('%H:%M')}-{end_time.strftime('%H:%M')}"


def _booking_time_range(booking: models.Booking) -> tuple[datetime, datetime]:
    if booking.start_time and booking.end_time:
        return booking.start_time, booking.end_time
    # Fallback to date + time_slot
    start_t, end_t = _parse_time_slot(booking.time_slot)
    start_dt = datetime.combine(booking.date.date(), start_t)
    end_dt = datetime.combine(booking.date.date(), end_t)
    if end_dt <= start_dt:
        end_dt = start_dt + timedelta(minutes=booking.duration_minutes or 60)
    return start_dt, end_dt


def _ranges_overlap(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
    return start_a < end_b and start_b < end_a


def create_booking_record(
    data: BookingCreate,
    db: Session,
    background_tasks: Optional[BackgroundTasks] = None,
    send_email: bool = True
) -> models.Booking:
    booking_date, time_slot, requested_start, requested_end = _resolve_booking_input(data)

    # Prevent race conditions for the same slot (PostgreSQL advisory lock)
    lock_acquired = False
    try:
        if db.bind and db.bind.dialect.name == "postgresql":
            lock_key = _booking_lock_key(booking_date, time_slot, data.station_id)
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
            lock_acquired = True
    except Exception as exc:
        logger.warning("Booking lock unavailable, proceeding without advisory lock: %s", exc)
    
    if not lock_acquired:
        logger.warning(
            "ADVISORY LOCK FAILED for booking %s %s station %s - Race condition possible",
            booking_date, time_slot, data.station_id
        )

    booking_datetime = datetime.combine(booking_date, datetime.min.time())

    start_of_day = booking_datetime
    end_of_day = datetime.combine(booking_date, datetime.max.time())

    existing_query = db.query(models.Booking).filter(
        models.Booking.date >= start_of_day,
        models.Booking.date <= end_of_day,
        models.Booking.status.in_(["pending", "confirmed"])
    )

    if data.station_id:
        existing_query = existing_query.filter(models.Booking.station_id == data.station_id)

    existing_bookings = existing_query.all()

    # Conflict check for specific station
    if data.station_id:
        for b in existing_bookings:
            b_start, b_end = _booking_time_range(b)
            if _ranges_overlap(requested_start, requested_end, b_start, b_end):
                raise HTTPException(status_code=409, detail="This slot is already booked for this station")
    else:
        stations = db.query(models.Station).filter(models.Station.is_active == True).all()
        station_count = len(stations) if stations else 1
        occupied_slots = 0
        for b in existing_bookings:
            b_start, b_end = _booking_time_range(b)
            if _ranges_overlap(requested_start, requested_end, b_start, b_end):
                occupied_slots += (b.num_players or 1)
        if occupied_slots + data.num_players > station_count:
            raise HTTPException(
                status_code=409,
                detail=f"Not enough stations available. Requested: {data.num_players}, Available: {station_count - occupied_slots}"
            )

    booking = models.Booking(
        station_id=data.station_id,
        customer_name=data.customer_name,
        customer_email=data.customer_email,
        customer_phone=data.customer_phone,
        num_players=data.num_players,
        date=booking_datetime,
        time_slot=time_slot,
        start_time=requested_start,
        end_time=requested_end,
        duration_minutes=data.duration_minutes,
        notes=data.notes,
        status="pending",
        price=data.price,
        paid=bool(data.paid)
    )

    db.add(booking)
    db.commit()
    db.refresh(booking)
    _invalidate_booking_caches()

    if send_email and background_tasks and data.customer_email:
        background_tasks.add_task(
        send_booking_confirmation,
        customer_email=data.customer_email,
        customer_name=data.customer_name,
        date=booking_date.strftime('%d/%m/%Y'),
        time_slot=time_slot,
        num_players=data.num_players,
        duration_minutes=data.duration_minutes,
        booking_id=booking.id
    )

    return booking


@router.get("/", dependencies=[Depends(require_admin), Depends(require_license_module("bookings"))])
@limiter.limit("300/minute")
async def list_bookings(
    request: Request,
    status: Optional[str] = None,
    date: Optional[str] = None,
    date_from: Optional[dt_date] = None,
    date_to: Optional[dt_date] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all bookings with optional filters"""
    query = db.query(models.Booking).order_by(models.Booking.date.desc(), models.Booking.time_slot)
    
    if status:
        query = query.filter(models.Booking.status == status)
    if date:
        try:
            target_date = datetime.fromisoformat(date.replace("Z", "+00:00"))
            start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            query = query.filter(
                models.Booking.date >= start_of_day,
                models.Booking.date < end_of_day
            )
        except Exception:
            pass
    if date_from:
        query = query.filter(models.Booking.date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(models.Booking.date <= datetime.combine(date_to, datetime.max.time()))
    
    bookings = query.limit(limit).all()
    
    result = []
    for b in bookings:
        start_time, end_time = _booking_time_range(b)
        result.append({
            "id": b.id,
            "station_id": b.station_id,
            "station_name": b.station.name if b.station else None,
            "customer_name": b.customer_name,
            "customer_email": b.customer_email,
            "customer_phone": b.customer_phone,
            "client_name": b.customer_name,
            "client_email": b.customer_email,
            "client_phone": b.customer_phone,
            "num_players": b.num_players or 1,
            "date": b.date.date().isoformat() if b.date else None,
            "time_slot": b.time_slot,
            "start_time": start_time.isoformat() if start_time else None,
            "end_time": end_time.isoformat() if end_time else None,
            "duration_minutes": b.duration_minutes,
            "status": b.status,
            "notes": b.notes,
            "price": b.price,
            "paid": b.paid,
            "created_at": b.created_at.isoformat() if b.created_at else None
        })
    return result


@router.get("/available", dependencies=[Depends(require_license_module("online_reservations"))])
@limiter.limit("60/minute")
async def get_available_slots(
    request: Request,
    target_date: dt_date = Query(..., description="Date to check availability"),
    station_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get available time slots for a specific date"""
    cache_key = f"{target_date.isoformat()}|{station_id or 'all'}"
    cached = _availability_cache.get(cache_key)
    if cached is not None:
        return cached
    # Get existing bookings for this date
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())
    
    query = db.query(models.Booking).filter(
        models.Booking.date >= start_of_day,
        models.Booking.date <= end_of_day,
        models.Booking.status.in_(["pending", "confirmed"])
    )
    
    if station_id:
        query = query.filter(models.Booking.station_id == station_id)
    
    existing_bookings = query.all()
    
    # Get all stations
    stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    station_count = len(stations) if stations else 1
    
    # Determine which slots are fully booked
    availability = []
    for slot in TIME_SLOTS:
        start_t, end_t = _parse_time_slot(slot)
        slot_start = datetime.combine(target_date, start_t)
        slot_end = datetime.combine(target_date, end_t)
        if slot_end <= slot_start:
            slot_end = slot_start + timedelta(minutes=60)

        occupied_slots = 0
        for b in existing_bookings:
            b_start, b_end = _booking_time_range(b)
            if _ranges_overlap(slot_start, slot_end, b_start, b_end):
                occupied_slots += (b.num_players or 1)

        remaining = station_count - occupied_slots
        availability.append({
            "time_slot": slot,
            "available": remaining > 0,
            "remaining_slots": max(0, remaining),
            "booked_count": occupied_slots
        })
    
    result = {
        "date": target_date.isoformat(),
        "total_stations": station_count,
        "slots": availability
    }
    _availability_cache.set(cache_key, result)
    return result


@router.post("/", dependencies=[Depends(require_license_module("online_reservations"))])
@limiter.limit("30/minute")
async def create_booking(
    request: Request,
    data: BookingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Create a new booking"""
    try:
        booking = create_booking_record(data, db, background_tasks=background_tasks, send_email=True)
        booking_date = booking.date.date().isoformat() if booking.date else None
        return {
            "id": booking.id,
            "message": "Reserva creada correctamente",
            "status": booking.status,
            "date": booking_date,
            "time_slot": booking.time_slot,
            "email_sent": bool(booking.customer_email)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{booking_id}", dependencies=[Depends(require_admin), Depends(require_license_module("bookings"))])
@limiter.limit("300/minute")
async def get_booking(request: Request, booking_id: int, db: Session = Depends(get_db)):
    """Get a specific booking by ID"""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    start_time, end_time = _booking_time_range(booking)
    return {
        "id": booking.id,
        "station_id": booking.station_id,
        "station_name": booking.station.name if booking.station else None,
        "customer_name": booking.customer_name,
        "customer_email": booking.customer_email,
        "customer_phone": booking.customer_phone,
        "client_name": booking.customer_name,
        "client_email": booking.customer_email,
        "client_phone": booking.customer_phone,
        "date": booking.date.date().isoformat() if booking.date else None,
        "time_slot": booking.time_slot,
        "start_time": start_time.isoformat() if start_time else None,
        "end_time": end_time.isoformat() if end_time else None,
        "duration_minutes": booking.duration_minutes,
        "status": booking.status,
        "notes": booking.notes,
        "price": booking.price,
        "paid": booking.paid,
        "created_at": booking.created_at.isoformat() if booking.created_at else None
    }


@router.put("/{booking_id}/status", dependencies=[Depends(require_admin), Depends(require_license_module("bookings"))])
@limiter.limit("120/minute")
async def update_booking_status(
    request: Request,
    booking_id: int,
    data: BookingUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Update a booking's status"""
    try:
        booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        valid_statuses = ["pending", "confirmed", "cancelled", "completed"]
        if data.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Valid options: {valid_statuses}")
        
        booking.status = data.status
        if data.notes:
            booking.notes = data.notes
        if data.paid is not None:
            booking.paid = data.paid
        
        db.commit()
        _invalidate_booking_caches()
        
        # Send status update email
        if booking.customer_email and data.status in ["confirmed", "cancelled", "completed"]:
            background_tasks.add_task(
                send_booking_status_update,
                customer_email=booking.customer_email,
                customer_name=booking.customer_name,
                date=booking.date.strftime('%d/%m/%Y') if booking.date else '',
                time_slot=booking.time_slot,
                new_status=data.status,
                booking_id=booking.id
            )
        
        return {
            "id": booking.id,
            "status": booking.status,
            "message": "Estado actualizado correctamente"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{booking_id}", dependencies=[Depends(require_admin), Depends(require_license_module("bookings"))])
@limiter.limit("120/minute")
async def cancel_booking(request: Request, booking_id: int, db: Session = Depends(get_db)):
    """Cancel a booking"""
    try:
        booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        booking.status = "cancelled"
        db.commit()
        _invalidate_booking_caches()
        
        return {"message": "Reserva cancelada correctamente"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calendar/week", dependencies=[Depends(require_admin), Depends(require_license_module("bookings"))])
@limiter.limit("120/minute")
async def get_week_calendar(request: Request, start_date: Optional[dt_date] = None, db: Session = Depends(get_db)):
    """Get bookings for a week (for calendar view)"""
    if start_date:
        cache_key = start_date.isoformat()
        cached = _calendar_cache.get(cache_key)
        if cached is not None:
            return cached
    if not start_date:
        # Start from Monday of current week
        today = dt_date.today()
        start_date = today - timedelta(days=today.weekday())
    
    end_date = start_date + timedelta(days=6)
    
    bookings = db.query(models.Booking).filter(
        models.Booking.date >= datetime.combine(start_date, datetime.min.time()),
        models.Booking.date <= datetime.combine(end_date, datetime.max.time())
    ).order_by(models.Booking.date, models.Booking.time_slot).all()
    
    # Group by date
    calendar = {}
    current = start_date
    while current <= end_date:
        date_str = current.isoformat()
        calendar[date_str] = {
            "date": date_str,
            "day_name": current.strftime("%A"),
            "bookings": []
        }
        current += timedelta(days=1)
    
    for b in bookings:
        date_str = b.date.date().isoformat()
        if date_str in calendar:
            calendar[date_str]["bookings"].append({
                "id": b.id,
                "time_slot": b.time_slot,
                "customer_name": b.customer_name,
                "status": b.status,
                "station_id": b.station_id
            })
    
    result = {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "days": list(calendar.values())
    }
    _calendar_cache.set(start_date.isoformat(), result)
    return result


@router.get("/config/time-slots", dependencies=[Depends(require_license_module("online_reservations"))])
@limiter.limit("300/minute")
async def get_time_slots(
    request: Request,
):
    """Get configured time slots"""
    return {"slots": TIME_SLOTS}
