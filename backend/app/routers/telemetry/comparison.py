# Telemetry Comparison Module
# Handles driver comparisons, details, and pilot profiles

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, defer
from sqlalchemy import func, asc, desc, cast, Date
from typing import List, Optional
from xml.sax.saxutils import escape
import io
from pathlib import Path
from datetime import datetime, timezone
import math

from ... import models, schemas, database
from ...security.license import require_license_module
from .base import (
    DEFAULT_LAP_LENGTH_KM, 
    calculate_consistency_score, 
    _coerce_splits, 
    _coerce_json_value,
    logger
)

router = APIRouter(tags=["telemetry-comparison"])


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


def _progress(current: float, target: float) -> float:
    if not target:
        return 1.0
    try:
        return max(0.0, min(1.0, float(current) / float(target)))
    except Exception:
        return 0.0


def _build_badges(
    total_laps: int,
    total_km: float,
    avg_consistency: float,
    driver_obj: models.Driver
) -> List[dict]:
    badges: List[dict] = []

    def add_badge(
        badge_id: str,
        label: str,
        desc: str,
        achieved: bool,
        progress: float | None = None,
        icon: str | None = None
    ) -> None:
        payload = {
            "id": badge_id,
            "label": label,
            "desc": desc,
            "achieved": achieved,
        }
        if icon:
            payload["icon"] = icon
        if progress is not None:
            payload["progress"] = round(progress, 3)
        badges.append(payload)

    add_badge(
        "first_lap",
        "Primeras vueltas",
        "Completa tu primera vuelta registrada",
        total_laps >= 1,
        _progress(total_laps, 1),
        "🏁"
    )
    add_badge(
        "hundred_laps",
        "Centenario",
        "Completa 100 vueltas",
        total_laps >= 100,
        _progress(total_laps, 100),
        "💯"
    )
    add_badge(
        "five_hundred_laps",
        "Veterano",
        "Completa 500 vueltas",
        total_laps >= 500,
        _progress(total_laps, 500),
        "🏎️"
    )
    add_badge(
        "podium",
        "Podio",
        "Consigue al menos un podio",
        driver_obj.total_podiums > 0,
        _progress(driver_obj.total_podiums, 1),
        "🥉"
    )
    add_badge(
        "winner",
        "Ganador",
        "Gana al menos una carrera",
        driver_obj.total_wins > 0,
        _progress(driver_obj.total_wins, 1),
        "🏆"
    )
    add_badge(
        "consistency_85",
        "Consistente",
        "Promedio de consistencia ≥ 85%",
        avg_consistency >= 85,
        _progress(avg_consistency, 85),
        "🎯"
    )
    add_badge(
        "elo_1400",
        "ELO 1400",
        "Alcanza ELO 1400",
        (driver_obj.elo_rating or 0) >= 1400,
        _progress(driver_obj.elo_rating or 0, 1400),
        "⚡"
    )
    add_badge(
        "distance_100",
        "100 km",
        "Completa 100 km en pista",
        total_km >= 100,
        _progress(total_km, 100),
        "🛣️"
    )
    if driver_obj.membership_tier:
        tier_label = driver_obj.membership_tier.capitalize()
        add_badge(
            f"loyalty_{driver_obj.membership_tier}",
            f"Fidelidad {tier_label}",
            f"Nivel de fidelidad {tier_label}",
            True,
            1.0,
            "⭐"
        )

    return badges


