from fastapi import APIRouter, Depends, HTTPException, Body, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, asc, desc
from typing import List, Optional, Union, Any
from .. import models, schemas, database
from ..paths import STORAGE_DIR, REPO_ROOT
from datetime import datetime, timezone, timedelta
import os
import json
import math
import logging
from .auth import require_agent_token, require_admin
from . import tournament
import io
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.units import cm
plt.switch_backend('agg') # Headless mode for server environment

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

@router.post("/session", status_code=201, dependencies=[Depends(require_agent_token)])
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

        # 3. Tournament Auto-Advance Logic
        if new_session.session_type == 'race' and new_session.event_id:
            try:
                event = db.query(models.Event).filter(models.Event.id == new_session.event_id).first()
                if event and event.bracket_data:
                    bracket = tournament.load_bracket(event)
                    if bracket:
                        # Find match where this driver is pending
                        match = tournament.find_active_match(bracket, new_session.driver_name)
                        if match:
                            opponent_name = match["player2"] if match["player1"] == new_session.driver_name else match["player1"]
                            
                            if opponent_name and opponent_name != "BYE":
                                # Look for opponent's recent result (last 1 hour)
                                since = datetime.now(timezone.utc) - timedelta(hours=1)
                                
                                opp_session = db.query(models.SessionResult).filter(
                                    models.SessionResult.event_id == event.id,
                                    models.SessionResult.driver_name == opponent_name,
                                    models.SessionResult.session_type == 'race',
                                    models.SessionResult.date >= since
                                ).order_by(desc(models.SessionResult.date)).first()
                                
                                if opp_session:
                                    # Compare results
                                    # 1. Total Laps (More is better)
                                    my_laps_count = db.query(models.LapTime).filter(models.LapTime.session_id == new_session.id).count()
                                    opp_laps_count = db.query(models.LapTime).filter(models.LapTime.session_id == opp_session.id).count()
                                    
                                    winner = None
                                    if my_laps_count != opp_laps_count:
                                        winner = new_session.driver_name if my_laps_count > opp_laps_count else opponent_name
                                    else:
                                        # 2. Total Time (Less is better)
                                        my_total_time = db.query(func.sum(models.LapTime.time)).filter(models.LapTime.session_id == new_session.id).scalar() or 0
                                        opp_total_time = db.query(func.sum(models.LapTime.time)).filter(models.LapTime.session_id == opp_session.id).scalar() or 0
                                        
                                        if my_total_time and opp_total_time:
                                            winner = new_session.driver_name if my_total_time < opp_total_time else opponent_name
                                            
                                    if winner:
                                        logger.info(f"Tournament Match Auto-Decided: {winner} wins against {opponent_name if winner == new_session.driver_name else new_session.driver_name}")
                                        tournament.advance_bracket_for_winner(event, winner, db)

            except Exception as e:
                logger.error(f"Tournament auto-advance failed: {e}")

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
    
    # Format as a downloadable JSON file
    import json
    from fastapi.responses import Response
    
    data = _coerce_json_value(lap.telemetry_data) or []
    content = json.dumps(data, indent=2)
    filename = f"telemetry_{lap_id}.json"
    
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.units import cm
import io

def format_ms(ms: int) -> str:
    if not ms: return "--:--.---"
    mins = ms // 60000
    secs = (ms % 60000) / 1000
    return f"{mins:02d}:{secs:06.3f}"

@router.get("/driver/{driver_name}/history")
def get_driver_history(driver_name: str, db: Session = Depends(database.get_db)):
    """
    Get all laps for a driver.
    Optimized: Defers loading of heavy telemetry_data column.
    """
    from sqlalchemy.orm import defer
    
    # 1. Find Driver via Profile or name match?
    # For now, simplistic name match on SessionResult
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

