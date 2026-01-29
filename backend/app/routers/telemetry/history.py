# Telemetry History Module
# Handles leaderboards, driver lists, sessions, and statistics

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, defer
from sqlalchemy import func, asc, desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import random
import math

from ... import models, schemas, database
from ..auth import require_admin
from .base import DEFAULT_LAP_LENGTH_KM, calculate_consistency_score, logger

router = APIRouter(tags=["telemetry-history"])


@router.get("/leaderboard", response_model=List[schemas.LeaderboardEntry])
def get_leaderboard(
    track_name: Optional[str] = None, 
    car_model: Optional[str] = None, 
    period: Optional[str] = "all",
    limit: int = 20, 
    db: Session = Depends(database.get_db)
):
    """Get Global Leaderboard for a track. Logic: Best lap per driver."""
    filters = [models.LapTime.valid == True]

    if track_name and track_name != "all":
        filters.append(func.lower(models.SessionResult.track_name) == track_name.lower())
    
    today = datetime.now(timezone.utc).date()
    
    if period == "today":
        filters.append(models.SessionResult.date >= datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc))
    elif period == "week":
        start_date = datetime.now(timezone.utc) - timedelta(days=7)
        filters.append(models.SessionResult.date >= start_date)
    elif period == "month":
        start_date = datetime.now(timezone.utc) - timedelta(days=30)
        filters.append(models.SessionResult.date >= start_date)

    if car_model:
        filters.append(func.lower(models.SessionResult.car_model) == car_model.lower())

    subquery = db.query(
        models.SessionResult.driver_name,
        func.min(models.LapTime.time).label('best_time')
    ).join(models.SessionResult, models.LapTime.session_id == models.SessionResult.id).\
    filter(*filters).group_by(models.SessionResult.driver_name).subquery()

    query = db.query(
        models.LapTime,
        models.SessionResult
    ).join(
        models.SessionResult, 
        models.LapTime.session_id == models.SessionResult.id
    ).join(
        subquery,
        (models.SessionResult.driver_name == subquery.c.driver_name) & 
        (models.LapTime.time == subquery.c.best_time)
    ).filter(*filters)
    
    query = query.order_by(asc(models.LapTime.time))
    query = query.limit(limit)
    
    results = query.all()
    
    leaderboard = []
    
    if not results:
        return []

    best_overall = results[0][0].time

    for idx, (lap, session) in enumerate(results):
        leaderboard.append(schemas.LeaderboardEntry(
            rank=idx + 1,
            lap_id=lap.id,
            driver_name=session.driver_name,
            car_model=session.car_model,
            track_name=session.track_name,
            lap_time=lap.time,
            timestamp=session.date,
            gap=lap.time - best_overall if idx > 0 else 0
        ))
        
    return leaderboard


@router.get("/combinations", response_model=List[dict])
def get_active_combinations(db: Session = Depends(database.get_db)):
    """Returns unique Active Tracks that have at least one valid lap."""
    results = db.query(
        models.SessionResult.track_name,
        models.SessionResult.car_model
    ).join(models.LapTime, models.SessionResult.id == models.LapTime.session_id).\
    filter(models.LapTime.valid == True).distinct().all()
    
    return [{"track_name": row.track_name, "car_model": row.car_model} for row in results]


@router.get("/driver/{driver_name}/history")
def get_driver_history(driver_name: str, db: Session = Depends(database.get_db)):
    """Get all laps for a driver. Optimized: Defers loading of heavy telemetry_data column."""
    sessions = db.query(models.SessionResult).filter(models.SessionResult.driver_name == driver_name).all()
    session_ids = [s.id for s in sessions]
    
    if not session_ids:
        return []
        
    laps = db.query(models.LapTime)\
        .filter(models.LapTime.session_id.in_(session_ids))\
        .options(defer(models.LapTime.telemetry_data))\
        .order_by(models.LapTime.id.desc())\
        .limit(100)\
        .all()
        
    return laps


@router.get("/drivers", response_model=List[schemas.DriverSummary])
def get_all_drivers(db: Session = Depends(database.get_db)):
    """Get a list of all drivers with summary statistics."""
    drivers = db.query(models.SessionResult.driver_name).distinct().all()
    driver_names = [d[0] for d in drivers]
    
    summaries = []
    
    for name in driver_names:
        total_laps = db.query(models.LapTime).join(models.SessionResult).filter(models.SessionResult.driver_name == name).count()
        
        fav_car_row = db.query(
            models.SessionResult.car_model, 
            func.count(models.LapTime.id).label('count')
        ).join(models.LapTime).filter(models.SessionResult.driver_name == name).group_by(models.SessionResult.car_model).order_by(desc('count')).first()
        favorite_car = fav_car_row[0] if fav_car_row else "Unknown"
        
        last_lap = db.query(models.SessionResult.date).filter(models.SessionResult.driver_name == name).order_by(desc(models.SessionResult.date)).first()
        last_seen = last_lap[0] if last_lap else datetime.now(timezone.utc)
        
        if total_laps > 500: rank = "Alien"
        elif total_laps > 100: rank = "Pro"
        elif total_laps > 20: rank = "Amateur"
        else: rank = "Rookie"
        
        summaries.append(schemas.DriverSummary(
            driver_name=name,
            total_laps=total_laps,
            favorite_car=favorite_car,
            last_seen=last_seen,
            rank_tier=rank
        ))
        
    summaries.sort(key=lambda x: x.total_laps, reverse=True)
    
    return summaries