def _render_pilot_card_svg(profile: schemas.PilotProfile, bar_name: str) -> str:
    best_record = None
    if profile.records:
        best_record = min(profile.records, key=lambda r: r.best_lap)

    best_time = _format_time(best_record.best_lap) if best_record else "--:--.---"
    best_track = best_record.track_name if best_record else "N/A"

    driver_name = escape(profile.driver_name or "Piloto")
    favorite_car = escape((profile.favorite_car or "Unknown").replace("_", " "))
    bar_name_safe = escape(bar_name)
    best_track_safe = escape((best_track or "").replace("_", " "))

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="800" height="420" rx="24" fill="url(#bg)" />
  <rect x="32" y="32" width="736" height="356" rx="20" fill="#0b1220" stroke="#1f2937" />

  <text x="64" y="78" fill="#94a3b8" font-size="14" font-family="Arial" letter-spacing="3">PASAPORTE DE PILOTO</text>
  <text x="64" y="118" fill="#ffffff" font-size="28" font-family="Arial" font-weight="700">{driver_name}</text>
  <text x="64" y="146" fill="#94a3b8" font-size="14" font-family="Arial">{bar_name_safe}</text>

  <rect x="64" y="176" width="320" height="160" rx="16" fill="#111827" stroke="#1f2937" />
  <text x="84" y="210" fill="#94a3b8" font-size="12" font-family="Arial">Mejor vuelta</text>
  <text x="84" y="242" fill="#38bdf8" font-size="26" font-family="Arial" font-weight="700">{best_time}</text>
  <text x="84" y="268" fill="#94a3b8" font-size="12" font-family="Arial">{best_track_safe}</text>

  <rect x="416" y="176" width="320" height="160" rx="16" fill="#111827" stroke="#1f2937" />
  <text x="436" y="210" fill="#94a3b8" font-size="12" font-family="Arial">Estadísticas</text>
  <text x="436" y="238" fill="#ffffff" font-size="14" font-family="Arial">Vueltas: {profile.total_laps}</text>
  <text x="436" y="262" fill="#ffffff" font-size="14" font-family="Arial">Km: {int(profile.total_km)}</text>
  <text x="436" y="286" fill="#ffffff" font-size="14" font-family="Arial">Consistencia: {round(profile.avg_consistency, 1)}%</text>
  <text x="436" y="310" fill="#ffffff" font-size="14" font-family="Arial">ELO: {int(profile.elo_rating or 0)}</text>
  <text x="436" y="334" fill="#ffffff" font-size="14" font-family="Arial">Coche favorito: {favorite_car}</text>

  <text x="64" y="372" fill="#64748b" font-size="12" font-family="Arial">Comparte tu récord y reta a tus amigos</text>
