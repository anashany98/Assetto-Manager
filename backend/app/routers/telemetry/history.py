# Telemetry History Module
# Handles leaderboards, driver lists, sessions, and statistics

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, defer
from sqlalchemy import and_, func, asc, desc, or_
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import random
import math
import io

from xml.sax.saxutils import escape

from ... import models, schemas, database
from ..auth import require_admin
from ...security.license import require_license_module
from .base import DEFAULT_LAP_LENGTH_KM, calculate_consistency_score, logger

router = APIRouter(tags=["telemetry-history"])


def _format_time(ms: int) -> str:
    if not ms:
        return "--:--.---"
    minutes = ms // 60000
    seconds = (ms % 60000) // 1000
    millis = ms % 1000
    return f"{minutes}:{seconds:02d}.{millis:03d}"


def _get_setting(db: Session, key: str, default: str) -> str:
    setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == key).first()
    return setting.value if setting and setting.value else default


def _render_leaderboard_svg(entries: List[schemas.LeaderboardEntry], track_name: str, bar_name: str) -> str:
    safe_bar = escape(bar_name)
    safe_track = escape((track_name or "Todos").replace("_", " "))

    rows = []
    start_y = 160
    row_h = 52
    for idx, entry in enumerate(entries[:3]):
        y = start_y + idx * row_h
        name = escape(entry.driver_name or "Piloto")
        time_str = _format_time(entry.lap_time)
        rows.append(f"""
  <text x="80" y="{y}" fill="#e2e8f0" font-size="16" font-family="Arial" font-weight="700">{idx + 1}.</text>
  <text x="120" y="{y}" fill="#ffffff" font-size="16" font-family="Arial" font-weight="700">{name}</text>
  <text x="640" y="{y}" fill="#38bdf8" font-size="16" font-family="Arial" font-weight="700" text-anchor="end">{time_str}</text>
""")

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="800" height="420" rx="24" fill="url(#bg)" />
  <rect x="32" y="32" width="736" height="356" rx="20" fill="#0b1220" stroke="#1f2937" />

  <text x="64" y="78" fill="#94a3b8" font-size="14" font-family="Arial" letter-spacing="3">RANKING PÚBLICO</text>
  <text x="64" y="118" fill="#ffffff" font-size="26" font-family="Arial" font-weight="700">{safe_bar}</text>
  <text x="64" y="142" fill="#94a3b8" font-size="14" font-family="Arial">{safe_track}</text>

  <rect x="64" y="150" width="672" height="210" rx="16" fill="#111827" stroke="#1f2937" />
  {''.join(rows) if rows else '<text x="80" y="210" fill="#94a3b8" font-size="14" font-family="Arial">Sin registros</text>'}

  <text x="64" y="372" fill="#64748b" font-size="12" font-family="Arial">¿Puedes superar estos tiempos? Ven y compite.</text>
