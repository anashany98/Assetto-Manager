from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from ..database import get_db
from .. import models, schemas
from ..services.email_service import send_table_confirmation, send_booking_status_update
from pydantic import BaseModel
import uuid
from sqlalchemy.exc import IntegrityError
import os

router = APIRouter(
    prefix="/tables",
    tags=["tables"],
    responses={404: {"description": "Not found"}},
)

BLOCKING_STATUSES = {"confirmed", "seated", "reserved"}

def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value

def _normalize_table_ids(value: List[int]) -> List[int]:
    return sorted({int(v) for v in value if v is not None})

def _get_table_ids(booking: models.TableBooking) -> List[int]:
    if isinstance(booking.table_ids, list) and booking.table_ids:
        return booking.table_ids
    return [link.table_id for link in booking.table_links]

def _booking_payload(booking: models.TableBooking) -> dict:
    table_ids = _get_table_ids(booking)
    return {
        "id": booking.id,
        "table_ids": table_ids,
        "customer_name": booking.customer_name,
        "customer_phone": booking.customer_phone,
        "customer_email": booking.customer_email,
        "start_time": booking.start_time,
        "end_time": booking.end_time,
        "pax": booking.pax,
        "status": booking.status,
        "notes": booking.notes,
    }

def _strip_kiosk_suffix(value: str) -> str:
    base = value.rstrip("/")
    if base.endswith("/kiosk"):
        base = base[:-6]
    return base

def _resolve_public_base_url(db: Session) -> Optional[str]:
    env_value = os.getenv("PUBLIC_APP_URL") or os.getenv("PUBLIC_BASE_URL")
    if env_value:
        return _strip_kiosk_suffix(env_value)

    settings = db.query(models.GlobalSettings).filter(
        models.GlobalSettings.key.in_(["public_app_url", "payment_public_kiosk_url"])
    ).all()
    setting_map = {s.key: s.value for s in settings if s.value}
    value = setting_map.get("public_app_url") or setting_map.get("payment_public_kiosk_url")
    if value:
        return _strip_kiosk_suffix(value)
    return None

class TableSync(BaseModel):
    id: Optional[int] = None
    label: str
    x: float
    y: float
    width: float
    height: float
    shape: str = "rect"
    seats: int = 4
    rotation: float = 0.0
    zone: str = "main"
    fixed_notes: Optional[str] = None
    is_active: bool = True

@router.post("/layout")
def update_layout(tables: List[TableSync], db: Session = Depends(get_db)):
    """
    Sync layout: Update existing, Create new, Deactivate missing.
    """
    # 1. Get all active tables to track what needs deactivation
    existing_tables = db.query(models.RestaurantTable).filter(models.RestaurantTable.is_active == True).all()
    existing_map = {t.id: t for t in existing_tables}
    
    processed_ids = set()
    result = []

    for t_data in tables:
        # Check if it's an existing table (and not a temp frontend ID)
        # We assume real IDs are small integers, temp IDs are timestamps (large)
        # Or simply check existence in map
        
        db_table = None
        if t_data.id and t_data.id in existing_map:
            db_table = existing_map[t_data.id]
            # Update fields
            for key, value in t_data.dict(exclude={'id'}).items():
                setattr(db_table, key, value)
            processed_ids.add(t_data.id)
        else:
            # Create new
            # Exclude ID so DB generates it
            table_dict = t_data.dict(exclude={'id'})
            db_table = models.RestaurantTable(**table_dict)
            db.add(db_table)
        
        result.append(db_table)

    # 2. Soft delete tables not in request
    # Only if we received a non-empty list (to avoid accidental wipe)
    if tables:
        for t_id, t in existing_map.items():
            if t_id not in processed_ids:
                t.is_active = False
    
    db.commit()
    
    # Refresh all to get IDs
    for r in result:
        db.refresh(r)
        
    return result

@router.get("/")
def get_tables(db: Session = Depends(get_db)):
    return db.query(models.RestaurantTable).filter(models.RestaurantTable.is_active == True).all()

class TableUpdate(BaseModel):
    label: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    shape: Optional[str] = None
    seats: Optional[int] = None
    rotation: Optional[float] = None
    zone: Optional[str] = None
    fixed_notes: Optional[str] = None
    is_active: Optional[bool] = None

@router.put("/{table_id}")
def update_table(table_id: int, table: TableUpdate, db: Session = Depends(get_db)):
    db_table = db.query(models.RestaurantTable).filter(models.RestaurantTable.id == table_id).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    for key, value in table.dict(exclude_unset=True).items():
        setattr(db_table, key, value)
    
    db.commit()
    db.refresh(db_table)
    return db_table