</svg>"""
    return svg


def _render_pilot_card_png(profile: schemas.PilotProfile, bar_name: str) -> bytes | None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        return None

    def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size)
        except Exception:
            return ImageFont.load_default()

    best_record = None
    if profile.records:
        best_record = min(profile.records, key=lambda r: r.best_lap)

    best_time = _format_time(best_record.best_lap) if best_record else "--:--.---"
    best_track = (best_record.track_name if best_record else "N/A").replace("_", " ")
    favorite_car = (profile.favorite_car or "Unknown").replace("_", " ")

    img = Image.new("RGB", (800, 420), "#0f172a")
    draw = ImageDraw.Draw(img)

    # Card background
    draw.rounded_rectangle((32, 32, 768, 388), radius=20, fill="#0b1220", outline="#1f2937", width=2)

    # Fonts
    font_small = _load_font(14)
    font_med = _load_font(18)
    font_big = _load_font(28)
    font_title = _load_font(24)

    # Header
    draw.text((64, 70), "PASAPORTE DE PILOTO", fill="#94a3b8", font=font_small)
    draw.text((64, 110), profile.driver_name or "Piloto", fill="#ffffff", font=font_big)
    draw.text((64, 140), bar_name, fill="#94a3b8", font=font_small)

    # Left box
    draw.rounded_rectangle((64, 176, 384, 336), radius=16, fill="#111827", outline="#1f2937", width=2)
    draw.text((84, 210), "Mejor vuelta", fill="#94a3b8", font=font_small)
    draw.text((84, 242), best_time, fill="#38bdf8", font=font_title)
    draw.text((84, 270), best_track, fill="#94a3b8", font=font_small)

    # Right box
    draw.rounded_rectangle((416, 176, 736, 336), radius=16, fill="#111827", outline="#1f2937", width=2)
    draw.text((436, 210), "Estadísticas", fill="#94a3b8", font=font_small)
    draw.text((436, 236), f"Vueltas: {profile.total_laps}", fill="#ffffff", font=font_med)
    draw.text((436, 260), f"Km: {int(profile.total_km)}", fill="#ffffff", font=font_med)
    draw.text((436, 284), f"Consistencia: {round(profile.avg_consistency, 1)}%", fill="#ffffff", font=font_med)
    draw.text((436, 308), f"ELO: {int(profile.elo_rating or 0)}", fill="#ffffff", font=font_med)
    draw.text((436, 332), f"Coche favorito: {favorite_car}", fill="#ffffff", font=font_small)

    draw.text((64, 370), "Comparte tu récord y reta a tus amigos", fill="#64748b", font=font_small)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


@router.get(
    "/details/{track_name}/{driver_name}",
    response_model=schemas.DriverDetails,
    dependencies=[Depends(require_license_module(["lap_comparison", "passport"]))],
)
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

    laps = (
        db.query(models.LapTime)
        .join(models.SessionResult)
        # Telemetry JSON can be huge; driver details only needs splits + time series stats.
        .options(defer(models.LapTime.telemetry_data))
        .filter(*filters)
        .order_by(desc(models.SessionResult.date))
        .all()
    )
    
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


@router.get(
    "/pilot/{driver_name}",
    response_model=schemas.PilotProfile,
    dependencies=[Depends(require_license_module("passport"))],
)
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
    ).filter(
        models.SessionResult.driver_name == driver_name,
        models.LapTime.valid == True,
    ).options(defer(models.LapTime.telemetry_data))

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

    active_days = (
        db.query(func.count(func.distinct(cast(models.SessionResult.date, Date))))
        .filter(models.SessionResult.driver_name == driver_name)
        .scalar()
        or 0
    )

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

    recent_session_ids = [s.id for s, _laps_count in recent_sessions_db]
    best_lap_id_by_session: dict[int, int] = {}
    if recent_session_ids:
        best_times_subq = (
            db.query(
                models.LapTime.session_id.label("session_id"),
                func.min(models.LapTime.time).label("best_time"),
            )
            .filter(
                models.LapTime.valid == True,
                models.LapTime.session_id.in_(recent_session_ids),
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

        best_lap_id_by_session = {int(r.session_id): int(r.best_lap_id) for r in best_lap_rows if r.best_lap_id is not None}

    recent_sessions = []
    for s, laps_count in recent_sessions_db:
        recent_sessions.append(schemas.SessionSummary(
            session_id=s.id,
            track_name=s.track_name,
            car_model=s.car_model,
            date=s.date,
            best_lap=s.best_lap,
            best_lap_id=best_lap_id_by_session.get(int(s.id)),
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
    badges = _build_badges(
        total_laps=total_laps,
        total_km=total_km,
        avg_consistency=avg_consistency,
        driver_obj=driver_obj
    )

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


@router.get(
    "/pilot/{driver_name}/share-card",
    dependencies=[Depends(require_license_module("passport"))],
)
def get_pilot_share_card(
    driver_name: str,
    format: Optional[str] = "svg",
    db: Session = Depends(database.get_db)
):
    """
    Returns a social card for the pilot profile.
    Use ?format=png for PNG output.
    """
    profile = get_pilot_profile(driver_name, db)
    bar_name = _get_setting(db, "bar_name", "VRacing Bar")
    if format and format.lower() == "png":
        png = _render_pilot_card_png(profile, bar_name)
        if png:
            return Response(content=png, media_type="image/png")
    svg = _render_pilot_card_svg(profile, bar_name)
    return Response(content=svg, media_type="image/svg+xml")


@router.get(
    "/compare/{driver1}/{driver2}",
    response_model=schemas.DriverComparison,
    dependencies=[Depends(require_license_module("lap_comparison"))],
)
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


@router.post(
    "/compare-multi",
    response_model=schemas.MultiDriverComparisonResponse,
    dependencies=[Depends(require_license_module("lap_comparison"))],
)
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
