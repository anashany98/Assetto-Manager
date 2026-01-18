from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from ..database import get_db
from ..models import Session as SessionModel

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
    responses={404: {"description": "Not found"}},
)

@router.get("/revenue")
async def get_revenue_analytics(range_days: int = 30, db: Session = Depends(get_db)):
    """
    Get daily revenue for the specified range.
    """
    start_date = datetime.now(timezone.utc) - timedelta(days=range_days)
    
    # query daily revenue
    daily_revenue = db.query(
        func.date(SessionModel.start_time).label('date'),
        func.sum(SessionModel.price).label('revenue'),
        func.count(SessionModel.id).label('sessions')
    ).filter(
        SessionModel.start_time >= start_date,
        SessionModel.is_paid == True
    ).group_by(
        func.date(SessionModel.start_time)
    ).order_by(
        func.date(SessionModel.start_time)
    ).all()
    
    # Fill missing days with 0
    result = []
    revenue_map = {str(d.date): d.revenue for d in daily_revenue}
    
    for i in range(range_days):
        d = (datetime.now(timezone.utc) - timedelta(days=range_days - 1 - i)).strftime("%Y-%m-%d")
        result.append({
            "date": d,
            "revenue": revenue_map.get(d, 0),
            "sessions": next((r.sessions for r in daily_revenue if str(r.date) == d), 0)
        })
        
    return result

@router.get("/utilization")
async def get_utilization_analytics(range_days: int = 30, db: Session = Depends(get_db)):
    """
    Get average sessions per hour of day to identify peak times.
    """
    start_date = datetime.now(timezone.utc) - timedelta(days=range_days)
    
    # Extract hour from start_time (SQLite specific: strftime('%H', ...))
    # Postgre: extract('hour', ...)
    # Let's try to be generic if possible, or use SQLite syntax as we are likely on SQLite dev
    
    # Assuming SQLite for this project based on standard setups, but let's check.
    # The user mentioned "Migrating... to Supabase (PostgreSQL)" in history, but current state might be mixed.
    # Inspecting models.py might give a hint or we can do python-side aggregation for safety if volume is low.
    # Given "Revenue Dashboard" implies low volume (hundreds of sessions), Python aggregation is safe and db-agnostic.
    
    sessions = db.query(SessionModel).filter(
        SessionModel.start_time >= start_date
    ).all()
    
    # Initialize 0-23 hours
    hourly_counts = {h: 0 for h in range(24)}
    
    for s in sessions:
        if s.start_time:
            # excessive logic isn't needed, just simplest peak hour estimation
            h = s.start_time.hour # UTC... we might want local time?
            # Ideally frontend handles timezone or we store localized.
            # Let's send UTC hour and frontend shifts it, or assume server local time.
            # Actually models say `start_time = Column(DateTime(timezone=True)`
            # So .hour will be correct if timezone aware.
            
            # If we want simple local time of the "shop", we might simply just take the hour.
            hourly_counts[h] += 1
            
    return [{"hour": h, "count": c} for h, c in hourly_counts.items()]

@router.get("/kpi")
async def get_kpi_stats(range_days: int = 30, db: Session = Depends(get_db)):
    """
    Get top-level KPIs
    """
    start_date = datetime.now(timezone.utc) - timedelta(days=range_days)
    
    stats = db.query(
        func.sum(SessionModel.price).label('total_revenue'),
        func.avg(SessionModel.price).label('avg_ticket'),
        func.count(SessionModel.id).label('total_sessions')
    ).filter(
        SessionModel.start_time >= start_date,
        SessionModel.is_paid == True
    ).first()
    
    return {
        "total_revenue": stats.total_revenue or 0,
        "avg_ticket": round(stats.avg_ticket or 0, 2),
        "total_sessions": stats.total_sessions or 0,
        "revenue_per_session": round((stats.total_revenue or 0) / (stats.total_sessions or 1), 2)
    }

@router.get("/payment-methods")
async def get_payment_method_stats(range_days: int = 30, db: Session = Depends(get_db)):
    """
    Get revenue breakdown by payment method.
    """
    start_date = datetime.now(timezone.utc) - timedelta(days=range_days)
    
    stats = db.query(
        SessionModel.payment_method,
        func.sum(SessionModel.price).label('revenue'),
        func.count(SessionModel.id).label('count')
    ).filter(
        SessionModel.start_time >= start_date,
        SessionModel.is_paid == True
    ).group_by(
        SessionModel.payment_method
    ).all()
    
    return [
        {"method": s.payment_method or "unknown", "revenue": s.revenue or 0, "count": s.count}
        for s in stats
    ]
