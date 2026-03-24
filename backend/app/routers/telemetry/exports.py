# Telemetry Exports Module
# Handles PDF generation, lap telemetry JSON, track maps, and coach analysis

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, asc
from typing import Optional
from datetime import datetime
import os
import io
import math

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.units import cm

from ... import models, schemas, database
from ...paths import PUBLIC_STORAGE_DIR, REPO_ROOT
from .base import _coerce_json_value, calculate_consistency_score, format_ms, logger

router = APIRouter(tags=["telemetry-exports"])


def _get_matplotlib():
    try:
        import matplotlib.pyplot as plt
        plt.switch_backend("agg")
        return plt
    except Exception:
        return None


@router.get("/lap/{lap_id}/telemetry")
def get_lap_telemetry(lap_id: int, db: Session = Depends(database.get_db)):
    """Get the heavy JSON telemetry trace for a specific lap."""
    lap = db.query(models.LapTime).filter(models.LapTime.id == lap_id).first()
    if not lap:
        raise HTTPException(status_code=404, detail="Lap not found")

    if not lap.telemetry_data:
        # Generate mock telemetry
        telemetry_trace = []
        num_points = 400
        
        monza_layout = [
            ('straight', 800), ('turn', 45, 100), ('turn', -45, 100),
            ('turn', 90, 300),
            ('straight', 400),
            ('turn', 90, 150), ('straight', 100), ('turn', 60, 150),
            ('straight', 600),
            ('turn', -60, 150), ('turn', 60, 150),
            ('straight', 800),
            ('turn', 180, 250),
            ('straight', 200)
        ]
        
        layout = []
        t_name = lap.session.track_name.lower() if lap.session else "unknown"
        if 'monza' in t_name: 
            layout = monza_layout
        else: 
            layout = [
                ('straight', 200),
                ('turn', 180, 200),
                ('straight', 400),
                ('turn', 180, 200),
                ('straight', 200)
            ]

        path_points = []
        x, z, rot = 0, 0, 0
        total_dist = 0
        
        for segment in layout:
            seg_type = segment[0]
            if seg_type == 'straight':
                dist = segment[1]
                steps = int(dist / 10)
                for _ in range(steps):
                    x += math.sin(rot) * 10 
                    z += math.cos(rot) * 10
                    path_points.append({'x': x, 'z': z, 'rot': rot, 'type': 'straight'})
                    total_dist += 10
            elif seg_type == 'turn':
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
                    
        real_lap_time = lap.time if lap.time else 100000
        
        path_len = len(path_points)
        for i in range(num_points):
            idx = int((i / num_points) * path_len)
            p = path_points[min(idx, path_len-1)]
            
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
    
    import json
    data = _coerce_json_value(lap.telemetry_data) or []
    content = json.dumps(data, indent=2)
    filename = f"telemetry_{lap_id}.json"
    
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/session/{session_id}/pdf")
def get_session_pdf(session_id: int, db: Session = Depends(database.get_db)):
    """Generate a high-end professional PDF report for a session."""
    session = db.query(models.SessionResult).filter(models.SessionResult.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    laps = db.query(models.LapTime).filter(models.LapTime.session_id == session_id, models.LapTime.valid == True).order_by(models.LapTime.lap_number).all()
    if not laps:
        raise HTTPException(status_code=404, detail="No valid laps found for this session")

    lap_times = [l.time for l in laps]
    consistency = calculate_consistency_score(lap_times)
    
    best_s1 = min([l.splits[0] for l in laps if l.splits and len(l.splits) > 0] or [0])
    best_s2 = min([l.splits[1] for l in laps if l.splits and len(l.splits) > 1] or [0])
    best_s3 = min([l.splits[2] for l in laps if l.splits and len(l.splits) > 2] or [0])
    ideal_lap = best_s1 + best_s2 + best_s3

    local_record = db.query(func.min(models.SessionResult.best_lap))\
        .filter(models.SessionResult.track_name == session.track_name, 
                models.SessionResult.car_model == session.car_model)\
        .scalar()

    best_lap_obj = db.query(models.LapTime).filter(
        models.LapTime.session_id == session_id, 
        models.LapTime.time == session.best_lap, 
        models.LapTime.valid == True
    ).first()
    best_telemetry = _coerce_json_value(best_lap_obj.telemetry_data) if best_lap_obj else None

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

    logo_path = os.path.join(REPO_ROOT, "frontend", "public", "logo.png")
    logo_img = None
    if os.path.exists(logo_path):
        try: logo_img = Image(logo_path, width=2.5*cm, height=2.5*cm, kind='proportional')
        except Exception: pass

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

    def make_card(label, value, highlight=False):
        style = ParagraphStyle('CardVal', parent=style_card_value, textColor=brand_blue if highlight else brand_dark)
        return Table([
            [Paragraph(label.upper(), style_card_label)],
            [Paragraph(str(value), style)]
        ], colWidths=[4.2*cm])

    track_map_img = None
    mods_dir = PUBLIC_STORAGE_DIR / "mods"
    if mods_dir.exists():
        for mod_folder in os.listdir(mods_dir):
            if session.track_name.lower() in mod_folder.lower():
                mod_path = mods_dir / mod_folder
                for root, dirs, files in os.walk(mod_path):
                    for file in files:
                        if file.lower() in ["map.png", "map.jpg"]:
                            try: track_map_img = Image(os.path.join(root, file), width=3*cm, height=3*cm, kind='proportional')
                            except Exception: pass
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

    summary_layout = Table([[track_map_img, info_cards]], colWidths=[4*cm, 14*cm])
    summary_layout.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (0,0), (0,0), 'LEFT'), ('ALIGN', (1,0), (1,0), 'RIGHT')]))
    elements.append(summary_layout)
    elements.append(Spacer(1, 0.5*cm))

    charts_table_data = []

    plt = _get_matplotlib()
    if not plt:
        evo_img = Paragraph("Gr?fico no disponible (matplotlib no instalado)", styles['Normal'])
        tel_img = Paragraph("Gr?fico no disponible (matplotlib no instalado)", styles['Normal'])
    else:
        try:
            plt.figure(figsize=(5, 3), dpi=100)
            plt.plot(range(1, len(lap_times) + 1), [t/1000 for t in lap_times], marker='o', color='#3b82f6', linewidth=2, markersize=4)
            plt.axhline(y=session.best_lap/1000, color='#22c55e', linestyle='--', linewidth=1, label='Best')
            plt.title("Evoluci?n de Carrera", fontsize=11, fontweight='bold', color='#1e293b')
            plt.xlabel("Vuelta", fontsize=9)
            plt.ylabel("Tiempo (s)", fontsize=9)
            plt.grid(True, linestyle='--', alpha=0.3)
            plt.tight_layout()
            chart_buf = io.BytesIO()
            plt.savefig(chart_buf, format='png', transparent=True)
            plt.close()
            chart_buf.seek(0)
            evo_img = Image(chart_buf, width=8.5*cm, height=5*cm)
        except:
            evo_img = Paragraph("Gr?fico no disponible", styles['Normal'])

        try:
            if best_telemetry:
                points = [p['n'] * 100 for p in best_telemetry]
                speeds = [p['s'] for p in best_telemetry]
                plt.figure(figsize=(5, 3), dpi=100)
                plt.fill_between(points, speeds, color='#3b82f6', alpha=0.15)
                plt.plot(points, speeds, color='#3b82f6', linewidth=1.5)
                plt.title("Perfil de Velocidad (Mejor Vuelta)", fontsize=11, fontweight='bold', color='#1e293b')
                plt.xlabel("Posici?n Pista (%)", fontsize=9)
                plt.ylabel("Velocidad (km/h)", fontsize=9)
                plt.grid(True, linestyle='--', alpha=0.3)
                plt.tight_layout()
                tel_buf = io.BytesIO()
                plt.savefig(tel_buf, format='png', transparent=True)
                plt.close()
                tel_buf.seek(0)
                tel_img = Image(tel_buf, width=8.5*cm, height=5*cm)
            else:
                tel_img = Paragraph("Telemetr?a no grabada", styles['Normal'])
        except:
            tel_img = Paragraph("Gr?fico no disponible", styles['Normal'])

    charts_table = Table([[evo_img, tel_img]], colWidths=[9*cm, 9*cm])
    elements.append(charts_table)
    elements.append(Spacer(1, 0.5*cm))

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


