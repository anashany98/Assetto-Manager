from fastapi import APIRouter, Depends, HTTPException, Body, Header
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, asc, desc
from typing import List, Optional, Union, Any
from .. import models, schemas, database
from ..paths import STORAGE_DIR
from datetime import datetime, timezone, timedelta
import os
import json
import math
import logging

# Magic Numbers / Constants
DEFAULT_LAP_LENGTH_KM = 4.8
CONSISTENCY_STD_DEV_DIVISOR = 50
TELEMETRY_POINTS_PER_LAP = 200
MIN_CONSISTENCY_SCORE = 0
MAX_CONSISTENCY_SCORE = 100

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/telemetry",
    tags=["telemetry"]
)

def _coerce_json_value(value: Optional[Union[dict, list, str]]) -> Optional[Union[dict, list]]:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return None # Return None on failure to ensure safety
    return None

def _coerce_splits(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def calculate_consistency_score(times: List[int]) -> float:
    """
    Calculates a consistency score (0-100) based on lap time standard deviation.
    Higher is better (more consistent).
    """
    if len(times) < 2:
        return 100.0
        
    avg_lap = sum(times) / len(times)
    # Standard deviation (simplified)
    variance = sum((t - avg_lap) ** 2 for t in times) / len(times)
    std_dev = math.sqrt(variance)
    
    # Mapping std_dev to 0-100 score. 
    # A 1 second (1000ms) std_dev is "Okay" (90 pts). 5 seconds (5000ms) is very inconsistent/crashy.
    # CONSISTENCY_STD_DEV_DIVISOR should be imported or defined in scope.
    # It is defined at module level.
    
    score = max(
        MIN_CONSISTENCY_SCORE, 
        min(MAX_CONSISTENCY_SCORE, MAX_CONSISTENCY_SCORE - (std_dev / CONSISTENCY_STD_DEV_DIVISOR))
    )
    return float(score)

@router.post("/session", status_code=201)
def upload_session_result(
    session_data: schemas.SessionResultCreate, 
    db: Session = Depends(database.get_db)
):
    try:
        # 1. Create Session Record
        new_session = models.SessionResult(
            station_id=session_data.station_id,
            track_name=session_data.track_name,
            track_config=session_data.track_config,
            car_model=session_data.car_model,
            driver_name=session_data.driver_name,
            session_type=session_data.session_type,
            date=session_data.date, # Pydantic should handle timezone parsing if ISO format
            best_lap=session_data.best_lap,
            event_id=session_data.event_id
        )
        
        # Live Linking: If no event_id provided, check if matches an active event
        if not new_session.event_id:
            # Check for events where:
            # 1. Track matches
            # 2. Current time matches event window
            # 3. Championship is active
            active_event = db.query(models.Event).join(models.Championship).filter(
                models.Championship.is_active == True,
                func.lower(models.Event.track_name) == session_data.track_name.lower(),
                models.Event.start_date <= new_session.date,
                models.Event.end_date >= new_session.date
            ).first()
            
            if active_event:
                new_session.event_id = active_event.id
                logger.info(f"Auto-linked session {new_session.date} to event {active_event.id} ({active_event.name})")

        db.add(new_session)
        db.flush() # Get ID without committing
        
        # 2. Process Laps
        for idx, lap in enumerate(session_data.laps, start=1):
            if not lap.is_valid:
                continue # We only store valid laps for leaderboards to save space? Or store all?
                # Storing only valid ones for V1 efficiency.
    
            telemetry_payload = _coerce_json_value(lap.telemetry_data)
                
            new_lap = models.LapTime(
                session_id=new_session.id,
                lap_number=idx,
                time=lap.time,
                splits=lap.sectors,
                telemetry_data=telemetry_payload,
                valid=lap.is_valid
            )
            db.add(new_lap)
        
        db.commit()
        return {"status": "ok", "session_id": new_session.id}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to upload session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
        models.LapTime.valid == True
    ]

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

    # 2. Subquery: Find the BEST Time (MIN time) for each driver
    # We must join LapTime -> SessionResult to get Driver Name
    subquery = db.query(
        models.SessionResult.driver_name,
        func.min(models.LapTime.time).label('best_time')
    ).join(models.SessionResult, models.LapTime.session_id == models.SessionResult.id).\
    filter(*filters).group_by(models.SessionResult.driver_name).subquery()

    # 3. Main Query: Join back to get the FULL row
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
    
    # Order by Best Time ASC (Fastest on top)
    query = query.order_by(asc(models.LapTime.time))
    query = query.limit(limit)
    
    results = query.all()
    
    leaderboard = []
    
    if not results:
        return []

    # results is a list of tuples (LapTime, SessionResult) because we queried both models
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
    """
    Returns unique Active Tracks that have at least one valid lap.
    Used for Auto-Rotation on TV (Track Rotation Only).
    """
    """
    Returns unique Active Tracks that have at least one valid lap.
    Used for Auto-Rotation on TV (Track Rotation Only).
    """
    results = db.query(
        models.SessionResult.track_name,
        models.SessionResult.car_model
    ).join(models.LapTime, models.SessionResult.id == models.LapTime.session_id).\
    filter(
        models.LapTime.valid == True
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
        # Access track name via session relationship
        t_name = lap.session.track_name.lower() if lap.session else "unknown"
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
        real_lap_time = lap.time if lap.time else 100000
        
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
    
    return _coerce_json_value(lap.telemetry_data) or []

@router.get("/details/{track_name}/{driver_name}", response_model=schemas.DriverDetails)
def get_driver_details(
    track_name: str,
    driver_name: str,
    car_model: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    """
    Get deep analytics for a specific driver and track.

    Args:
        track_name: Name of the track to filter by
        driver_name: Name of the driver
        car_model: Optional car model filter
        db: Database session (injected by FastAPI)

    Returns:
        DriverDetails: Complete driver analytics including:
            - Best lap time and sectors
            - Optimal (theoretical) lap
            - Consistency score (0-100)
            - Lap history

    Raises:
        HTTPException: 404 if no telemetry data found for driver
    """
    filters = [
        models.SessionResult.track_name == track_name,
        models.SessionResult.driver_name == driver_name
    ]
    if car_model:
        filters.append(models.SessionResult.car_model == car_model)

    # Get all laps for this driver
    laps = db.query(models.LapTime).join(models.SessionResult).filter(*filters).order_by(desc(models.SessionResult.date)).all()
    
    if not laps:
        raise HTTPException(status_code=404, detail="Driver telemetry not found")

    valid_laps = [l for l in laps if l.valid]
    
    # If no valid laps, we use the best from reality but analytics will be limited
    best_lap_obj = min(valid_laps, key=lambda x: x.time) if valid_laps else min(laps, key=lambda x: x.time)
    
    # 1. Best Sectors (from best valid lap)
    try:
        best_sectors = _coerce_splits(best_lap_obj.splits)
    except:
        best_sectors = []

    # 2. Optimal Lap (Best of all combined sectors)
    all_sectors = []
    for l in valid_laps:
        try:
            if l.splits:
                # Handle both list and stringified list
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

    # 3. Consistency Score
    # How much the lap times deviate from the average?
    # 3. Consistency Score
    # How much the lap times deviate from the average?
    times = [l.time for l in valid_laps]
    consistency_score = calculate_consistency_score(times)

    # 4. History (Last 10 laps for the chart, even invalid ones for context?) 
    # Let's keep valid history for the "progress" chart
    lap_history = [l.time for l in valid_laps[:10]][::-1] # Chronological order

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
    """
    Get global profile for a driver across all tracks and sessions.
    The "Racing Passport".
    """
    # 1. Total Laps
    total_laps = db.query(models.LapTime).join(models.SessionResult).filter(models.SessionResult.driver_name == driver_name).count()
    if total_laps == 0:
        raise HTTPException(status_code=404, detail="Pilot profile not found")

    # 2. Favorite Car (Most used)
    fav_car_row = db.query(
        models.SessionResult.car_model, 
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).filter(models.SessionResult.driver_name == driver_name).group_by(models.SessionResult.car_model).order_by(desc('count')).first()
    favorite_car = fav_car_row[0] if fav_car_row else "Unknown"

    # 3. Best Records per Track
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

    # 4. Global Consistency (Avg of consistency scores)
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

    # 5. Total KM (approx 5km per lap)
    total_km = total_laps * DEFAULT_LAP_LENGTH_KM

    # 6. Active Days (Count unique dates)
    dates_query = db.query(models.SessionResult.date).filter(models.SessionResult.driver_name == driver_name).all()
    active_days = len(set([d[0].date() for d in dates_query]))

    # 7. Recent Sessions (Optimized N+1)
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
        recent_sessions.append(schemas.SessionSummary(
            session_id=s.id,
            track_name=s.track_name,
            car_model=s.car_model,
            date=s.date,
            best_lap=s.best_lap,
            laps_count=laps_count or 0
        ))

    # 8. Get Driver Stats
    driver_obj = db.query(models.Driver).filter(models.Driver.name == driver_name).first()
    
    if not driver_obj:
        driver_obj = models.Driver(name=driver_name, elo_rating=1200.0)
        db.add(driver_obj)
        db.commit()
        db.refresh(driver_obj)

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
        elo_rating=driver_obj.elo_rating
    )

@router.post("/seed")
def seed_data(
    count: int = 50, 
    db: Session = Depends(database.get_db),
    admin_token: str = Header(None, alias="X-Admin-Token")
):
    if admin_token != os.getenv("ADMIN_TOKEN", "default_insecure_dev_token"):
        if os.getenv("ENVIRONMENT", "development") == "production":
             raise HTTPException(status_code=403, detail="Unauthorized")

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
                lap_number=i + 1,
                time=lap_time,
                splits=[s1, s2, s3],
                telemetry_data=telemetry_trace,
                valid=random.random() > 0.1, # 90% valid
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
    drivers = db.query(models.SessionResult.driver_name).distinct().all()
    driver_names = [d[0] for d in drivers]
    
    summaries = []
    
    for name in driver_names:
        # 1. Total Laps
        total_laps = db.query(models.LapTime).join(models.SessionResult).filter(models.SessionResult.driver_name == name).count()
        
        # 2. Favorite Car
        fav_car_row = db.query(
            models.SessionResult.car_model, 
            func.count(models.LapTime.id).label('count')
        ).join(models.LapTime).filter(models.SessionResult.driver_name == name).group_by(models.SessionResult.car_model).order_by(desc('count')).first()
        favorite_car = fav_car_row[0] if fav_car_row else "Unknown"
        
        # 3. Last Seen
        last_lap = db.query(models.SessionResult.date).filter(models.SessionResult.driver_name == name).order_by(desc(models.SessionResult.date)).first()
        last_seen = last_lap[0] if last_lap else datetime.now(timezone.utc)
        
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
    return query.order_by(desc(models.SessionResult.date)).limit(limit).all()

@router.get("/stats", response_model=schemas.LeaderboardStats)
def get_teleboard_stats(db: Session = Depends(database.get_db)):
    """
    Get Global Stats for the news ticker.
    """
    total_sessions = db.query(models.SessionResult).count()
    
    # Most Popular Track
    most_popular_track = db.query(
        models.SessionResult.track_name, 
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).group_by(models.SessionResult.track_name).order_by(func.count(models.LapTime.id).desc()).first()

    # Most Popular Car
    most_popular_car = db.query(
        models.SessionResult.car_model, 
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).group_by(models.SessionResult.car_model).order_by(func.count(models.LapTime.id).desc()).first()

    # Top Driver (Fastest overall on a weighted scale or just driver with most sessions)
    top_driver = db.query(
        models.SessionResult.driver_name,
        func.count(models.LapTime.id).label('count')
    ).join(models.LapTime).group_by(models.SessionResult.driver_name).order_by(func.count(models.LapTime.id).desc()).first()

    # Latest Record
    latest = db.query(models.LapTime).join(models.SessionResult).order_by(models.SessionResult.date.desc()).first()

    return schemas.LeaderboardStats(
        top_driver=top_driver[0] if top_driver else "N/A",
        most_popular_track=most_popular_track[0] if most_popular_track else "N/A",
        most_popular_car=most_popular_car[0] if most_popular_car else "N/A",
        total_sessions=total_sessions,
        latest_record=f"{latest.session.driver_name} ({latest.session.track_name})" if latest else "Sin datos"
    )

@router.get("/hall_of_fame", response_model=List[schemas.HallOfFameCategory])
def get_hall_of_fame(db: Session = Depends(database.get_db)):
    # 1. Get unique Track/Car combinations
    combinations = db.query(
        models.SessionResult.track_name, 
        models.SessionResult.car_model
    ).join(models.LapTime).distinct().all()

    hall_of_fame = []

    for track, car in combinations:
        # 2. Get top 3 for this combo
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
            
            # Determine actual casing from DB if possible, otherwise use query
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
    except Exception as e:
        print(f"ERROR in compare: {e}")
        # Return a mock if it crashes to avoid frontend death, or raise 500 but printed
        raise HTTPException(status_code=500, detail=f"Comparison Error: {str(e)}")

@router.post("/compare-multi", response_model=schemas.MultiDriverComparisonResponse)
def compare_multi_drivers(
    payload: schemas.MultiDriverComparisonRequest,
    db: Session = Depends(database.get_db)
):
    try:
        drivers_stats = []
        
        # Helper to get stats for a single driver (reused)
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

        # Process all requested drivers
        for driver in payload.drivers:
            stats = get_stats(driver)
            if stats:
                drivers_stats.append(schemas.ComparisonStats(**stats))
        
        if len(drivers_stats) < 1:
            raise HTTPException(status_code=404, detail="No data found for any of the requested drivers")

        # Sort by Best Lap (Ascending - Fastest first)
        drivers_stats.sort(key=lambda x: x.best_lap)

        # Calculate Win Counts / Highlights
        # 1. Best Lap: Index 0 is already winner after sort
        if drivers_stats:
            drivers_stats[0].win_count += 1
            
        # 2. Consistency: Find min consistency
        best_consistency = min(drivers_stats, key=lambda x: x.consistency)
        best_consistency.win_count += 1
        
        # 3. Total Laps: Find max laps
        most_laps = max(drivers_stats, key=lambda x: x.total_laps)
        most_laps.win_count += 1

        return schemas.MultiDriverComparisonResponse(
            track_name=payload.track,
            car_model=payload.car,
            drivers=drivers_stats
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in compare-multi: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/map/{track_name}")
def get_track_map(track_name: str, db: Session = Depends(database.get_db)):
    
    # Search for a mod that matches the track name (case-insensitive)
    mods_dir = STORAGE_DIR / "mods"
    if not mods_dir.exists():
        raise HTTPException(status_code=404, detail="Mods directory not found")
        
    for mod_folder in os.listdir(mods_dir):
        if track_name.lower() in mod_folder.lower():
            mod_path = mods_dir / mod_folder
            
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