@router.get("/session/{session_id}/pdf")
def get_session_pdf(session_id: int, db: Session = Depends(database.get_db)):
    """
    Generate a high-end professional PDF report for a session with advanced telemetry, 
    including charts, track maps, and local records.
    """
    session = db.query(models.SessionResult).filter(models.SessionResult.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    laps = db.query(models.LapTime).filter(models.LapTime.session_id == session_id, models.LapTime.valid == True).order_by(models.LapTime.lap_number).all()
    if not laps:
        raise HTTPException(status_code=404, detail="No valid laps found for this session")

    # 1. Advanced Calculations
    lap_times = [l.time for l in laps]
    consistency = calculate_consistency_score(lap_times)
    
    # Calculate Ideal Lap (Best of each sector)
    best_s1 = min([l.splits[0] for l in laps if l.splits and len(l.splits) > 0] or [0])
    best_s2 = min([l.splits[1] for l in laps if l.splits and len(l.splits) > 1] or [0])
    best_s3 = min([l.splits[2] for l in laps if l.splits and len(l.splits) > 2] or [0])
    ideal_lap = best_s1 + best_s2 + best_s3

    # Local Record Comparison
    local_record = db.query(func.min(models.SessionResult.best_lap))\
        .filter(models.SessionResult.track_name == session.track_name, 
                models.SessionResult.car_model == session.car_model)\
        .scalar()

    # Telemetry for charts (Best Lap)
    best_lap_obj = db.query(models.LapTime).filter(
        models.LapTime.session_id == session_id, 
        models.LapTime.time == session.best_lap, 
        models.LapTime.valid == True
    ).first()
    best_telemetry = _coerce_json_value(best_lap_obj.telemetry_data) if best_lap_obj else None

    # 2. PDF Document Setup
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    
    brand_dark = colors.HexColor("#1e293b")
    brand_blue = colors.HexColor("#3b82f6")
    brand_success = colors.HexColor("#22c55e")
    bg_light = colors.HexColor("#f8fafc")
    text_muted = colors.HexColor("#64748b")
    
    style_report_title = ParagraphStyle('ReportTitle', parent=styles['Heading1'], fontSize=28, textColor=colors.white, spaceAfter=5, fontName="Helvetica-Bold")
    style_report_subtitle = ParagraphStyle('ReportSubtitle', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor("#94a3b8"), spaceAfter=0)
    style_card_label = ParagraphStyle('CardLabel', parent=styles['Normal'], fontSize=8, textColor=text_muted, fontName="Helvetica-Bold", leading=10, spaceAfter=2)
    style_card_value = ParagraphStyle('CardValue', parent=styles['Normal'], fontSize=12, textColor=brand_dark, fontName="Helvetica-Bold", leading=14)
    style_section_title = ParagraphStyle('SectionTitle', parent=styles['Heading2'], fontSize=14, textColor=brand_dark, spaceBefore=20, spaceAfter=15, fontName="Helvetica-Bold")
    
    elements = []

    # 3. HEADER & TITLE
    logo_path = os.path.join(REPO_ROOT, "frontend", "public", "logo.png")
    logo_img = None
    if os.path.exists(logo_path):
        try: logo_img = Image(logo_path, width=2.5*cm, height=2.5*cm, kind='proportional')
        except: pass

    title_box = [
        Paragraph("PERFORMANCE REPORT", style_report_title),
        Paragraph("ASSETTO MANAGER - PROFESSIONAL RACING EDITION", style_report_subtitle)
    ]
    
    header_table = Table([[logo_img, title_box]], colWidths=[3.5*cm, 14.5*cm])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), brand_dark),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 20),
        ('TOPPADDING', (0, 0), (-1, -1), 25),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 25),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 1*cm))

    # 4. SUMMARY INFO GRID (Modified with Local Record)
    def make_card(label, value, highlight=False):
        style = ParagraphStyle('CardVal', parent=style_card_value, textColor=brand_blue if highlight else brand_dark)
        return Table([
            [Paragraph(label.upper(), style_card_label)],
            [Paragraph(str(value), style)]
        ], colWidths=[4.2*cm])

    # Find Track Map
    track_map_img = None
    mods_dir = STORAGE_DIR / "mods"
    if mods_dir.exists():
        for mod_folder in os.listdir(mods_dir):
            if session.track_name.lower() in mod_folder.lower():
                mod_path = mods_dir / mod_folder
                for root, dirs, files in os.walk(mod_path):
                    for file in files:
                        if file.lower() in ["map.png", "map.jpg"]:
                            try: track_map_img = Image(os.path.join(root, file), width=3*cm, height=3*cm, kind='proportional')
                            except: pass
                            break
                    if track_map_img: break
            if track_map_img: break

    info_cards = Table([
        [make_card("Piloto", session.driver_name), make_card("Vehículo", session.car_model), make_card("Mejor Vuelta", format_ms(session.best_lap), True)],
        [make_card("Circuito", session.track_name), make_card("Local Record", format_ms(local_record), True), make_card("Consistencia", f"{consistency:.1f}%", True)]
    ], colWidths=[4.7*cm, 4.7*cm, 4.7*cm])
    info_cards.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg_light),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('grid', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    # Top layout with Map and Cards (QR removed)
    summary_layout = Table([[track_map_img, info_cards]], colWidths=[4*cm, 14*cm])
    summary_layout.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (0,0), (0,0), 'LEFT'), ('ALIGN', (1,0), (1,0), 'RIGHT')]))
    elements.append(summary_layout)
    elements.append(Spacer(1, 0.5*cm))

    # 5. CHARTS (NEW) - Lap Evolution & Telemetry
    charts_table_data = []
    
    # Chart A: Lap Evolution
    try:
        plt.figure(figsize=(5, 3), dpi=100)
        plt.plot(range(1, len(lap_times) + 1), [t/1000 for t in lap_times], marker='o', color='#3b82f6', linewidth=2, markersize=4)
        plt.axhline(y=session.best_lap/1000, color='#22c55e', linestyle='--', linewidth=1, label='Best')
        plt.title("Evolución de Carrera", fontsize=11, fontweight='bold', color='#1e293b')
        plt.xlabel("Vuelta", fontsize=9)
        plt.ylabel("Tiempo (s)", fontsize=9)
        plt.grid(True, linestyle='--', alpha=0.3)
        plt.tight_layout()
        chart_buf = io.BytesIO()
        plt.savefig(chart_buf, format='png', transparent=True)
        plt.close()
        chart_buf.seek(0)
        evo_img = Image(chart_buf, width=8.5*cm, height=5*cm)
    except: evo_img = Paragraph("Gráfico no disponible", styles['Normal'])

    # Chart B: Speed Profile (Best Lap)
    try:
        if best_telemetry:
            points = [p['n'] * 100 for p in best_telemetry]
            speeds = [p['s'] for p in best_telemetry]
            plt.figure(figsize=(5, 3), dpi=100)
            plt.fill_between(points, speeds, color='#3b82f6', alpha=0.15)
            plt.plot(points, speeds, color='#3b82f6', linewidth=1.5)
            plt.title("Perfil de Velocidad (Mejor Vuelta)", fontsize=11, fontweight='bold', color='#1e293b')
            plt.xlabel("Posición Pista (%)", fontsize=9)
            plt.ylabel("Velocidad (km/h)", fontsize=9)
            plt.grid(True, linestyle='--', alpha=0.3)
            plt.tight_layout()
            tel_buf = io.BytesIO()
            plt.savefig(tel_buf, format='png', transparent=True)
            plt.close()
            tel_buf.seek(0)
            tel_img = Image(tel_buf, width=8.5*cm, height=5*cm)
        else: tel_img = Paragraph("Telemetría no grabada", styles['Normal'])
    except: tel_img = Paragraph("Gráfico no disponible", styles['Normal'])

    charts_table = Table([[evo_img, tel_img]], colWidths=[9*cm, 9*cm])
    elements.append(charts_table)
    elements.append(Spacer(1, 0.5*cm))

    # 6. LAP DETAIL (Same as before but professional)
    elements.append(Paragraph("ANÁLISIS TÉCNICO DE VUELTAS", style_section_title))
    lap_data = [["LAP", "TIEMPO", "SECTOR 1", "SECTOR 2", "SECTOR 3"]]
    for lap in laps:
        s1, s2, s3 = "--", "--", "--"
        if lap.splits:
            splits = lap.splits if isinstance(lap.splits, list) else []
            if len(splits) > 0: s1 = format_ms(splits[0])
            if len(splits) > 1: s2 = format_ms(splits[1])
            if len(splits) > 2: s3 = format_ms(splits[2])
        lap_data.append([str(lap.lap_number), format_ms(lap.time), s1, s2, s3])

    t_laps = Table(lap_data, colWidths=[2*cm, 4*cm, 4*cm, 4*cm, 4*cm])
    t_style = [
        ('BACKGROUND', (0, 0), (-1, 0), brand_dark),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('LINEBELOW', (0, 0), (-1, 0), 2, brand_blue),
    ]
    for i in range(1, len(lap_data)):
        if i % 2 == 0: t_style.append(('BACKGROUND', (0, i), (-1, i), bg_light))
        lap_obj = laps[i-1]
        if lap_obj.time == session.best_lap:
            t_style.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor("#fef9c3")))
            t_style.append(('TEXTCOLOR', (1, i), (1, i), brand_blue))
            t_style.append(('FONTNAME', (1, i), (1, i), 'Helvetica-Bold'))
        if lap_obj.splits:
            best_color = brand_success
            if len(lap_obj.splits) > 0 and lap_obj.splits[0] == best_s1: t_style.append(('TEXTCOLOR', (2, i), (2, i), best_color))
            if len(lap_obj.splits) > 1 and lap_obj.splits[1] == best_s2: t_style.append(('TEXTCOLOR', (3, i), (3, i), best_color))
            if len(lap_obj.splits) > 2 and lap_obj.splits[2] == best_s3: t_style.append(('TEXTCOLOR', (4, i), (4, i), best_color))
    t_laps.setStyle(TableStyle(t_style))
    elements.append(t_laps)
    
    # 7. FOOTER
    elements.append(Spacer(1, 1*cm))
    id_lap_text = f"Vuelta Ideal Calculada: {format_ms(ideal_lap)} | Potencial de mejora: {format_ms(session.best_lap - ideal_lap)}"
    elements.append(Paragraph(id_lap_text, ParagraphStyle('Ideal', parent=styles['Normal'], fontSize=9, textColor=brand_blue, alignment=1, fontName="Helvetica-Bold")))
    elements.append(Spacer(1, 1*cm))
    footer_text = f"Reporte técnico Assetto Manager v2.5 - {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    elements.append(Paragraph(footer_text, ParagraphStyle('Foot', parent=styles['Normal'], fontSize=7, textColor=text_muted, alignment=1)))

    doc.build(elements)
    buffer.seek(0)
    filename = f"Reporte_Full_{session.driver_name.replace(' ', '_')}_{session_id}.pdf"
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})


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
        # Find the actual ID of the best lap for this session
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

    # 8. Get Driver Stats
    driver_obj = db.query(models.Driver).filter(models.Driver.name == driver_name).first()
    
    if not driver_obj:
        driver_obj = models.Driver(name=driver_name, elo_rating=1200.0)
        db.add(driver_obj)
        db.commit()
        db.refresh(driver_obj)

    from pathlib import Path
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

