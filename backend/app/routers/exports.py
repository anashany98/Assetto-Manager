"""
PDF Export Router - Generate and download PDF reports
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.pdfgen import canvas
import qrcode

from .. import database, models
from sqlalchemy.orm import Session
from datetime import datetime
import urllib.parse
from ..routers.auth import require_admin

router = APIRouter(prefix="/exports", tags=["exports"], dependencies=[Depends(require_admin)])

# Helper to format lap time
def format_lap_time(ms: int) -> str:
    if ms <= 0:
        return "--:--.---"
    minutes = ms // 60000
    seconds = (ms % 60000) // 1000
    millis = ms % 1000
    return f"{minutes}:{seconds:02d}.{millis:03d}"


# Helper to generate QR code as BytesIO image
def generate_qr_code(data: str, size: int = 100) -> BytesIO:
    """Generate a QR code image as BytesIO buffer"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer


@router.get("/passport/{driver_name}")
async def export_driver_passport(driver_name: str):
    """
    Generate a PDF passport/certificate for a driver showing their stats and records.
    """
    db: Session = database.SessionLocal()
    try:
        # Get driver profile (from Driver model)
        profile = db.query(models.Driver).filter(models.Driver.name == driver_name).first()
        
        # Get driver's best laps (join SessionResult for metadata)
        best_laps = (
            db.query(models.LapTime, models.SessionResult)
            .join(models.SessionResult, models.LapTime.session_id == models.SessionResult.id)
            .filter(
                models.SessionResult.driver_name == driver_name,
                models.LapTime.valid == True
            )
            .order_by(models.LapTime.time.asc())
            .limit(10)
            .all()
        )
        
        # Create PDF buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=28,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=20,
            alignment=1  # Center
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Normal'],
            fontSize=12,
            textColor=colors.gray,
            spaceAfter=30,
            alignment=1
        )
        
        section_title = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#374151'),
            spaceAfter=10,
            spaceBefore=20
        )
        
        # Title
        elements.append(Paragraph("🏎️ PASAPORTE DEL PILOTO", title_style))
        elements.append(Paragraph(f"Documento oficial de acreditación - {datetime.now().strftime('%d/%m/%Y')}", subtitle_style))
        
        # Driver info
        elements.append(Paragraph(f"<b>NOMBRE:</b> {driver_name.upper()}", styles['Heading2']))
        
        if profile:
            elements.append(Paragraph(f"Miembro desde: {profile.created_at.strftime('%d/%m/%Y') if profile.created_at else 'N/A'}", styles['Normal']))
            elements.append(Paragraph(f"Puntos de Fidelidad: {profile.loyalty_points or 0}", styles['Normal']))
        
        elements.append(Spacer(1, 20))
        
        # Best Laps Section
        elements.append(Paragraph("📊 MEJORES TIEMPOS", section_title))
        
        if best_laps:
            table_data = [['#', 'Circuito', 'Coche', 'Tiempo', 'Fecha']]
            for i, (lap, session) in enumerate(best_laps, 1):
                table_data.append([
                    str(i),
                    (session.track_name or 'N/A')[:20],
                    (session.car_model or 'N/A')[:20],
                    format_lap_time(lap.time),
                    session.date.strftime('%d/%m/%Y') if session.date else 'N/A'
                ])
            
            table = Table(table_data, colWidths=[1*cm, 5*cm, 5*cm, 3*cm, 3*cm])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('TOPPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f3f4f6')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
            ]))
            elements.append(table)
        else:
            elements.append(Paragraph("Sin tiempos registrados todavía.", styles['Normal']))
        
        elements.append(Spacer(1, 30))
        
        # QR Code Section
        qr_url = f"/passport-scanner?driver={urllib.parse.quote(driver_name)}"
        qr_buffer = generate_qr_code(qr_url)
        qr_image = Image(qr_buffer, width=3*cm, height=3*cm)
        
        # Center QR with caption
        qr_caption = ParagraphStyle(
            'QRCaption',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#4b5563'),
            alignment=1,
            spaceBefore=5
        )
        elements.append(qr_image)
        elements.append(Paragraph("📱 Escanea para ver el pasaporte digital", qr_caption))
        
        elements.append(Spacer(1, 20))
        
        # Footer
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.gray,
            alignment=1
        )
        elements.append(Paragraph("Documento generado automáticamente por AC Manager", footer_style))
        elements.append(Paragraph("Este certificado acredita la participación del piloto en nuestras instalaciones.", footer_style))
        
        # Build PDF
        doc.build(elements)
        
        buffer.seek(0)
        
        filename = f"pasaporte_{driver_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    finally:
        db.close()