@router.delete("/{table_id}")
def delete_table(table_id: int, db: Session = Depends(get_db)):
    db_table = db.query(models.RestaurantTable).filter(models.RestaurantTable.id == table_id).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    db_table.is_active = False # Soft delete
    db.commit()
    return {"status": "success"}

@router.get("/bookings")
def get_bookings(
    start_date: datetime, 
    end_date: Optional[datetime] = None, 
    db: Session = Depends(get_db)
):
    """Get bookings in a range"""
    start_date = _ensure_aware(start_date)
    if not end_date:
        end_date = start_date + timedelta(days=1)
    end_date = _ensure_aware(end_date)
        
    bookings = db.query(models.TableBooking).filter(
        models.TableBooking.start_time < end_date,
        models.TableBooking.end_time > start_date,
        models.TableBooking.status != "cancelled"
    ).all()
    return [_booking_payload(b) for b in bookings]

class BookingCreate(BaseModel):
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    start_time: datetime
    end_time: datetime
    pax: int
    table_ids: List[int]
    notes: Optional[str] = None
    status: str = "confirmed"

@router.post("/bookings")
def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    start_time = _ensure_aware(booking.start_time)
    end_time = _ensure_aware(booking.end_time)
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time.")

    table_ids = _normalize_table_ids(booking.table_ids)
    if not table_ids:
        raise HTTPException(status_code=400, detail="No tables selected.")

    tables = db.query(models.RestaurantTable).filter(
        models.RestaurantTable.id.in_(table_ids),
        models.RestaurantTable.is_active == True
    ).all()
    if len(tables) != len(table_ids):
        raise HTTPException(status_code=400, detail="One or more tables do not exist.")

    conflicts = db.query(models.TableBookingTable).filter(
        models.TableBookingTable.table_id.in_(table_ids),
        models.TableBookingTable.status.in_(BLOCKING_STATUSES),
        models.TableBookingTable.end_time > start_time,
        models.TableBookingTable.start_time < end_time
    ).all()
    if conflicts:
        conflict_tables = sorted({c.table_id for c in conflicts})
        raise HTTPException(
            status_code=409,
            detail=f"Conflict: Table(s) {conflict_tables} already booked during this time."
        )

    db_booking = models.TableBooking(**booking.dict())
    db_booking.start_time = start_time
    db_booking.end_time = end_time
    db_booking.table_ids = table_ids
    db_booking.manage_token = str(uuid.uuid4())

    for table_id in table_ids:
        db_booking.table_links.append(models.TableBookingTable(
            table_id=table_id,
            start_time=start_time,
            end_time=end_time,
            status=db_booking.status
        ))
    
    # Try to link to a driver via email
    if booking.customer_email:
        driver = db.query(models.Driver).filter(models.Driver.email == booking.customer_email).first()
        if driver:
            db_booking.driver_id = driver.id

    db.add(db_booking)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflict: Table already booked during this time.")

    db.refresh(db_booking)
    
    # Send Email
    if booking.customer_email:
        # Get table labels for email
        tables = db.query(models.RestaurantTable).filter(models.RestaurantTable.id.in_(table_ids)).all()
        table_labels = ", ".join([t.label for t in tables])
        
        public_base_url = _resolve_public_base_url(db)
        send_table_confirmation(
            customer_email=booking.customer_email,
            customer_name=booking.customer_name,
            date=booking.start_time.strftime('%d/%m/%Y'),
            time=booking.start_time.strftime('%H:%M'),
            pax=booking.pax,
            table_labels=table_labels,
            booking_id=db_booking.id,
            manage_token=db_booking.manage_token,
            public_base_url=public_base_url
        )
        
    return db_booking