@router.post("/seed", dependencies=[Depends(require_admin)])
def seed_data(
    count: int = 50, 
    db: Session = Depends(database.get_db)
):
    import os
    if os.getenv("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=404, detail="Not found")
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
    
    sessions = query.order_by(desc(models.SessionResult.date)).limit(limit).all()
    
    # Fill best_lap_id for each session
    results = []
    for s in sessions:
        # Find the actual ID of the best lap
        best_lap_obj = db.query(models.LapTime).filter(
            models.LapTime.session_id == s.id,
            models.LapTime.valid == True
        ).order_by(asc(models.LapTime.time)).first()
        
        # Pydantic conversion with extra field
        # Use schemas.SessionResult.from_orm(s) and then add the field
        session_data = schemas.SessionResult.from_orm(s)
        session_data.best_lap_id = best_lap_obj.id if best_lap_obj else None
        results.append(session_data)
        
    return results

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

def _classify_car_category(car_model: str) -> str:
    """
    Heuristics to group cars into categories for TV Display.
    """
    model = car_model.lower()
    
    # Priority Categories
    if "f1" in model or "formula" in model or "tatuus" in model or "rss" in model: 
        return "Formula"
    if "gt3" in model: 
        return "GT3"
    if "gt4" in model: 
        return "GT4"
    if "lmp" in model or "prototype" in model or "hypercar" in model: 
        return "Prototype"
    if "drift" in model or "e30" in model: 
        return "Drift"
    if "rally" in model or "wrc" in model: 
        return "Rally"
    if "cup" in model or "mx5" in model or "clio" in model: 
        return "Cup"
    if "kart" in model: 
        return "Karting"
    if "jdm" in model or "nissan" in model or "toyota" in model or "honda" in model:
        return "JDM / Tuner"
        
    return "Road Cars" # Default fallback

@router.get("/hall_of_fame/categories", response_model=List[schemas.HallOfFameCategory])
def get_hall_of_fame_categories(db: Session = Depends(database.get_db)):
    """
    Aggregated Hall of Fame for TV Mode.
    Groups records by Track + Category (instead of specific Car Model).
    """
    # 1. Get all valid laps joined with session info
    # We want to process this in python for flexibility with the regex categories,
    # avoiding complex SQL case statements.
    
    # Optimization: Query distinct (Track, Car, Driver, Time) first?
    # No, let's just grab the best lap PER (Driver, Track, Car) first to reduce dataset
    
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
    
    # 2. Group in Python
    grouped_data = {} # Key: (track_name, category) -> List of records
    
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
            "precise_car": car # Keep specific car for display if needed
        })
        
    # 3. Sort and Limit per group
    final_output = []
    
    for key, records in grouped_data.items():
        track, category = key
        
        # Sort by time ASC
        records.sort(key=lambda x: x["lap_time"])
        
        # Take Top 5 for TV
        top_records = records[:5]
        
        # Convert to Schema
        schema_records = [
            schemas.HallOfFameEntry(
                driver_name=r["driver_name"],
                lap_time=r["lap_time"],
                date=r["date"]
            ) for r in top_records
        ]
        
        final_output.append(schemas.HallOfFameCategory(
            track_name=track,
            car_model=category, # We send Category as "Car Model" for the schema to reuse it
            records=schema_records
        ))
        
    # Sort groups by Track Name then Category
    final_output.sort(key=lambda x: (x.track_name, x.car_model))
    
    return final_output

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
            else:
                # Placeholder for driver with no data
                drivers_stats.append(schemas.ComparisonStats(
                    driver_name=driver,
                    best_lap=0,
                    total_laps=0,
                    consistency=0.0,
                    win_count=0
                ))
        
        if len(drivers_stats) < 1:
            raise HTTPException(status_code=404, detail="No valid drivers selected")

        # Sort by Best Lap (Fastest first, but no-data at the end)
        drivers_stats.sort(key=lambda x: x.best_lap if x.best_lap > 0 else 999999999)

        # Calculate Win Counts / Highlights
        # Only active drivers with actual laps can win
        active_drivers = [d for d in drivers_stats if d.total_laps > 0]
        
        if active_drivers:
            # 1. Best Lap: Index 0 of sorted active
            active_drivers[0].win_count += 1
                
            # 2. Consistency: Find min consistency
            best_consistency = min(active_drivers, key=lambda x: x.consistency)
            best_consistency.win_count += 1
            
            # 3. Total Laps: Find max laps
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
@router.get("/coach/{lap_id}", response_model=schemas.CoachAnalysis)
def get_lap_coach_analysis(lap_id: int, db: Session = Depends(database.get_db)):
    """
    Automated driving coach. Compares a lap against the all-time best for that car/track.
    """
    # 1. Get User Lap
    user_lap = db.query(models.LapTime).filter(models.LapTime.id == lap_id).first()
    if not user_lap:
        raise HTTPException(status_code=404, detail="Lap not found")
    
    # 2. Get Best Reference Lap (Ghost)
    # Filter by track and car, grab the fastest valid one excluding the current lap
    ghost_lap = db.query(models.LapTime).join(models.SessionResult).filter(
        models.SessionResult.track_name == user_lap.session.track_name,
        models.SessionResult.car_model == user_lap.session.car_model,
        models.LapTime.valid == True,
        models.LapTime.id != user_lap.id
    ).order_by(asc(models.LapTime.time)).first()
    
    # Fallback: if no other lap, use itself but tips will be empty (or we can find another car)
    if not ghost_lap:
        # Try finding a lap with DIFFERENT car but same track as second fallback? 
        # For now, let's just return no tips if solo.
        ghost_lap = user_lap 

    # 3. Load Telemetry
    user_tel = _coerce_json_value(user_lap.telemetry_data) or []
    ghost_tel = _coerce_json_value(ghost_lap.telemetry_data) or []
    
    if not user_tel or not ghost_tel:
         return schemas.CoachAnalysis(
            lap_id=lap_id,
            reference_lap_id=ghost_lap.id,
            driver_name=user_lap.session.driver_name,
            reference_driver_name=ghost_lap.session.driver_name,
            track_name=user_lap.session.track_name,
            car_model=user_lap.session.car_model,
            lap_time=user_lap.time,
            reference_time=ghost_lap.time,
            time_gap=user_lap.time - ghost_lap.time,
            tips=[],
            user_telemetry=[],
            ghost_telemetry=[]
        )

    # 4. Normalize and Analysis
    # Divide track into 100 buckets by 'n' (0.0 to 1.0)
    NUM_BUCKETS = 100
    user_buckets = [[] for _ in range(NUM_BUCKETS)]
    ghost_buckets = [[] for _ in range(NUM_BUCKETS)]
    
    for p in user_tel:
        idx = min(int(p.get('n', 0) * NUM_BUCKETS), NUM_BUCKETS - 1)
        user_buckets[idx].append(p.get('s', 0))
    for p in ghost_tel:
        idx = min(int(p.get('n', 0) * NUM_BUCKETS), NUM_BUCKETS - 1)
        ghost_buckets[idx].append(p.get('s', 0))
        
    avg_user = [sum(b)/len(b) if b else 0 for b in user_buckets]
    avg_ghost = [sum(b)/len(b) if b else 0 for b in ghost_buckets]
    
    # Interpolate empty buckets (simple linear)
    def interpolate(data):
        for i in range(len(data)):
            if data[i] == 0:
                prev_v = next((v for v in reversed(data[:i]) if v > 0), 0)
                next_v = next((v for v in data[i+1:] if v > 0), prev_v)
                data[i] = (prev_v + next_v) / 2
        return data

    avg_user = interpolate(avg_user)
    avg_ghost = interpolate(avg_ghost)
    
    tips = []
    
    # Simple Pattern Matching for Tips
    for i in range(1, NUM_BUCKETS - 1):
        u_speed = avg_user[i]
        g_speed = avg_ghost[i]
        diff = u_speed - g_speed
        
        # Tip Thresholds
        if diff < -15: # 15km/h slower is significant
            pos = i / NUM_BUCKETS
            
            # Check for "Braking Too Early"
            # If ghost is still fast but user is already slowing down
            if avg_ghost[i] > 200 and avg_user[i] < avg_user[i-1] - 5:
                if not any(t.type == "braking" and abs(t.position_normalized - pos) < 0.1 for t in tips):
                    tips.append(schemas.CoachTip(
                        type="braking",
                        severity="high" if diff < -30 else "medium",
                        message=f"Estás frenando demasiado pronto. Puedes ganar tiempo retrasando la frenada aquí.",
                        position_normalized=pos,
                        delta_value=diff
                    ))
            
            # Check for "Fast Corner/Apex Speed"
            # If both are slow (cornering) but user is much slower
            elif avg_ghost[i] < 150 and diff < -20:
                if not any(t.type == "apex" and abs(t.position_normalized - pos) < 0.05 for t in tips):
                    tips.append(schemas.CoachTip(
                        type="apex",
                        severity="medium",
                        message=f"Tu velocidad en el vértice es baja. Intenta mantener más inercia en la curva.",
                        position_normalized=pos,
                        delta_value=diff
                    ))
            
            # Check for "Exit Speed"
            # If speed is rising but user is lagging behind ghost's acceleration
            elif avg_user[i] > avg_user[i-1] + 2 and diff < -10:
                if not any(t.type == "exit" and abs(t.position_normalized - pos) < 0.1 for t in tips):
                    tips.append(schemas.CoachTip(
                        type="exit",
                        severity="medium",
                        message=f"Salida lenta. Aplica el acelerador antes o con más decisión al salir de la curva.",
                        position_normalized=pos,
                        delta_value=diff
                    ))

    # Limit tips to the best 5 to avoid overwhelming the user
    tips = sorted(tips, key=lambda x: abs(x.delta_value), reverse=True)[:5]
    
    # Simplified telemetry for the frontend chart (fewer points)
    resample = 100
    user_chart = [{"n": round(p.get('n',0), 2), "s": p.get('s',0)} for i, p in enumerate(user_tel) if i % (len(user_tel)//resample or 1) == 0]
    ghost_chart = [{"n": round(p.get('n',0), 2), "s": p.get('s',0)} for i, p in enumerate(ghost_tel) if i % (len(ghost_tel)//resample or 1) == 0]

    return schemas.CoachAnalysis(
        lap_id=lap_id,
        reference_lap_id=ghost_lap.id,
        driver_name=user_lap.session.driver_name,
        reference_driver_name=ghost_lap.session.driver_name,
        track_name=user_lap.session.track_name,
        car_model=user_lap.session.car_model,
        lap_time=user_lap.time,
        reference_time=ghost_lap.time,
        time_gap=user_lap.time - ghost_lap.time,
        tips=tips,
        user_telemetry=user_chart,
        ghost_telemetry=ghost_chart
    )
