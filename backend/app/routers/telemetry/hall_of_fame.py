# Telemetry Hall of Fame Module
# Handles hall of fame and category-based records

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, asc
from typing import List

from ... import models, schemas, database
from .base import _classify_car_category

router = APIRouter(tags=["telemetry-hall-of-fame"])


@router.get("/hall_of_fame", response_model=List[schemas.HallOfFameCategory])
def get_hall_of_fame(db: Session = Depends(database.get_db)):
    """Get hall of fame with top records per track/car combination."""
    combinations = db.query(
        models.SessionResult.track_name, 
        models.SessionResult.car_model
    ).join(models.LapTime).distinct().all()

    hall_of_fame = []

    for track, car in combinations:
        top_laps = db.query(models.LapTime).join(models.SessionResult).filter(
            models.SessionResult.track_name == track,
            models.SessionResult.car_model == car
        ).order_by(asc(models.LapTime.time)).limit(3).all()

        records = [
            schemas.HallOfFameEntry(
                driver_name=lap.session.driver_name,
                lap_time=lap.time,
                date=lap.session.date
            ) for lap in top_laps
        ]

        if records:
            hall_of_fame.append(schemas.HallOfFameCategory(
                track_name=track,
                car_model=car,
                records=records
            ))
    
    return hall_of_fame


@router.get("/hall_of_fame/categories", response_model=List[schemas.HallOfFameCategory])
def get_hall_of_fame_categories(db: Session = Depends(database.get_db)):
    """
    Aggregated Hall of Fame for TV Mode.
    Groups records by Track + Category (instead of specific Car Model).
    """
    subq = db.query(
        models.SessionResult.track_name,
        models.SessionResult.car_model,
        models.SessionResult.driver_name,
        func.min(models.LapTime.time).label('best_lap'),
        func.max(models.SessionResult.date).label('latest_date')
    ).join(models.LapTime).filter(
        models.LapTime.valid == True
    ).group_by(
        models.SessionResult.track_name,
        models.SessionResult.car_model,
        models.SessionResult.driver_name
    ).all()
    
    grouped_data = {}
    
    for row in subq:
        track = row.track_name
        car = row.car_model
        driver = row.driver_name
        time = row.best_lap
        date = row.latest_date
        
        category = _classify_car_category(car)
        key = (track, category)
        
        if key not in grouped_data:
            grouped_data[key] = []
            
        grouped_data[key].append({
            "driver_name": driver,
            "lap_time": time,
            "date": date,
            "precise_car": car
        })
        
    final_output = []
    
    for key, records in grouped_data.items():
        track, category = key
        
        records.sort(key=lambda x: x["lap_time"])
        top_records = records[:5]
        
        schema_records = [
            schemas.HallOfFameEntry(
                driver_name=r["driver_name"],
                lap_time=r["lap_time"],
                date=r["date"]
            ) for r in top_records
        ]
        
        final_output.append(schemas.HallOfFameCategory(
            track_name=track,
            car_model=category,
            records=schema_records
        ))
        
    final_output.sort(key=lambda x: (x.track_name, x.car_model))
    
    return final_output