@router.get("/bookings/manage/{token}")
def get_booking_by_token(token: str, db: Session = Depends(get_db)):
    booking = db.query(models.TableBooking).filter(models.TableBooking.manage_token == token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    # Get table info
    table_labels = []
    table_ids = _get_table_ids(booking)
    if table_ids:
        tables = db.query(models.RestaurantTable).filter(models.RestaurantTable.id.in_(table_ids)).all()
        table_labels = [t.label for t in tables]
            
    return {
        "id": booking.id,
        "customer_name": booking.customer_name,
        "customer_email": booking.customer_email,
        "customer_phone": booking.customer_phone,
        "start_time": booking.start_time,
        "end_time": booking.end_time,
        "pax": booking.pax,
        "status": booking.status,
        "notes": booking.notes,
        "allergies": booking.allergies or [],
        "table_labels": table_labels
    }

class BookingUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    allergies: Optional[List[str]] = None

@router.put("/bookings/manage/{token}")
def update_booking_by_token(token: str, update: BookingUpdate, db: Session = Depends(get_db)):
    booking = db.query(models.TableBooking).filter(models.TableBooking.manage_token == token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
        
    old_status = booking.status
    
    if update.status:
        booking.status = update.status
        for link in booking.table_links:
            link.status = booking.status
    if update.notes is not None:
        booking.notes = update.notes
    if update.allergies is not None:
        booking.allergies = update.allergies
        
    db.commit()
    db.refresh(booking)
    
    # Send status update email if status changed
    if update.status and update.status != old_status and booking.customer_email:
        send_booking_status_update(
            customer_email=booking.customer_email,
            customer_name=booking.customer_name,
            date=booking.start_time.strftime('%d/%m/%Y'),
            time_slot=booking.start_time.strftime('%H:%M'),
            new_status=booking.status,
            booking_id=booking.id
        )
        
    return booking

class TableStatusUpdate(BaseModel):
    status: str

@router.put("/{table_id}/status")
def set_table_status(table_id: int, status_update: TableStatusUpdate, db: Session = Depends(get_db)):
    """Update live status of a table (for staff)"""
    table = db.query(models.RestaurantTable).filter(models.RestaurantTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    valid_statuses = ["free", "occupied", "bill", "cleaning", "reserved"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    table.status = status_update.status
    db.commit()
    return {"status": "updated", "new_state": table.status}

class SmartAssignRequest(BaseModel):
    pax: int
    date: str # ISO Date
    time: str # "HH:MM"

@router.post("/find-best-fit")
def find_best_fit(request: SmartAssignRequest, db: Session = Depends(get_db)):
    """Suggest best tables for a group"""
    # 1. Parse date/time
    start_dt = _ensure_aware(datetime.strptime(f"{request.date} {request.time}", "%Y-%m-%d %H:%M"))
    end_dt = start_dt + timedelta(minutes=90) # Assume 1.5h default
    
    # 2. Get all tables
    all_tables = db.query(models.RestaurantTable).filter(models.RestaurantTable.is_active == True).all()
    
    # 3. Get conflicting bookings
    conflicts = db.query(models.TableBookingTable).filter(
        models.TableBookingTable.status.in_(BLOCKING_STATUSES),
        models.TableBookingTable.end_time > start_dt,
        models.TableBookingTable.start_time < end_dt
    ).all()
    
    busy_table_ids = {c.table_id for c in conflicts}
            
    available_tables = [t for t in all_tables if t.id not in busy_table_ids]
    
    # 4. Strategy: Best Single Fit
    # Sort by seats asc
    available_tables.sort(key=lambda t: t.seats)
    
    # Find smallest table that fits all
    for t in available_tables:
        if t.seats >= request.pax:
            return {
                "strategy": "single",
                "table_ids": [t.id],
                "reason": f"Mesa {t.label} ({t.seats} pax) es perfecta."
            }
            
    # 5. Strategy: Combinations (Naive - Same Zone)
    # Group by zone
    zones = {}
    for t in available_tables:
        if t.zone not in zones: zones[t.zone] = []
        zones[t.zone].append(t)
        
    for zone, tables in zones.items():
        # Try to find 2 tables that sum up to pax
        # Sort desc to use biggest first
        tables.sort(key=lambda t: t.seats, reverse=True)
        
        # Simple pair check
        for i in range(len(tables)):
            for j in range(i+1, len(tables)):
                t1 = tables[i]
                t2 = tables[j]
                if t1.seats + t2.seats >= request.pax:
                     return {
                        "strategy": "combination",
                        "table_ids": [t1.id, t2.id],
                        "reason": f"Combinacion en {zone}: {t1.label} + {t2.label}"
                    }
    
    raise HTTPException(status_code=404, detail="No hay mesas disponibles para este grupo")


@router.get("/customers/search", response_model=List[str])
def search_customers(
    q: str,
    db: Session = Depends(get_db)
):
    """Search for unique customer names from past bookings"""
    if not q or len(q) < 2:
        return []
        
    # DISTINCT query on customer_name
    results = db.query(models.TableBooking.customer_name)\
        .filter(models.TableBooking.customer_name.ilike(f"%{q}%"))\
        .distinct()\
        .limit(10)\
        .all()
        
    return [r[0] for r in results]