</svg>"""
    return svg


def _render_leaderboard_png(entries: List[schemas.LeaderboardEntry], track_name: str, bar_name: str) -> bytes | None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        return None

    def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size)
        except Exception:
            return ImageFont.load_default()

    img = Image.new("RGB", (800, 420), "#0f172a")
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle((32, 32, 768, 388), radius=20, fill="#0b1220", outline="#1f2937", width=2)

    font_small = _load_font(14)
    font_med = _load_font(16)
    font_big = _load_font(26)

    draw.text((64, 70), "RANKING PÚBLICO", fill="#94a3b8", font=font_small)
    draw.text((64, 110), bar_name, fill="#ffffff", font=font_big)
    draw.text((64, 138), (track_name or "Todos").replace("_", " "), fill="#94a3b8", font=font_small)

    draw.rounded_rectangle((64, 150, 736, 360), radius=16, fill="#111827", outline="#1f2937", width=2)

    start_y = 180
    row_h = 52
    if entries:
        for idx, entry in enumerate(entries[:3]):
            y = start_y + idx * row_h
            draw.text((80, y), f"{idx + 1}.", fill="#e2e8f0", font=font_med)
            draw.text((120, y), entry.driver_name or "Piloto", fill="#ffffff", font=font_med)
            time_str = _format_time(entry.lap_time)
            draw.text((700, y), time_str, fill="#38bdf8", font=font_med)
    else:
        draw.text((80, 220), "Sin registros", fill="#94a3b8", font=font_med)

    draw.text((64, 372), "¿Puedes superar estos tiempos? Ven y compite.", fill="#64748b", font=font_small)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


@router.get(
    "/leaderboard",
    response_model=List[schemas.LeaderboardEntry],
    dependencies=[Depends(require_license_module("leaderboard"))],
)
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


@router.get(
    "/leaderboard/share-card",
    dependencies=[Depends(require_license_module("leaderboard"))],
)
def get_leaderboard_share_card(
    track_name: Optional[str] = None,
    car_model: Optional[str] = None,
    period: Optional[str] = "all",
    limit: int = 3,
    format: Optional[str] = "png",
    db: Session = Depends(database.get_db)
):
    """
    Returns a social card for the leaderboard.
    Use ?format=png or ?format=svg.
    """
    entries = get_leaderboard(track_name=track_name, car_model=car_model, period=period, limit=limit, db=db)
    bar_name = _get_setting(db, "bar_name", "VRacing Bar")
    if format and format.lower() == "png":
        png = _render_leaderboard_png(entries, track_name or "Todos", bar_name)
        if png:
            return Response(content=png, media_type="image/png")
    svg = _render_leaderboard_svg(entries, track_name or "Todos", bar_name)
    return Response(content=svg, media_type="image/svg+xml")


@router.get(
    "/combinations",
    response_model=List[dict],
    dependencies=[Depends(require_license_module("leaderboard"))],
)
def get_active_combinations(db: Session = Depends(database.get_db)):
    """Returns unique Active Tracks that have at least one valid lap."""
    results = db.query(
        models.SessionResult.track_name,
        models.SessionResult.car_model
    ).join(models.LapTime, models.SessionResult.id == models.LapTime.session_id).\
    filter(models.LapTime.valid == True).distinct().all()
    
    return [{"track_name": row.track_name, "car_model": row.car_model} for row in results]


@router.get(
    "/driver/{driver_name}/history",
    dependencies=[Depends(require_license_module(["history", "passport"]))],
)
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


@router.get(
    "/drivers",
    response_model=List[schemas.DriverSummary],
    dependencies=[Depends(require_license_module(["leaderboard", "passport", "history", "lap_comparison"]))],
)
def get_all_drivers(db: Session = Depends(database.get_db)):
    """Get a list of all drivers with summary statistics."""
    # Previous implementation ran multiple queries per driver (N+1 pattern).
    # Aggregate everything in a couple of queries to keep the UI responsive on large datasets.

    driver_stats = (
        db.query(
            models.SessionResult.driver_name.label("driver_name"),
            func.count(models.LapTime.id).label("total_laps"),
            func.max(models.SessionResult.date).label("last_seen"),
        )
        .select_from(models.SessionResult)
        .outerjoin(models.LapTime, models.LapTime.session_id == models.SessionResult.id)
        .group_by(models.SessionResult.driver_name)
        .all()
    )

    # Favorite car: count laps by (driver, car), then pick the max in Python (portable across DBs).
    car_counts = (
        db.query(
            models.SessionResult.driver_name.label("driver_name"),
            models.SessionResult.car_model.label("car_model"),
            func.count(models.LapTime.id).label("lap_count"),
        )
        .select_from(models.SessionResult)
        .join(models.LapTime, models.LapTime.session_id == models.SessionResult.id)
        .group_by(models.SessionResult.driver_name, models.SessionResult.car_model)
        .order_by(desc("lap_count"))
        .all()
    )

    favorite_by_driver: dict[str, str] = {}
    for row in car_counts:
        if not row.driver_name:
            continue
        if row.driver_name not in favorite_by_driver:
            favorite_by_driver[row.driver_name] = row.car_model or "Unknown"

    now = datetime.now(timezone.utc)
    summaries: list[schemas.DriverSummary] = []
    for row in driver_stats:
        name = row.driver_name
        if not name:
            continue

        total_laps = int(row.total_laps or 0)
        favorite_car = favorite_by_driver.get(name, "Unknown")
        last_seen = row.last_seen or now

        if total_laps > 500:
            rank = "Alien"
        elif total_laps > 100:
            rank = "Pro"
        elif total_laps > 20:
            rank = "Amateur"
        else:
            rank = "Rookie"

        summaries.append(
            schemas.DriverSummary(
                driver_name=name,
                total_laps=total_laps,
                favorite_car=favorite_car,
                last_seen=last_seen,
                rank_tier=rank,
            )
        )

    summaries.sort(key=lambda x: x.total_laps, reverse=True)
    return summaries


@router.get(
    "/sessions",
    response_model=List[schemas.SessionResult],
    dependencies=[Depends(require_license_module("history"))],
)
def get_recent_sessions(
    track_name: Optional[str] = None,
    driver_name: Optional[str] = None,
    car_model: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    cursor_date: Optional[datetime] = None,
    cursor_id: Optional[int] = None,
    db: Session = Depends(database.get_db)
):
    query = db.query(models.SessionResult)
    if track_name:
        query = query.filter(models.SessionResult.track_name.ilike(f"%{track_name}%"))
    if driver_name:
        query = query.filter(models.SessionResult.driver_name.ilike(f"%{driver_name}%"))
    if car_model:
        query = query.filter(models.SessionResult.car_model.ilike(f"%{car_model}%"))

    # Fetch sessions first, then resolve best lap ids for this small set in a single query
    # (avoids running one query per session).
    safe_limit = max(1, min(int(limit or 50), 500))
    safe_offset = max(0, int(offset or 0))
    query = query.order_by(desc(models.SessionResult.date), desc(models.SessionResult.id))

    # Prefer cursor-based pagination when provided (stable pagination on large datasets).
    if cursor_date is not None:
        if cursor_id is not None:
            query = query.filter(
                or_(
                    models.SessionResult.date < cursor_date,
                    and_(models.SessionResult.date == cursor_date, models.SessionResult.id < cursor_id),
                )
            )
        else:
            query = query.filter(models.SessionResult.date < cursor_date)
        sessions = query.limit(safe_limit).all()
    else:
        sessions = query.offset(safe_offset).limit(safe_limit).all()
    if not sessions:
        return []

    session_ids = [s.id for s in sessions]

    best_times_subq = (
        db.query(
            models.LapTime.session_id.label("session_id"),
            func.min(models.LapTime.time).label("best_time"),
        )
        .filter(
            models.LapTime.valid == True,
            models.LapTime.session_id.in_(session_ids),
        )
        .group_by(models.LapTime.session_id)
        .subquery()
    )

    best_lap_rows = (
        db.query(
            models.LapTime.session_id.label("session_id"),
            func.min(models.LapTime.id).label("best_lap_id"),
        )
        .join(
            best_times_subq,
            (models.LapTime.session_id == best_times_subq.c.session_id)
            & (models.LapTime.time == best_times_subq.c.best_time),
        )
        .filter(models.LapTime.valid == True)
        .group_by(models.LapTime.session_id)
        .all()
    )

    best_lap_id_by_session = {row.session_id: row.best_lap_id for row in best_lap_rows}

    results: list[schemas.SessionResult] = []
    for s in sessions:
        # Pydantic v2: prefer model_validate over from_orm (deprecated).
        session_data = schemas.SessionResult.model_validate(s)
        session_data.best_lap_id = best_lap_id_by_session.get(s.id)
        results.append(session_data)

    return results


@router.get(
    "/stats",
    response_model=schemas.LeaderboardStats,
    dependencies=[Depends(require_license_module("leaderboard"))],
)
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


@router.get(
    "/active-combinations",
    dependencies=[Depends(require_license_module("leaderboard"))],
)
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


@router.post("/seed", dependencies=[Depends(require_admin), Depends(require_license_module("leaderboard"))])
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