@router.get("/sessions", response_model=List[schemas.SessionResult])
def get_recent_sessions(
    track_name: Optional[str] = None,
    driver_name: Optional[str] = None,
    car_model: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(database.get_db)
):
    query = db.query(models.SessionResult)
    if track_name:
        query = query.filter(models.SessionResult.track_name.ilike(f"%{track_name}%"))
    if driver_name:
        query = query.filter(models.SessionResult.driver_name.ilike(f"%{driver_name}%"))
    if car_model:
        query = query.filter(models.SessionResult.car_model.ilike(f"%{car_model}%"))
    
    sessions = query.order_by(desc(models.SessionResult.date)).limit(limit).all()
    
    results = []
    for s in sessions:
        best_lap_obj = db.query(models.LapTime).filter(
            models.LapTime.session_id == s.id,
            models.LapTime.valid == True
        ).order_by(asc(models.LapTime.time)).first()
        
        session_data = schemas.SessionResult.from_orm(s)
        session_data.best_lap_id = best_lap_obj.id if best_lap_obj else None
        results.append(session_data)
        
    return results


@router.get("/stats", response_model=schemas.LeaderboardStats)
def get_teleboard_stats(db: Session = Depends(database.get_db)):
    """Get Global Stats for the news ticker."""
    total_sessions = db.query(models.SessionResult).count()
    
    most_popular_track = db.query(
        models.SessionResult.track_name, 
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).group_by(models.SessionResult.track_name).order_by(func.count(models.LapTime.id).desc()).first()

    most_popular_car = db.query(
        models.SessionResult.car_model, 
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).group_by(models.SessionResult.car_model).order_by(func.count(models.LapTime.id).desc()).first()

    top_driver = db.query(
        models.SessionResult.driver_name,
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).group_by(models.SessionResult.driver_name).order_by(func.count(models.LapTime.id).desc()).first()

    latest = db.query(models.LapTime).join(models.SessionResult).order_by(models.SessionResult.date.desc()).first()

    return schemas.LeaderboardStats(
        top_driver=top_driver[0] if top_driver else "N/A",
        most_popular_track=most_popular_track[0] if most_popular_track else "N/A",
        most_popular_car=most_popular_car[0] if most_popular_car else "N/A",
        total_sessions=total_sessions,
        latest_record=f"{latest.session.driver_name} ({latest.session.track_name})" if latest else "Sin datos"
    )


@router.get("/active-combinations")
def get_active_tracks(db: Session = Depends(database.get_db)):
    """Returns a list of unique tracks that have lap times in the database."""
    try:
        results = db.query(models.SessionResult.track_name).distinct().filter(
            models.SessionResult.track_name.isnot(None)
        ).all()
        
        tracks = sorted([r[0] for r in results if r[0]])
        
        return [{"track": t} for t in tracks]
    except Exception as e:
        logger.error(f"Error getting active combinations: {e}")
        return []


@router.post("/seed", dependencies=[Depends(require_admin)])
def seed_data(
    count: int = 50, 
    db: Session = Depends(database.get_db)
):
    import os
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=404, detail="Not found")

    drivers = ["Carlos Sainz", "Fernando Alonso", "Max Verstappen", "L. Hamilton", "Charles Leclerc", "Lando Norris", "Pedro G.", "Javi Racer", "SimDriver 01"]
    cars = ["ferrari_sf24", "redbull_rb20", "mclaren_mcl38", "porsche_911_gt3", "bmw_m4_gt3"]
    tracks = ["monza", "spa", "imola", "nurburgring", "silverstone"]
    
    for _ in range(count // 5):
        track = random.choice(tracks)
        car = random.choice(cars)
        driver = random.choice(drivers)
        base_lap_time = 100000 + random.randint(0, 20000)
        session_date = datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30))
        
        new_session = models.SessionResult(
            station_id=1,
            track_name=track,
            car_model=car,
            driver_name=driver,
            session_type="practice",
            date=session_date,
            best_lap=base_lap_time
        )
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        
        best_of_session = base_lap_time
        for i in range(5):
            lap_time = base_lap_time + random.randint(-500, 1000)
            if lap_time < best_of_session:
                best_of_session = lap_time
            
            s1 = lap_time // 3 + random.randint(-200, 200)
            s2 = lap_time // 3 + random.randint(-200, 200)
            s3 = lap_time - s1 - s2
            
            telemetry_trace = []
            num_points = 200
            for step in range(num_points):
                progress = step / num_points
                base_speed = 150
                corner_factor = math.sin(progress * math.pi * 4) * 80
                noise = random.randint(-5, 5)
                speed = max(50, min(350, base_speed + corner_factor + noise))
                rpm = int(3000 + (speed / 350) * 5000)
                gear = int(1 + (speed / 60))
                angle = progress * math.pi * 2
                radius = 100
                x = math.cos(angle) * radius
                z = math.sin(angle) * radius
                rotation = angle + math.pi / 2
                
                telemetry_trace.append({
                    "t": int((lap_time / num_points) * step),
                    "s": int(speed),
                    "r": rpm,
                    "g": min(8, gear),
                    "n": round(progress, 3),
                    "x": round(x, 2),
                    "y": 0,
                    "z": round(z, 2),
                    "rot": round(rotation, 2)
                })
            
            new_lap = models.LapTime(
                session_id=new_session.id,
                lap_number=i + 1,
                time=lap_time,
                splits=[s1, s2, s3],
                telemetry_data=telemetry_trace,
                valid=random.random() > 0.1,
            )
            db.add(new_lap)
        
        new_session.best_lap = best_of_session
        
    db.commit()
    return {"message": f"Seeded {count} random laps with sectors across sessions"}
