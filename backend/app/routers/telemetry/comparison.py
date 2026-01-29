# Telemetry Comparison Module
# Handles driver comparisons, details, and pilot profiles

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, asc, desc
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone
import math

from ... import models, schemas, database
from .base import (
    DEFAULT_LAP_LENGTH_KM, 
    calculate_consistency_score, 
    _coerce_splits, 
    _coerce_json_value,
    logger
)

router = APIRouter(tags=["telemetry-comparison"])


@router.get("/details/{track_name}/{driver_name}", response_model=schemas.DriverDetails)
def get_driver_details(
    track_name: str,
    driver_name: str,
    car_model: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    """Get deep analytics for a specific driver and track."""
    filters = [
        models.SessionResult.track_name == track_name,
        models.SessionResult.driver_name == driver_name
    ]
    if car_model:
        filters.append(models.SessionResult.car_model == car_model)

    laps = db.query(models.LapTime).join(models.SessionResult).filter(*filters).order_by(desc(models.SessionResult.date)).all()
    
    if not laps:
        raise HTTPException(status_code=404, detail="Driver telemetry not found")

    valid_laps = [l for l in laps if l.valid]
    best_lap_obj = min(valid_laps, key=lambda x: x.time) if valid_laps else min(laps, key=lambda x: x.time)
    
    try:
        best_sectors = _coerce_splits(best_lap_obj.splits)
    except:
        best_sectors = []

    all_sectors = []
    for l in valid_laps:
        try:
            if l.splits:
                s = _coerce_splits(l.splits)
                if s:
                    if not all_sectors:
                        all_sectors = [[] for _ in range(len(s))]
                    for i, val in enumerate(s):
                        if i < len(all_sectors):
                            all_sectors[i].append(val)
        except:
            continue
    
    optimal_lap = sum([min(s) for s in all_sectors if s]) if all_sectors else best_lap_obj.time
    times = [l.time for l in valid_laps]
    consistency_score = calculate_consistency_score(times)
    lap_history = [l.time for l in valid_laps[:10]][::-1]

    return schemas.DriverDetails(
        driver_name=driver_name,
        track_name=track_name,
        car_model=best_lap_obj.session.car_model,
        best_lap=best_lap_obj.time,
        best_sectors=best_sectors,
        optimal_lap=optimal_lap,
        consistency_score=round(consistency_score, 1),
        lap_history=lap_history,
        total_laps=len(laps),
        invalid_laps=len(laps) - len(valid_laps)
    )


@router.get("/pilot/{driver_name}", response_model=schemas.PilotProfile)
def get_pilot_profile(driver_name: str, db: Session = Depends(database.get_db)):
    """Get global profile for a driver across all tracks and sessions. The 'Racing Passport'."""
    total_laps = db.query(models.LapTime).join(models.SessionResult).filter(models.SessionResult.driver_name == driver_name).count()
    if total_laps == 0:
        raise HTTPException(status_code=404, detail="Pilot profile not found")

    fav_car_row = db.query(
        models.SessionResult.car_model, 
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).filter(models.SessionResult.driver_name == driver_name).group_by(models.SessionResult.car_model).order_by(desc('count')).first()
    favorite_car = fav_car_row[0] if fav_car_row else "Unknown"

    subq = db.query(
        models.SessionResult.track_name,
        func.min(models.LapTime.time).label('best_time')
    ).join(models.LapTime).filter(
        models.SessionResult.driver_name == driver_name,
        models.LapTime.valid == True
    ).group_by(models.SessionResult.track_name).subquery()

    records_query = db.query(models.LapTime, models.SessionResult).join(
        models.SessionResult
    ).join(
        subq,
        (models.SessionResult.track_name == subq.c.track_name) &
        (models.LapTime.time == subq.c.best_time)
    ).filter(models.SessionResult.driver_name == driver_name)

    track_records = []
    for lap, session in records_query.all():
        track_records.append(schemas.TrackRecord(
            track_name=session.track_name,
            best_lap=lap.time,
            car_model=session.car_model,
            date=session.date
        ))

    recent_laps = db.query(models.LapTime.time).join(models.SessionResult).filter(
        models.SessionResult.driver_name == driver_name,
        models.LapTime.valid == True
    ).order_by(desc(models.SessionResult.date)).limit(50).all()
    
    avg_consistency = 100.0
    if len(recent_laps) > 1:
        times = [l[0] for l in recent_laps]
        avg = sum(times) / len(times)
        variance = sum((t - avg)**2 for t in times) / len(times)
        std_dev = math.sqrt(variance)
        avg_consistency = max(0, min(100, 100 - (std_dev / 100)))

    total_km = total_laps * DEFAULT_LAP_LENGTH_KM

    dates_query = db.query(models.SessionResult.date).filter(models.SessionResult.driver_name == driver_name).all()
    active_days = len(set([d[0].date() for d in dates_query]))

    recent_sessions_db = db.query(
        models.SessionResult,
        func.count(models.LapTime.id).label('laps_count')
    ).outerjoin(
        models.LapTime, 
        models.LapTime.session_id == models.SessionResult.id
    ).filter(
        models.SessionResult.driver_name == driver_name
    ).group_by(
        models.SessionResult.id
    ).order_by(
        desc(models.SessionResult.date)
    ).limit(10).all()

    recent_sessions = []
    for s, laps_count in recent_sessions_db:
        best_lap_obj = db.query(models.LapTime).filter(
            models.LapTime.session_id == s.id,
            models.LapTime.valid == True
        ).order_by(asc(models.LapTime.time)).first()

        recent_sessions.append(schemas.SessionSummary(
            session_id=s.id,
            track_name=s.track_name,
            car_model=s.car_model,
            date=s.date,
            best_lap=s.best_lap,
            best_lap_id=best_lap_obj.id if best_lap_obj else None,
            laps_count=laps_count or 0
        ))

    driver_obj = db.query(models.Driver).filter(models.Driver.name == driver_name).first()
    
    if not driver_obj:
        driver_obj = models.Driver(name=driver_name, elo_rating=1200.0)
        db.add(driver_obj)
        db.commit()
        db.refresh(driver_obj)

    photo_url = None
    if driver_obj.photo_path:
        photo_url = f"/static/drivers/{Path(driver_obj.photo_path).name}"

    xp_points = total_laps * 10 + (driver_obj.total_wins * 100)
    level = int(1 + (xp_points / 500))
    badges = []
    if driver_obj.total_wins > 0:
        badges.append({"id": "winner", "label": "Ganador", "icon": "🏆", "desc": "Ha ganado al menos una carrera"})
    if total_laps > 100:
        badges.append({"id": "veteran", "label": "Veterano", "icon": "🎖️", "desc": "Más de 100 vueltas completadas"})

    return schemas.PilotProfile(
        driver_name=driver_name,
        total_laps=total_laps,
        total_km=round(total_km, 1),
        favorite_car=favorite_car,
        avg_consistency=round(avg_consistency, 1),
        active_days=active_days,
        records=track_records,
        recent_sessions=recent_sessions,
        total_wins=driver_obj.total_wins,
        total_podiums=driver_obj.total_podiums,
        elo_rating=driver_obj.elo_rating,
        photo_url=photo_url,
        phone=driver_obj.phone,
        driver_id=driver_obj.id,
        badges=badges,
        xp_points=xp_points,
        level=level
    )


@router.get("/compare/{driver1}/{driver2}", response_model=schemas.DriverComparison)
def get_driver_comparison(
    driver1: str, 
    driver2: str, 
    track: str, 
    car: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    try:
        def get_stats(driver):
            filters = [
                func.lower(models.SessionResult.driver_name) == driver.lower(),
                func.lower(models.SessionResult.track_name) == track.lower()
            ]
            if car:
                filters.append(func.lower(models.SessionResult.car_model) == car.lower())
                
            laps = db.query(models.LapTime).join(models.SessionResult).filter(*filters).all()
            
            if not laps:
                return None
                
            valid_laps_times = [l.time for l in laps if l.time is not None and l.time < 999999999]
            if not valid_laps_times:
                return None

            best = min(valid_laps_times)
            avg = sum(valid_laps_times) / len(valid_laps_times)
            consistency = avg - best 
            actual_name = laps[0].session.driver_name if laps else driver

            return {
                "driver_name": actual_name,
                "best_lap": best,
                "total_laps": len(laps),
                "consistency": round(consistency, 1)
            }

        stats1 = get_stats(driver1)
        stats2 = get_stats(driver2)

        if not stats1 or not stats2:
            raise HTTPException(status_code=404, detail=f"Data incomplete for comparison. {driver1}: {'Found' if stats1 else 'Missing'}, {driver2}: {'Found' if stats2 else 'Missing'}")

        s1_wins = 0
        s2_wins = 0

        if stats1["best_lap"] < stats2["best_lap"]: s1_wins += 1
        else: s2_wins += 1

        if stats1["consistency"] < stats2["consistency"]: s1_wins += 1
        else: s2_wins += 1
        
        if stats1["total_laps"] > stats2["total_laps"]: s1_wins += 1
        else: s2_wins += 1

        return schemas.DriverComparison(
            track_name=track,
            car_model=car,
            driver_1=schemas.ComparisonStats(**stats1, win_count=s1_wins),
            driver_2=schemas.ComparisonStats(**stats2, win_count=s2_wins),
            time_gap=abs(stats1["best_lap"] - stats2["best_lap"])
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR in compare: {e}")
        raise HTTPException(status_code=500, detail=f"Comparison Error: {str(e)}")


@router.post("/compare-multi", response_model=schemas.MultiDriverComparisonResponse)
def compare_multi_drivers(
    payload: schemas.MultiDriverComparisonRequest,
    db: Session = Depends(database.get_db)
):
    try:
        drivers_stats = []
        
        def get_stats(driver_name):
            filters = [
                func.lower(models.SessionResult.driver_name) == driver_name.lower(),
                func.lower(models.SessionResult.track_name) == payload.track.lower()
            ]
            if payload.car:
                filters.append(func.lower(models.SessionResult.car_model) == payload.car.lower())
                
            laps = db.query(models.LapTime).join(models.SessionResult).filter(*filters).all()
            
            if not laps:
                return None
                
            valid_laps_times = [l.time for l in laps if l.time is not None and l.time < 999999999]
            if not valid_laps_times:
                return None

            best = min(valid_laps_times)
            avg = sum(valid_laps_times) / len(valid_laps_times)
            consistency = avg - best 
            actual_name = laps[0].session.driver_name if laps else driver_name

            return {
                "driver_name": actual_name,
                "best_lap": best,
                "total_laps": len(laps),
                "consistency": round(consistency, 1),
                "win_count": 0
            }

        for driver in payload.drivers:
            stats = get_stats(driver)
            if stats:
                drivers_stats.append(schemas.ComparisonStats(**stats))
            else:
                drivers_stats.append(schemas.ComparisonStats(
                    driver_name=driver,
                    best_lap=0,
                    total_laps=0,
                    consistency=0.0,
                    win_count=0
                ))
        
        if len(drivers_stats) < 1:
            raise HTTPException(status_code=404, detail="No valid drivers selected")

        drivers_stats.sort(key=lambda x: x.best_lap if x.best_lap > 0 else 999999999)

        active_drivers = [d for d in drivers_stats if d.total_laps > 0]
        
        if active_drivers:
            active_drivers[0].win_count += 1
            best_consistency = min(active_drivers, key=lambda x: x.consistency)
            best_consistency.win_count += 1
            most_laps = max(active_drivers, key=lambda x: x.total_laps)
            most_laps.win_count += 1

        return schemas.MultiDriverComparisonResponse(
            track_name=payload.track,
            car_model=payload.car,
            drivers=drivers_stats
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ERROR in compare-multi: {e}")
        raise HTTPException(status_code=500, detail=str(e))
