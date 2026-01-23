from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from ..database import get_db
from .. import models, schemas
from ..services.email_service import send_table_confirmation, send_booking_status_update
from pydantic import BaseModel
import uuid

router = APIRouter(
    prefix="/tables",
    tags=["tables"],
    responses={404: {"description": "Not found"}},
)

# --- Schemas ---
class TableStatusUpdate(BaseModel):
    status: str # free, occupied, bill, cleaning, reserved
class TableCreate(BaseModel):
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

class BookingCreate(BaseModel):
    table_ids: List[int]
    customer_name: str
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    start_time: datetime
    end_time: datetime
    pax: int = 2
    notes: Optional[str] = None

# --- Endpoints ---

@router.get("/")
def get_tables(db: Session = Depends(get_db)):
    """Get all tables layout"""
    return db.query(models.RestaurantTable).filter(models.RestaurantTable.is_active == True).all()

@router.post("/layout")
def update_layout(tables: List[TableCreate], db: Session = Depends(get_db)):
    """
    Batch update layout (full replace/sync for simplicity in editor).
    In a real scenario we might want to patch individual IDs, but for a layout editor, 
    often it's easier to just sync the 'floor plan'.
    
    HOWEVER, we must be careful not to destroy existing IDs if they have bookings.
    So this logic needs to be: Update existing by ID if passed, create new if not.
    """
    # For now, let's implement a simple create/append for testing
    # A real 'sync' is more complex. Let's just allow creating one by one or bulk create for initial setup.
    created = []
    for t in tables:
        db_table = models.RestaurantTable(**t.dict())
        db.add(db_table)
        created.append(db_table)
    db.commit()
    for c in created:
        db.refresh(c)
    return created

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
    if not end_date:
        end_date = start_date + timedelta(days=1)
        
    bookings = db.query(models.TableBooking).filter(
        models.TableBooking.start_time >= start_date,
        models.TableBooking.start_time < end_date,
        models.TableBooking.status != "cancelled"
    ).all()
    return bookings

@router.post("/bookings")
def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    # 1. Validation: Check for overlaps (Conflict Check)
    # Logic: New Booking (S1, E1) overlaps with Existing (S2, E2) if: S1 < E2 AND E1 > S2
    # And if they share any table_ids.
    
    # Get all active bookings that might overlap in time
    potential_conflicts = db.query(models.TableBooking).filter(
        models.TableBooking.status.notin_(["cancelled", "no-show", "completed"]),
        models.TableBooking.end_time > booking.start_time,
        models.TableBooking.start_time < booking.end_time
    ).all()
    
    # Check for table intersection
    requested_tables = set(booking.table_ids)
    for existing in potential_conflicts:
        # existing.table_ids is likely a list (JSON)
        existing_tables = set(existing.table_ids) if isinstance(existing.table_ids, list) else set()
        
        if not requested_tables.isdisjoint(existing_tables):
            # Intersection found
            raise HTTPException(
                status_code=409, 
                detail=f"Conflict: Table(s) {list(requested_tables.intersection(existing_tables))} already booked during this time."
            )

    db_booking = models.TableBooking(**booking.dict())
    db_booking.manage_token = str(uuid.uuid4())
    
    # Try to link to a driver via email
    if booking.customer_email:
        driver = db.query(models.Driver).filter(models.Driver.email == booking.customer_email).first()
        if driver:
            db_booking.driver_id = driver.id

    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    
    # Send Email
    if booking.customer_email:
        # Get table labels for email
        tables = db.query(models.RestaurantTable).filter(models.RestaurantTable.id.in_(booking.table_ids)).all()
        table_labels = ", ".join([t.label for t in tables])
        
        send_table_confirmation(
            customer_email=booking.customer_email,
            customer_name=booking.customer_name,
            date=booking.start_time.strftime('%d/%m/%Y'),
            time=booking.start_time.strftime('%H:%M'),
            pax=booking.pax,
            table_labels=table_labels,
            booking_id=db_booking.id,
            manage_token=db_booking.manage_token
        )
        
    return db_booking

@router.get("/bookings/manage/{token}")
def get_booking_by_token(token: str, db: Session = Depends(get_db)):
    booking = db.query(models.TableBooking).filter(models.TableBooking.manage_token == token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    
    # Get table info
    table_labels = []
    if booking.table_ids:
        tables = db.query(models.RestaurantTable).filter(models.RestaurantTable.id.in_(booking.table_ids)).all()
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
    start_dt = datetime.strptime(f"{request.date} {request.time}", "%Y-%m-%d %H:%M")
    end_dt = start_dt + timedelta(minutes=90) # Assume 1.5h default
    
    # 2. Get all tables
    all_tables = db.query(models.RestaurantTable).filter(models.RestaurantTable.is_active == True).all()
    
    # 3. Get conflicting bookings
    conflicts = db.query(models.TableBooking).filter(
        models.TableBooking.status.notin_(["cancelled", "completed"]),
        models.TableBooking.end_time > start_dt,
        models.TableBooking.start_time < end_dt
    ).all()
    
    busy_table_ids = set()
    for b in conflicts:
        if isinstance(b.table_ids, list):
            busy_table_ids.update(b.table_ids)
            
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
                        "reason": f"Combinación en {zone}: {t1.label} + {t2.label}"
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
