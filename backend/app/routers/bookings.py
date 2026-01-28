"""
Bookings Router - Manage simulator time slot reservations
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, timedelta

from .. import models
from ..database import get_db
from ..services.email_service import send_booking_confirmation, send_booking_status_update
from sqlalchemy.orm import Session

router = APIRouter(prefix="/bookings", tags=["bookings"])


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
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    num_players: int = 1  # Number of players in the group
    date: date
    time_slot: str
    duration_minutes: int = 60
    notes: Optional[str] = None


class BookingUpdate(BaseModel):
    status: str  # pending, confirmed, cancelled, completed
    notes: Optional[str] = None


@router.get("/")
async def list_bookings(
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all bookings with optional filters"""
    query = db.query(models.Booking).order_by(models.Booking.date.desc(), models.Booking.time_slot)
    
    if status:
        query = query.filter(models.Booking.status == status)
    if date_from:
        query = query.filter(models.Booking.date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(models.Booking.date <= datetime.combine(date_to, datetime.max.time()))
    
    bookings = query.limit(limit).all()
    
    return [
        {
            "id": b.id,
            "station_id": b.station_id,
            "customer_name": b.customer_name,
            "customer_email": b.customer_email,
            "customer_phone": b.customer_phone,
            "num_players": b.num_players or 1,
            "date": b.date.date().isoformat() if b.date else None,
            "time_slot": b.time_slot,
            "duration_minutes": b.duration_minutes,
            "status": b.status,
            "notes": b.notes,
            "created_at": b.created_at.isoformat() if b.created_at else None
        }
        for b in bookings
    ]


@router.get("/available")
async def get_available_slots(
    target_date: date = Query(..., description="Date to check availability"),
    station_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get available time slots for a specific date"""
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
    booked_slots = {b.time_slot for b in existing_bookings}
    
    # Get all stations
    stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    station_count = len(stations) if stations else 1
    
    # Determine which slots are fully booked
    availability = []
    for slot in TIME_SLOTS:
        slot_bookings = [b for b in existing_bookings if b.time_slot == slot]
        
        # FIX: Sum num_players instead of counting rows.
        # Handle case where num_players might be None (default to 1)
        occupied_slots = sum((b.num_players or 1) for b in slot_bookings)
        
        remaining = station_count - occupied_slots
        
        availability.append({
            "time_slot": slot,
            "available": remaining > 0,
            "remaining_slots": max(0, remaining),
            "booked_count": occupied_slots
        })
    
    return {
        "date": target_date.isoformat(),
        "total_stations": station_count,
        "slots": availability
    }


@router.post("/")
async def create_booking(data: BookingCreate, db: Session = Depends(get_db)):
    """Create a new booking"""
    try:
        # Validate time slot
        if data.time_slot not in TIME_SLOTS:
            raise HTTPException(status_code=400, detail=f"Invalid time slot. Valid options: {TIME_SLOTS}")
        
        # Check availability
        booking_datetime = datetime.combine(data.date, datetime.min.time())
        start_of_day = booking_datetime
        end_of_day = datetime.combine(data.date, datetime.max.time())
        
        existing = db.query(models.Booking).filter(
            models.Booking.date >= start_of_day,
            models.Booking.date <= end_of_day,
            models.Booking.time_slot == data.time_slot,
            models.Booking.status.in_(["pending", "confirmed"])
        )
        
        if data.station_id:
            existing = existing.filter(models.Booking.station_id == data.station_id)
            if existing.first():
                raise HTTPException(status_code=409, detail="This slot is already booked for this station")
        else:
            # Check if all stations are booked
            stations = db.query(models.Station).filter(models.Station.is_active == True).all()
            station_count = len(stations) if stations else 1
            
            # Get all existing bookings for this slot to sum players
            # We can't just use .count() on the query because we need to sum num_players
            slot_existing_bookings = existing.all()
            occupied_slots = sum((b.num_players or 1) for b in slot_existing_bookings)
            
            # Check if there is enough space for the new group
            if occupied_slots + data.num_players > station_count:
                raise HTTPException(status_code=409, detail=f"Not enough stations available. Requested: {data.num_players}, Available: {station_count - occupied_slots}")
        
        # Create booking
        booking = models.Booking(
            station_id=data.station_id,
            customer_name=data.customer_name,
            customer_email=data.customer_email,
            customer_phone=data.customer_phone,
            num_players=data.num_players,
            date=booking_datetime,
            time_slot=data.time_slot,
            duration_minutes=data.duration_minutes,
            notes=data.notes,
            status="pending"
        )
        
        db.add(booking)
        db.commit()
        db.refresh(booking)
        
        # Send confirmation email
        if data.customer_email:
            send_booking_confirmation(
                customer_email=data.customer_email,
                customer_name=data.customer_name,
                date=data.date.strftime('%d/%m/%Y'),
                time_slot=data.time_slot,
                num_players=data.num_players,
                duration_minutes=data.duration_minutes,
                booking_id=booking.id
            )
        
        return {
            "id": booking.id,
            "message": "Reserva creada correctamente",
            "status": booking.status,
            "date": data.date.isoformat(),
            "time_slot": data.time_slot,
            "email_sent": bool(data.customer_email)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{booking_id}")
async def get_booking(booking_id: int, db: Session = Depends(get_db)):
    """Get a specific booking by ID"""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    return {
        "id": booking.id,
        "station_id": booking.station_id,
        "customer_name": booking.customer_name,
        "customer_email": booking.customer_email,
        "customer_phone": booking.customer_phone,
        "date": booking.date.date().isoformat() if booking.date else None,
        "time_slot": booking.time_slot,
        "duration_minutes": booking.duration_minutes,
        "status": booking.status,
        "notes": booking.notes,
        "created_at": booking.created_at.isoformat() if booking.created_at else None
    }


@router.put("/{booking_id}/status")
async def update_booking_status(
    booking_id: int,
    data: BookingUpdate,
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
        
        db.commit()
        
        # Send status update email
        if booking.customer_email and data.status in ["confirmed", "cancelled", "completed"]:
            send_booking_status_update(
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


@router.delete("/{booking_id}")
async def cancel_booking(booking_id: int, db: Session = Depends(get_db)):
    """Cancel a booking"""
    try:
        booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        booking.status = "cancelled"
        db.commit()
        
        return {"message": "Reserva cancelada correctamente"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calendar/week")
async def get_week_calendar(start_date: Optional[date] = None, db: Session = Depends(get_db)):
    """Get bookings for a week (for calendar view)"""
    if not start_date:
        # Start from Monday of current week
        today = date.today()
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
    
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "days": list(calendar.values())
    }


@router.get("/config/time-slots")
async def get_time_slots():
    """Get configured time slots"""
    return {"slots": TIME_SLOTS}
