"""
Analytics Router - Dashboard analytics and reporting
"""
from fastapi import APIRouter
from datetime import datetime, timedelta, date
from collections import defaultdict

from .. import database, models
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
async def get_analytics_overview():
    """Get comprehensive analytics overview for dashboard"""
    db: Session = database.SessionLocal()
    try:
        now = datetime.now()
        today = date.today()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        
        # === SESSIONS STATS ===
        total_sessions = db.query(models.SessionResult).count()
        sessions_today = db.query(models.SessionResult).filter(
            func.date(models.SessionResult.date) == today
        ).count()
        sessions_this_week = db.query(models.SessionResult).filter(
            func.date(models.SessionResult.date) >= week_ago
        ).count()
        sessions_this_month = db.query(models.SessionResult).filter(
            func.date(models.SessionResult.date) >= month_ago
        ).count()
        
        # === DRIVERS STATS ===
        total_drivers = db.query(models.Driver).count()
        active_drivers_week = db.query(models.SessionResult.driver_name).filter(
            func.date(models.SessionResult.date) >= week_ago
        ).distinct().count()
        
        # === TOP DRIVERS (by sessions this month) ===
        top_drivers = db.query(
            models.SessionResult.driver_name,
            func.count(models.SessionResult.id).label('sessions'),
            func.min(models.SessionResult.best_lap).label('best_lap')
        ).filter(
            func.date(models.SessionResult.date) >= month_ago
        ).group_by(models.SessionResult.driver_name).order_by(
            desc('sessions')
        ).limit(5).all()
        
        # === POPULAR TRACKS ===
        popular_tracks = db.query(
            models.SessionResult.track_name,
            func.count(models.SessionResult.id).label('sessions')
        ).filter(
            func.date(models.SessionResult.date) >= month_ago
        ).group_by(models.SessionResult.track_name).order_by(
            desc('sessions')
        ).limit(5).all()
        
        # === POPULAR CARS ===
        popular_cars = db.query(
            models.SessionResult.car_model,
            func.count(models.SessionResult.id).label('sessions')
        ).filter(
            func.date(models.SessionResult.date) >= month_ago
        ).group_by(models.SessionResult.car_model).order_by(
            desc('sessions')
        ).limit(5).all()
        
        # === SESSIONS PER DAY (last 14 days) ===
        sessions_per_day = []
        for i in range(13, -1, -1):
            day = today - timedelta(days=i)
            count = db.query(models.SessionResult).filter(
                func.date(models.SessionResult.date) == day
            ).count()
            sessions_per_day.append({
                "date": day.isoformat(),
                "day": day.strftime("%a"),
                "sessions": count
            })
        
        # === BOOKINGS STATS ===
        try:
            total_bookings = db.query(models.Booking).count()
            pending_bookings = db.query(models.Booking).filter(
                models.Booking.status == "pending"
            ).count()
            confirmed_bookings = db.query(models.Booking).filter(
                models.Booking.status == "confirmed"
            ).count()
            bookings_today = db.query(models.Booking).filter(
                func.date(models.Booking.date) == today,
                models.Booking.status.in_(["pending", "confirmed"])
            ).count()
        except:
            total_bookings = 0
            pending_bookings = 0
            confirmed_bookings = 0
            bookings_today = 0
        
        # === LOYALTY STATS ===
        try:
            total_points_issued = db.query(func.sum(models.PointsTransaction.points)).filter(
                models.PointsTransaction.points > 0
            ).scalar() or 0
            total_points_redeemed = abs(db.query(func.sum(models.PointsTransaction.points)).filter(
                models.PointsTransaction.points < 0
            ).scalar() or 0)
            
            # Tier distribution
            tier_distribution = {}
            for tier in ["bronze", "silver", "gold", "platinum"]:
                count = db.query(models.Driver).filter(
                    models.Driver.membership_tier == tier
                ).count()
                tier_distribution[tier] = count
        except:
            total_points_issued = 0
            total_points_redeemed = 0
            tier_distribution = {"bronze": 0, "silver": 0, "gold": 0, "platinum": 0}
        
        # === PEAK HOURS ===
        peak_hours = []
        try:
            for hour in range(10, 23):
                slot = f"{hour:02d}:00"
                count = db.query(models.Booking).filter(
                    models.Booking.time_slot.like(f"{slot}%")
                ).count()
                peak_hours.append({"hour": slot, "bookings": count})
        except:
            pass
        
        return {
            "summary": {
                "total_sessions": total_sessions,
                "sessions_today": sessions_today,
                "sessions_this_week": sessions_this_week,
                "sessions_this_month": sessions_this_month,
                "total_drivers": total_drivers,
                "active_drivers_week": active_drivers_week,
            },
            "bookings": {
                "total": total_bookings,
                "pending": pending_bookings,
                "confirmed": confirmed_bookings,
                "today": bookings_today
            },
            "loyalty": {
                "total_points_issued": total_points_issued,
                "total_points_redeemed": total_points_redeemed,
                "tier_distribution": tier_distribution
            },
            "top_drivers": [
                {
                    "name": d[0],
                    "sessions": d[1],
                    "best_lap": d[2]
                }
                for d in top_drivers
            ],
            "popular_tracks": [
                {"name": (t[0] or "Unknown").replace("_", " "), "sessions": t[1]}
                for t in popular_tracks
            ],
            "popular_cars": [
                {"name": (c[0] or "Unknown").replace("_", " "), "sessions": c[1]}
                for c in popular_cars
            ],
            "sessions_per_day": sessions_per_day,
            "peak_hours": peak_hours,
            "generated_at": now.isoformat()
        }
    finally:
        db.close()


@router.get("/revenue-estimate")
async def get_revenue_estimate(price_per_hour: float = 25.0):
    """Estimate revenue based on completed sessions and bookings"""
    db: Session = database.SessionLocal()
    try:
        today = date.today()
        month_ago = today - timedelta(days=30)
        
        # Completed bookings this month
        try:
            completed_bookings = db.query(models.Booking).filter(
                func.date(models.Booking.date) >= month_ago,
                models.Booking.status == "completed"
            ).all()
            
            booking_revenue = sum(
                (b.duration_minutes / 60) * price_per_hour * (b.num_players or 1)
                for b in completed_bookings
            )
            booking_hours = sum(b.duration_minutes / 60 for b in completed_bookings)
        except:
            booking_revenue = 0
            booking_hours = 0
        
        return {
            "period": "last_30_days",
            "price_per_hour": price_per_hour,
            "estimated_revenue": round(booking_revenue, 2),
            "total_hours_booked": round(booking_hours, 1),
            "completed_bookings": len(completed_bookings) if 'completed_bookings' in dir() else 0
        }
    finally:
        db.close()