@router.get("/leaderboard")
async def export_leaderboard(
    track_name: str = Query(None, description="Filter by track"),
    limit: int = Query(20, description="Number of entries")
):
    """
    Generate a PDF leaderboard for a specific track.
    """
    db: Session = database.SessionLocal()
    try:
        from sqlalchemy import func
        filters = [models.LapTime.valid == True]
        if track_name:
            filters.append(models.SessionResult.track_name == track_name)

        subquery = db.query(
            models.SessionResult.driver_name.label("driver_name"),
            func.min(models.LapTime.time).label("best_time")
        ).join(
            models.SessionResult,
            models.LapTime.session_id == models.SessionResult.id
        ).filter(*filters).group_by(models.SessionResult.driver_name).subquery()
        
        entries = (
            db.query(models.LapTime, models.SessionResult)
            .join(models.SessionResult, models.LapTime.session_id == models.SessionResult.id)
            .join(
                subquery,
                (models.SessionResult.driver_name == subquery.c.driver_name) &
                (models.LapTime.time == subquery.c.best_time)
            )
            .filter(*filters)
            .order_by(models.LapTime.time.asc())
            .limit(limit)
            .all()
        )
        
        # Create PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), topMargin=1.5*cm, bottomMargin=1.5*cm)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#eab308'),
            spaceAfter=5,
            alignment=1
        )
        
        elements.append(Paragraph("🏆 CLASIFICACIÓN OFICIAL", title_style))
        if track_name:
            elements.append(Paragraph(f"Circuito: {track_name.upper()}", styles['Heading3']))
        elements.append(Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles['Normal']))
        elements.append(Spacer(1, 15))
        
        # Table
        if entries:
            table_data = [['POS', 'PILOTO', 'COCHE', 'TIEMPO', 'GAP', 'FECHA']]
            best_time = entries[0][0].time if entries else 0
            
            for i, (lap, session) in enumerate(entries, 1):
                gap = lap.time - best_time
                gap_str = '-' if gap == 0 else f"+{gap/1000:.3f}s"
                
                table_data.append([
                    str(i),
                    (session.driver_name or 'N/A')[:25],
                    (session.car_model or 'N/A')[:25],
                    format_lap_time(lap.time),
                    gap_str,
                    session.date.strftime('%d/%m/%Y') if session.date else 'N/A'
                ])
            
            table = Table(table_data, colWidths=[1.5*cm, 6*cm, 6*cm, 3*cm, 2.5*cm, 3*cm])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#111827')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#eab308')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 11),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                ('TOPPADDING', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#374151')),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                # Highlight podium
                ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#fef3c7')),  # Gold
                ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#f3f4f6')),  # Silver
                ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#fed7aa')),  # Bronze
                ('ROWBACKGROUNDS', (0, 4), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
            ]))
            elements.append(table)
        else:
            elements.append(Paragraph("Sin tiempos registrados.", styles['Normal']))
        
        doc.build(elements)
        buffer.seek(0)
        
        track_suffix = f"_{track_name}" if track_name else ""
        filename = f"leaderboard{track_suffix}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    finally:
        db.close()


@router.get("/event/{event_id}/results")
async def export_event_results(event_id: int):
    """
    Generate a PDF with event results.
    """
    db: Session = database.SessionLocal()
    try:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Get session results (best lap first)
        results = db.query(models.SessionResult).filter(
            models.SessionResult.event_id == event_id,
            models.SessionResult.best_lap > 0
        ).order_by(models.SessionResult.best_lap.asc()).all()
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=22,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=10,
            alignment=1
        )
        
        elements.append(Paragraph("🏁 RESULTADOS OFICIALES", title_style))
        elements.append(Paragraph(f"<b>{event.name}</b>", styles['Heading2']))
        if event.track_name:
            elements.append(Paragraph(f"Circuito: {event.track_name}", styles['Normal']))
        if event.start_date:
            elements.append(Paragraph(f"Fecha: {event.start_date.strftime('%d/%m/%Y')}", styles['Normal']))
        elements.append(Spacer(1, 20))
        
        # Results Table
        if results:
            table_data = [['POS', 'PILOTO', 'MEJOR TIEMPO', 'VUELTAS']]
            
            for idx, r in enumerate(results, 1):
                laps_count = db.query(models.LapTime).filter(models.LapTime.session_id == r.id).count()
                table_data.append([
                    str(idx),
                    r.driver_name[:25] if r.driver_name else 'N/A',
                    format_lap_time(r.best_lap) if r.best_lap else '--:--.---',
                    str(laps_count)
                ])
            
            table = Table(table_data, colWidths=[2*cm, 8*cm, 4*cm, 3*cm])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 11),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
            ]))
            elements.append(table)
        else:
            elements.append(Paragraph("Sin resultados disponibles.", styles['Normal']))
        
        elements.append(Spacer(1, 30))
        elements.append(Paragraph("Documento oficial generado por AC Manager", ParagraphStyle(
            'Footer', parent=styles['Normal'], fontSize=8, textColor=colors.gray, alignment=1
        )))
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"resultados_{event.name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    finally:
        db.close()
