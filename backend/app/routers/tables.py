from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from ..database import get_db
from .. import models, schemas
from pydantic import BaseModel

router = APIRouter(
    prefix="/tables",
    tags=["tables"],
    responses={404: {"description": "Not found"}},
)

# --- Schemas ---
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
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return db_booking

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
