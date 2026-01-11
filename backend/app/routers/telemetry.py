from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, asc, desc
from typing import List, Optional
from .. import models, schemas, database
from datetime import datetime
import os
import json
import math

router = APIRouter(
    prefix="/telemetry",
    tags=["telemetry"]
)

@router.post("/session", status_code=201)
def upload_session_result(
    session_data: schemas.SessionResultCreate, 
    db: Session = Depends(database.get_db)
):
    # 1. Create Session Record
    new_session = models.SessionResult(
        station_id=session_data.station_id,
        track_name=session_data.track_name,
        track_config=session_data.track_config,
        car_model=session_data.car_model,
        driver_name=session_data.driver_name,
        session_type=session_data.session_type,
        date=session_data.date,
        best_lap=session_data.best_lap
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    # 2. Process Laps
    for lap in session_data.laps:
        if not lap.is_valid:
            continue # We only store valid laps for leaderboards to save space? Or store all?
            # Storing only valid ones for V1 efficiency.
            
        new_lap = models.LapTime(
            session_id=new_session.id,
            driver_name=lap.driver_name,
            car_model=lap.car_model,
            track_name=lap.track_name,
            lap_time=lap.lap_time,
            sectors=str(lap.sectors), # Store list as string
            telemetry_data=lap.telemetry_data,
            is_valid=lap.is_valid,
            timestamp=lap.timestamp
        )
        db.add(new_lap)
    
    db.commit()
    return {"status": "ok", "session_id": new_session.id}

@router.get("/leaderboard", response_model=List[schemas.LeaderboardEntry])
def get_leaderboard(
    track_name: Optional[str] = None, 
    car_model: Optional[str] = None, 
    period: Optional[str] = "all", # all, today, week, month
    limit: int = 20, 
    db: Session = Depends(database.get_db)
):
    """
    Get Global Leaderboard for a track.
    Logic: Best lap per driver.
    """
    # 1. Base Filter Conditions
    filters = [
        models.LapTime.is_valid == True
    ]

    if track_name and track_name != "all":
        filters.append(func.lower(models.LapTime.track_name) == track_name.lower())
    
    today = datetime.now().date()
    from datetime import timedelta
    
    if period == "today":
        filters.append(models.LapTime.timestamp >= datetime.combine(today, datetime.min.time()))
    elif period == "week":
        start_date = datetime.now() - timedelta(days=7)
        filters.append(models.LapTime.timestamp >= start_date)
    elif period == "month":
        start_date = datetime.now() - timedelta(days=30)
        filters.append(models.LapTime.timestamp >= start_date)

    if car_model:
        filters.append(func.lower(models.LapTime.car_model) == car_model.lower())

    # 2. Subquery: Find the BEST Time (MIN lap_time) for each driver
    subquery = db.query(
        models.LapTime.driver_name,
        func.min(models.LapTime.lap_time).label('best_time')
    ).filter(*filters).group_by(models.LapTime.driver_name).subquery()

    # 3. Main Query: Join back to get the FULL row (Correct Car, Date, etc.)
    # We join on Driver Name AND the Best Time.
    query = db.query(
        models.LapTime
    ).join(
        subquery,
        (models.LapTime.driver_name == subquery.c.driver_name) & 
        (models.LapTime.lap_time == subquery.c.best_time)
    ).filter(*filters)
    
    # Order by Best Time ASC (Fastest on top)
    query = query.order_by(asc(models.LapTime.lap_time))
    query = query.limit(limit)
    
    results = query.all()
    
    leaderboard = []
    
    if not results:
        return []

    best_overall = results[0].lap_time

    for idx, row in enumerate(results):
        leaderboard.append(schemas.LeaderboardEntry(
            rank=idx + 1,
            lap_id=row.id,
            driver_name=row.driver_name,
            car_model=row.car_model,
            track_name=row.track_name,
            lap_time=row.lap_time,
            timestamp=row.timestamp,
            gap=row.lap_time - best_overall if idx > 0 else 0
        ))
        
    return leaderboard

@router.get("/combinations", response_model=List[dict])
def get_active_combinations(db: Session = Depends(database.get_db)):
    """
    Returns unique Active Tracks that have at least one valid lap.
    Used for Auto-Rotation on TV (Track Rotation Only).
    """
    results = db.query(
        models.LapTime.track_name,
        models.LapTime.car_model
    ).filter(
        models.LapTime.is_valid == True
    ).distinct().all()
    
    return [{"track_name": row.track_name, "car_model": row.car_model} for row in results]

@router.get("/lap/{lap_id}/telemetry")
def get_lap_telemetry(lap_id: int, db: Session = Depends(database.get_db)):
    """
    Get the heavy JSON telemetry trace for a specific lap.
    """
    lap = db.query(models.LapTime).filter(models.LapTime.id == lap_id).first()
    if not lap:
        raise HTTPException(status_code=404, detail="Lap not found")

    if not lap.telemetry_data:
        # Fallback: Generate Mock Telemetry with specific track shapes
        telemetry_trace = []
        num_points = 400 # Higher resolution
        
        # Track Layout Definitions (Simplified)
        # Type: 'straight' (length) or 'turn' (angle_deg, radius)
        # Monza-ish
        monza_layout = [
            ('straight', 800), ('turn', 45, 100), ('turn', -45, 100), # Chicane
            ('turn', 90, 300), # Grande
            ('straight', 400),
            ('turn', 90, 150), ('straight', 100), ('turn', 60, 150), # Lesmos
            ('straight', 600),
            ('turn', -60, 150), ('turn', 60, 150), # Ascari
            ('straight', 800),
            ('turn', 180, 250), # Parabolica
            ('straight', 200) # Finish
        ]
        
        track_map = {
            'monza': monza_layout,
            # Add generic loop for others for now, maybe Spa later
        }
        
        # Select layout logic
        layout = []
        t_name = lap.track_name.lower()
        if 'monza' in t_name: layout = monza_layout
        else: 
            # Default "Figure 8" / Bean
            layout = [
                 ('straight', 200),
                 ('turn', 180, 200),
                 ('straight', 400),
                 ('turn', 180, 200),
                 ('straight', 200)
            ]

        # Generate Points from Layout
        points = []
        import math
        x, z, rot = 0, 0, 0
        total_dist = 0
        
        # 1. First pass: Calculate total distance to normalize time
        # And generate raw path points
        path_points = []
        
        for segment in layout:
            type = segment[0]
            if type == 'straight':
                dist = segment[1]
                steps = int(dist / 10) # 1 point every 10m
                for _ in range(steps):
                    x += math.sin(rot) * 10 
                    z += math.cos(rot) * 10
                    path_points.append({'x': x, 'z': z, 'rot': rot, 'type': 'straight'})
                    total_dist += 10
            elif type == 'turn':
                angle_deg = segment[1]
                radius = segment[2]
                match_dist = abs(math.radians(angle_deg) * radius)
                steps = int(match_dist / 10)
                
                angle_step = math.radians(angle_deg) / steps
                for _ in range(steps):
                    rot += angle_step
                    x += math.sin(rot) * 10
                    z += math.cos(rot) * 10
                    path_points.append({'x': x, 'z': z, 'rot': rot, 'type': 'turn'})
                    total_dist += 10
                    
        # 2. Resample to num_points and add speed profile
        real_lap_time = lap.lap_time if lap.lap_time else 100000
        
        path_len = len(path_points)
        for i in range(num_points):
            idx = int((i / num_points) * path_len)
            p = path_points[min(idx, path_len-1)]
            
            # Speed logic: Straight = Fast, Turn = Slow
            base_speed = 280 if p['type'] == 'straight' else 120
            noise = (i % 10) - 5
            speed = base_speed + noise
            
            rpm = int(3000 + (speed/300)*5000)
            gear = int(1 + (speed/50))
            
            telemetry_trace.append({
                "t": int((real_lap_time / num_points) * i),
                "s": int(speed),
                "r": rpm,
                "g": min(8, gear),
                "n": round(i / num_points, 3),
                "x": round(p['x'], 2),
                "y": 0,
                "z": round(p['z'], 2),
                "rot": round(p['rot'], 2)
            })
            
        return telemetry_trace
    
    return json.loads(lap.telemetry_data)

@router.get("/details/{track_name}/{driver_name}", response_model=schemas.DriverDetails)
def get_driver_details(
    track_name: str,
    driver_name: str,
    car_model: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    """
    Get deep analytics for a specific driver and track.
    Includes sectors, optimal lap, consistency and history.
    """
    filters = [
        models.LapTime.track_name == track_name,
        models.LapTime.driver_name == driver_name
    ]
    if car_model:
        filters.append(models.LapTime.car_model == car_model)

    # Get all laps for this driver
    laps = db.query(models.LapTime).filter(*filters).order_by(desc(models.LapTime.timestamp)).all()
    
    if not laps:
        raise HTTPException(status_code=404, detail="Driver telemetry not found")

    valid_laps = [l for l in laps if l.is_valid]
    
    # If no valid laps, we use the best from reality but analytics will be limited
    best_lap_obj = min(valid_laps, key=lambda x: x.lap_time) if valid_laps else laps[0]
    
    # 1. Best Sectors (from best valid lap)
    try:
        best_sectors = json.loads(best_lap_obj.sectors) if best_lap_obj.sectors else []
    except:
        best_sectors = []

    # 2. Optimal Lap (Best of all combined sectors)
    all_sectors = []
    for l in valid_laps:
        try:
            if l.sectors:
                # Handle both list and stringified list
                s = json.loads(l.sectors) if isinstance(l.sectors, str) else l.sectors
                if s and isinstance(s, list):
                    if not all_sectors:
                        all_sectors = [[] for _ in range(len(s))]
                    for i, val in enumerate(s):
                        if i < len(all_sectors):
                            all_sectors[i].append(val)
        except:
            continue
    
    optimal_lap = sum([min(s) for s in all_sectors if s]) if all_sectors else best_lap_obj.lap_time

    # 3. Consistency Score
    # How much the lap times deviate from the average?
    if len(valid_laps) > 1:
        times = [l.lap_time for l in valid_laps]
        avg_lap = sum(times) / len(times)
        # Standard deviation (simplified)
        variance = sum((t - avg_lap) ** 2 for t in times) / len(times)
        std_dev = math.sqrt(variance)
        
        # Mapping std_dev to 0-100 score. 
        # A 1 second (1000ms) std_dev is "Okay" (90 pts). 5 seconds (5000ms) is very inconsistent/crashy.
        consistency_score = max(0, min(100, 100 - (std_dev / 50))) 
    else:
        consistency_score = 100.0

    # 4. History (Last 10 laps for the chart, even invalid ones for context?) 
    # Let's keep valid history for the "progress" chart
    lap_history = [l.lap_time for l in valid_laps[:10]][::-1] # Chronological order

    return schemas.DriverDetails(
        driver_name=driver_name,
        track_name=track_name,
        car_model=best_lap_obj.car_model,
        best_lap=best_lap_obj.lap_time,
        best_sectors=best_sectors,
        optimal_lap=optimal_lap,
        consistency_score=round(consistency_score, 1),
        lap_history=lap_history,
        total_laps=len(laps),
        invalid_laps=len(laps) - len(valid_laps)
    )

@router.get("/pilot/{driver_name}", response_model=schemas.PilotProfile)
def get_pilot_profile(driver_name: str, db: Session = Depends(database.get_db)):
    """
    Get global profile for a driver across all tracks and sessions.
    The "Racing Passport".
    """
    # 1. Total Laps
    total_laps = db.query(models.LapTime).filter(models.LapTime.driver_name == driver_name).count()
    if total_laps == 0:
        raise HTTPException(status_code=404, detail="Pilot profile not found")

    # 2. Favorite Car (Most used)
    fav_car_row = db.query(
        models.LapTime.car_model, 
        func.count(models.LapTime.id).label('count')
    ).filter(models.LapTime.driver_name == driver_name).group_by(models.LapTime.car_model).order_by(desc('count')).first()
    favorite_car = fav_car_row[0] if fav_car_row else "Unknown"

    # 3. Best Records per Track
    # Subquery to find best time per track for this driver
    subq = db.query(
        models.LapTime.track_name,
        func.min(models.LapTime.lap_time).label('best_time')
    ).filter(
        models.LapTime.driver_name == driver_name,
        models.LapTime.is_valid == True
    ).group_by(models.LapTime.track_name).subquery()

    records_query = db.query(models.LapTime).join(
        subq,
        (models.LapTime.track_name == subq.c.track_name) &
        (models.LapTime.lap_time == subq.c.best_time)
    ).filter(models.LapTime.driver_name == driver_name)

    track_records = []
    for r in records_query.all():
        track_records.append(schemas.TrackRecord(
            track_name=r.track_name,
            best_lap=r.lap_time,
            car_model=r.car_model,
            date=r.timestamp
        ))

    # 4. Global Consistency (Avg of consistency scores)
    # We estimate it by taking the last 50 laps and calculating std_dev
    recent_laps = db.query(models.LapTime.lap_time).filter(
        models.LapTime.driver_name == driver_name,
        models.LapTime.is_valid == True
    ).order_by(desc(models.LapTime.timestamp)).limit(50).all()
    
    avg_consistency = 100.0
    if len(recent_laps) > 1:
        times = [l[0] for l in recent_laps]
        avg = sum(times) / len(times)
        variance = sum((t - avg)**2 for t in times) / len(times)
        std_dev = math.sqrt(variance)
        avg_consistency = max(0, min(100, 100 - (std_dev / 100)))

    # 5. Total KM (approx 5km per lap)
    total_km = total_laps * 4.8 

    # 6. Active Days (Count unique dates)
    # SQLite distinct date count workaround or just python set
    dates_query = db.query(models.SessionResult.date).filter(models.SessionResult.driver_name == driver_name).all()
    active_days = len(set([d[0].date() for d in dates_query]))

    # 7. Recent Sessions
    recent_sessions_db = db.query(models.SessionResult).filter(
        models.SessionResult.driver_name == driver_name
    ).order_by(desc(models.SessionResult.date)).limit(10).all()

    recent_sessions = []
    for s in recent_sessions_db:
        # Count laps for this session
        laps_count = db.query(models.LapTime).filter(models.LapTime.session_id == s.id).count()
        recent_sessions.append(schemas.SessionSummary(
            session_id=s.id,
            track_name=s.track_name,
            car_model=s.car_model,
            date=s.date,
            best_lap=s.best_lap,
            laps_count=laps_count
        ))

    return schemas.PilotProfile(
        driver_name=driver_name,
        total_laps=total_laps,
        total_km=round(total_km, 1),
        favorite_car=favorite_car,
        avg_consistency=round(avg_consistency, 1),
        active_days=active_days,
        records=track_records,
        recent_sessions=recent_sessions
    )

@router.post("/seed")
def seed_data(count: int = 50, db: Session = Depends(database.get_db)):
    """
    Seeds the database with random race data.
    """
    import random
    from datetime import datetime, timedelta

    drivers = ["Carlos Sainz", "Fernando Alonso", "Max Verstappen", "L. Hamilton", "Charles Leclerc", "Lando Norris", "Pedro G.", "Javi Racer", "SimDriver 01"]
    cars = ["ferrari_sf24", "redbull_rb20", "mclaren_mcl38", "porsche_911_gt3", "bmw_m4_gt3"]
    tracks = ["monza", "spa", "imola", "nurburgring", "silverstone"]
    
    for _ in range(count // 5): # Create 5 sessions, each with 5 laps
        track = random.choice(tracks)
        car = random.choice(cars)
        driver = random.choice(drivers)
        base_lap_time = 100000 + random.randint(0, 20000)
        session_date = datetime.now() - timedelta(days=random.randint(0, 30))
        
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
        
        # Create 5 laps for this session
        best_of_session = base_lap_time
        for i in range(5):
            # Variance for consistency testing: +/- 1.5 seconds
            lap_time = base_lap_time + random.randint(-500, 1000)
            if lap_time < best_of_session:
                best_of_session = lap_time
            
            # Divide lap into 3 realistic sectors
            s1 = lap_time // 3 + random.randint(-200, 200)
            s2 = lap_time // 3 + random.randint(-200, 200)
            s3 = lap_time - s1 - s2
            
            # Generate Telemetry Trace (Mock Speed Curve)
            telemetry_trace = []
            num_points = 200 # 200 points for the chart
            for step in range(num_points):
                # Simple physics simulation: Accel -> Brake -> Corner -> Accel
                progress = step / num_points
                
                # Mock Speed: Base + Sine waves to simulate corners
                import math
                base_speed = 150
                corner_factor = math.sin(progress * math.pi * 4) * 80 # 2 corners
                noise = random.randint(-5, 5)
                
                speed = max(50, min(350, base_speed + corner_factor + noise))
                
                # RPM follows speed roughly
                rpm = int(3000 + (speed / 350) * 5000)
                gear = int(1 + (speed / 60))
                
                # Mock 3D coordinates (Simple Oval)
                angle = progress * math.pi * 2
                radius = 100 # meters
                x = math.cos(angle) * radius
                z = math.sin(angle) * radius
                rotation = angle + math.pi / 2 # Tangent to circle
                
                telemetry_trace.append({
                    "t": int((lap_time / num_points) * step),
                    "s": int(speed),
                    "r": rpm,
                    "g": min(8, gear),
                    "n": round(progress, 3),
                    # 3D Data
                    "x": round(x, 2),
                    "y": 0,
                    "z": round(z, 2),
                    "rot": round(rotation, 2)
                })
            
            new_lap = models.LapTime(
                session_id=new_session.id,
                driver_name=driver,
                car_model=car,
                track_name=track,
                lap_time=lap_time,
                sectors=json.dumps([s1, s2, s3]),
                telemetry_data=json.dumps(telemetry_trace),
                is_valid=random.random() > 0.1, # 90% valid
                timestamp=session_date + timedelta(minutes=i*2)
            )
            db.add(new_lap)
        
        new_session.best_lap = best_of_session
        
    db.commit()
    return {"message": f"Seeded {count} random laps with sectors across sessions"}

@router.get("/drivers", response_model=List[schemas.DriverSummary])
def get_all_drivers(db: Session = Depends(database.get_db)):
    """
    Get a list of all drivers with summary statistics.
    """
    # Get all unique drivers
    drivers = db.query(models.LapTime.driver_name).distinct().all()
    driver_names = [d[0] for d in drivers]
    
    summaries = []
    
    for name in driver_names:
        # 1. Total Laps
        total_laps = db.query(models.LapTime).filter(models.LapTime.driver_name == name).count()
        
        # 2. Favorite Car
        fav_car_row = db.query(
            models.LapTime.car_model, 
            func.count(models.LapTime.id).label('count')
        ).filter(models.LapTime.driver_name == name).group_by(models.LapTime.car_model).order_by(desc('count')).first()
        favorite_car = fav_car_row[0] if fav_car_row else "Unknown"
        
        # 3. Last Seen
        last_lap = db.query(models.LapTime.timestamp).filter(models.LapTime.driver_name == name).order_by(desc(models.LapTime.timestamp)).first()
        last_seen = last_lap[0] if last_lap else datetime.now()
        
        # 4. Rank Tier (Simple Logic)
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
        
    # Sort by total laps (Activity)
    summaries.sort(key=lambda x: x.total_laps, reverse=True)
    
    return summaries

@router.get("/stats", response_model=schemas.LeaderboardStats)
def get_teleboard_stats(db: Session = Depends(database.get_db)):
    """
    Get Global Stats for the news ticker.
    """
    total_sessions = db.query(models.SessionResult).count()
    
    # Most Popular Track
    most_popular_track = db.query(
        models.LapTime.track_name, 
        func.count(models.LapTime.id).label('count')
    ).group_by(models.LapTime.track_name).order_by(func.count(models.LapTime.id).desc()).first()

    # Most Popular Car
    most_popular_car = db.query(
        models.LapTime.car_model, 
        func.count(models.LapTime.id).label('count')
    ).group_by(models.LapTime.car_model).order_by(func.count(models.LapTime.id).desc()).first()

    # Top Driver (Fastest overall on a weighted scale or just driver with most sessions)
    top_driver = db.query(
        models.LapTime.driver_name,
        func.count(models.LapTime.id).label('count')
    ).group_by(models.LapTime.driver_name).order_by(func.count(models.LapTime.id).desc()).first()

    # Latest Record
    latest = db.query(models.LapTime).order_by(models.LapTime.timestamp.desc()).first()

    return schemas.LeaderboardStats(
        top_driver=top_driver[0] if top_driver else "N/A",
        most_popular_track=most_popular_track[0] if most_popular_track else "N/A",
        most_popular_car=most_popular_car[0] if most_popular_car else "N/A",
        total_sessions=total_sessions,
        latest_record=f"{latest.driver_name} ({latest.track_name})" if latest else "Sin datos"
    )

@router.get("/hall_of_fame", response_model=List[schemas.HallOfFameCategory])
def get_hall_of_fame(db: Session = Depends(database.get_db)):
    # 1. Get unique Track/Car combinations
    combinations = db.query(
        models.LapTime.track_name, 
        models.LapTime.car_model
    ).distinct().all()

    hall_of_fame = []

    for track, car in combinations:
        # 2. Get top 3 for this combo
        top_laps = db.query(models.LapTime).filter(
            models.LapTime.track_name == track,
            models.LapTime.car_model == car
        ).order_by(asc(models.LapTime.lap_time)).limit(3).all()

        records = [
            schemas.HallOfFameEntry(
                driver_name=lap.driver_name,
                lap_time=lap.lap_time,
                date=lap.timestamp
            ) for lap in top_laps
        ]

        if records:
            hall_of_fame.append(schemas.HallOfFameCategory(
                track_name=track,
                car_model=car,
                records=records
            ))

    return hall_of_fame

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
            # Case insensitive filtering for strings
            filters = [
                func.lower(models.LapTime.driver_name) == driver.lower(),
                func.lower(models.LapTime.track_name) == track.lower()
            ]
            if car:
                filters.append(func.lower(models.LapTime.car_model) == car.lower())
                
            laps = db.query(models.LapTime).filter(*filters).all()
            
            if not laps:
                return None
                
            valid_laps_times = [l.lap_time for l in laps if l.lap_time is not None and l.lap_time < 999999999]
            if not valid_laps_times:
                return None

            best = min(valid_laps_times)
            avg = sum(valid_laps_times) / len(valid_laps_times)
            consistency = avg - best 
            
            # Determine actual casing from DB if possible, otherwise use query
            actual_name = laps[0].driver_name if laps else driver

            return {
                "driver_name": actual_name,
                "best_lap": best,
                "total_laps": len(laps),
                "consistency": round(consistency, 1)
            }

        stats1 = get_stats(driver1)
        stats2 = get_stats(driver2)

        if not stats1 or not stats2:
            # Prevent 500 error by returning a clean 404
            raise HTTPException(status_code=404, detail=f"Data incomplete for comparison. {driver1}: {'Found' if stats1 else 'Missing'}, {driver2}: {'Found' if stats2 else 'Missing'}")

        # Winner Logic
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
        print(f"ERROR in compare: {e}")
        # Return a mock if it crashes to avoid frontend death, or raise 500 but printed
        raise HTTPException(status_code=500, detail=f"Comparison Error: {str(e)}")

@router.get("/map/{track_name}")
def get_track_map(track_name: str, db: Session = Depends(database.get_db)):
    
    # Search for a mod that matches the track name (case-insensitive)
    mods_dir = "backend/storage/mods"
    if not os.path.exists(mods_dir):
        raise HTTPException(status_code=404, detail="Mods directory not found")
        
    for mod_folder in os.listdir(mods_dir):
        if track_name.lower() in mod_folder.lower():
            mod_path = os.path.join(mods_dir, mod_folder)
            
            # Possible map filenames
            candidates = [
                "map.png", "map.jpg", 
                "preview.png", "preview.jpg",
                "ui/map.png", "ui/preview.png",
                "content/tracks/" + track_name + "/map.png"
            ]
            
            # Recursive search for anything named map or preview
            for root, dirs, files in os.walk(mod_path):
                for file in files:
                    if file.lower() in ["map.png", "map.jpg", "preview.png", "preview.jpg"]:
                        return FileResponse(os.path.join(root, file))
    
    raise HTTPException(status_code=404, detail="Map not found for track")
