from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from ..database import get_db
from .. import models
from ..models import Session as SessionModel, SessionResult

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
    responses={404: {"description": "Not found"}},
)

@router.get("/overview")
async def get_analytics_overview(range_days: int = 30, db: Session = Depends(get_db)):
    """
    High-level analytics summary used by dashboards.
    """
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=range_days)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_sessions = db.query(func.count(SessionModel.id)).scalar() or 0
    sessions_today = db.query(func.count(SessionModel.id)).filter(SessionModel.start_time >= today_start).scalar() or 0
    sessions_this_week = db.query(func.count(SessionModel.id)).filter(SessionModel.start_time >= week_start).scalar() or 0
    sessions_this_month = db.query(func.count(SessionModel.id)).filter(SessionModel.start_time >= month_start).scalar() or 0

    total_drivers = db.query(func.count(models.Driver.id)).scalar() or 0
    active_drivers_week = db.query(func.count(func.distinct(SessionModel.driver_name))).filter(
        SessionModel.start_time >= week_start,
        SessionModel.driver_name.isnot(None)
    ).scalar() or 0

    bookings_total = db.query(func.count(models.Booking.id)).scalar() or 0
    bookings_pending = db.query(func.count(models.Booking.id)).filter(models.Booking.status == "pending").scalar() or 0
    bookings_confirmed = db.query(func.count(models.Booking.id)).filter(models.Booking.status == "confirmed").scalar() or 0
    bookings_today = db.query(func.count(models.Booking.id)).filter(
        models.Booking.date >= today_start,
        models.Booking.date < (today_start + timedelta(days=1))
    ).scalar() or 0

    total_points_issued = db.query(func.coalesce(func.sum(models.Driver.total_points_earned), 0)).scalar() or 0
    total_points_redeemed = db.query(func.coalesce(func.sum(models.RewardRedemption.points_spent), 0)).scalar() or 0

    tier_counts = db.query(
        models.Driver.membership_tier,
        func.count(models.Driver.id)
    ).group_by(models.Driver.membership_tier).all()
    tier_distribution = {tier or "unknown": count for tier, count in tier_counts}
    for tier in ("bronze", "silver", "gold", "platinum"):
        tier_distribution.setdefault(tier, 0)

    top_drivers_rows = db.query(
        SessionResult.driver_name,
        func.count(SessionResult.id).label("sessions"),
        func.min(SessionResult.best_lap).label("best_lap")
    ).filter(
        SessionResult.date >= start_date,
        SessionResult.driver_name.isnot(None)
    ).group_by(SessionResult.driver_name).order_by(desc("sessions")).limit(5).all()
    top_drivers = [
        {"name": row.driver_name, "sessions": row.sessions or 0, "best_lap": row.best_lap or 0}
        for row in top_drivers_rows
        if row.driver_name
    ]

    popular_tracks_rows = db.query(
        SessionResult.track_name,
        func.count(SessionResult.id).label("sessions")
    ).filter(
        SessionResult.date >= start_date,
        SessionResult.track_name.isnot(None)
    ).group_by(SessionResult.track_name).order_by(desc("sessions")).limit(5).all()
    popular_tracks = [
        {"name": row.track_name, "sessions": row.sessions or 0}
        for row in popular_tracks_rows
        if row.track_name
    ]

    popular_cars_rows = db.query(
        SessionResult.car_model,
        func.count(SessionResult.id).label("sessions")
    ).filter(
        SessionResult.date >= start_date,
        SessionResult.car_model.isnot(None)
    ).group_by(SessionResult.car_model).order_by(desc("sessions")).limit(5).all()
    popular_cars = [
        {"name": row.car_model, "sessions": row.sessions or 0}
        for row in popular_cars_rows
        if row.car_model
    ]

    session_counts = db.query(
        func.date(SessionModel.start_time).label("date"),
        func.count(SessionModel.id).label("sessions")
    ).filter(
        SessionModel.start_time >= start_date,
        SessionModel.start_time.isnot(None)
    ).group_by(func.date(SessionModel.start_time)).order_by(func.date(SessionModel.start_time)).all()

    session_map = {str(row.date): row.sessions for row in session_counts}
    sessions_per_day = []
    for i in range(range_days):
        day_dt = now - timedelta(days=range_days - 1 - i)
        day_key = day_dt.strftime("%Y-%m-%d")
        sessions_per_day.append({
            "date": day_key,
            "day": day_dt.strftime("%d/%m"),
            "sessions": session_map.get(day_key, 0)
        })

    hourly_counts = {h: 0 for h in range(24)}
    recent_sessions = db.query(SessionModel.start_time).filter(
        SessionModel.start_time >= start_date,
        SessionModel.start_time.isnot(None)
    ).all()
    for (start_time,) in recent_sessions:
        if start_time:
            hourly_counts[start_time.hour] += 1
    peak_hours = [{"hour": f"{h:02d}:00", "bookings": hourly_counts[h]} for h in range(24)]

    return {
        "summary": {
            "total_sessions": total_sessions,
            "sessions_today": sessions_today,
            "sessions_this_week": sessions_this_week,
            "sessions_this_month": sessions_this_month,
            "total_drivers": total_drivers,
            "active_drivers_week": active_drivers_week
        },
        "bookings": {
            "total": bookings_total,
            "pending": bookings_pending,
            "confirmed": bookings_confirmed,
            "today": bookings_today
        },
        "loyalty": {
            "total_points_issued": total_points_issued,
            "total_points_redeemed": total_points_redeemed,
            "tier_distribution": tier_distribution
        },
        "top_drivers": top_drivers,
        "popular_tracks": popular_tracks,
        "popular_cars": popular_cars,
        "sessions_per_day": sessions_per_day,
        "peak_hours": peak_hours
    }

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