@router.get("/map/{track_name}")
def get_track_map(track_name: str, db: Session = Depends(database.get_db)):
    """Get track map image for a specific track.

    Returns 204 when there is no available map so the frontend can gracefully
    fall back without polluting logs with avoidable 404s.
    """
    mods_dir = PUBLIC_STORAGE_DIR / "mods"
    if not mods_dir.exists():
        return Response(status_code=204)
        
    for mod_folder in os.listdir(mods_dir):
        if track_name.lower() in mod_folder.lower():
            mod_path = mods_dir / mod_folder
            
            for root, dirs, files in os.walk(mod_path):
                for file in files:
                    if file.lower() in ["map.png", "map.jpg", "preview.png", "preview.jpg"]:
                        return FileResponse(os.path.join(root, file))

    return Response(status_code=204)


@router.get("/coach/{lap_id}", response_model=schemas.CoachAnalysis)
def get_lap_coach_analysis(lap_id: int, db: Session = Depends(database.get_db)):
    """Automated driving coach. Compares a lap against the all-time best for that car/track."""
    user_lap = db.query(models.LapTime).filter(models.LapTime.id == lap_id).first()
    if not user_lap:
        raise HTTPException(status_code=404, detail="Lap not found")
    
    ghost_lap = db.query(models.LapTime).join(models.SessionResult).filter(
        models.SessionResult.track_name == user_lap.session.track_name,
        models.SessionResult.car_model == user_lap.session.car_model,
        models.LapTime.valid == True,
        models.LapTime.id != user_lap.id
    ).order_by(asc(models.LapTime.time)).first()
    
    if not ghost_lap:
        ghost_lap = user_lap 

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
    
    for i in range(1, NUM_BUCKETS - 1):
        u_speed = avg_user[i]
        g_speed = avg_ghost[i]
        diff = u_speed - g_speed
        
        if diff < -15:
            pos = i / NUM_BUCKETS
            
            if avg_ghost[i] > 200 and avg_user[i] < avg_user[i-1] - 5:
                if not any(t.type == "braking" and abs(t.position_normalized - pos) < 0.1 for t in tips):
                    tips.append(schemas.CoachTip(
                        type="braking",
                        severity="high" if diff < -30 else "medium",
                        message=f"Estás frenando demasiado pronto. Puedes ganar tiempo retrasando la frenada aquí.",
                        position_normalized=pos,
                        delta_value=diff
                    ))
            
            elif avg_ghost[i] < 150 and diff < -20:
                if not any(t.type == "apex" and abs(t.position_normalized - pos) < 0.05 for t in tips):
                    tips.append(schemas.CoachTip(
                        type="apex",
                        severity="medium",
                        message=f"Tu velocidad en el vértice es baja. Intenta mantener más inercia en la curva.",
                        position_normalized=pos,
                        delta_value=diff
                    ))
            
            elif avg_user[i] > avg_user[i-1] + 2 and diff < -10:
                if not any(t.type == "exit" and abs(t.position_normalized - pos) < 0.1 for t in tips):
                    tips.append(schemas.CoachTip(
                        type="exit",
                        severity="medium",
                        message=f"Salida lenta. Aplica el acelerador antes o con más decisión al salir de la curva.",
                        position_normalized=pos,
                        delta_value=diff
                    ))

    tips = sorted(tips, key=lambda x: abs(x.delta_value), reverse=True)[:5]
    
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
