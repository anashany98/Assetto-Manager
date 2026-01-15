"""
PDF Export Router - Generate and download PDF reports
"""
from fastapi import APIRouter, HTTPException, Query
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

router = APIRouter(prefix="/exports", tags=["exports"])

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
        # Get driver profile
        profile = db.query(models.Profile).filter(models.Profile.name == driver_name).first()
        
        # Get driver's best laps
        best_laps = db.query(models.LapTime).filter(
            models.LapTime.driver_name == driver_name
        ).order_by(models.LapTime.lap_time.asc()).limit(10).all()
        
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
            if hasattr(profile, 'loyalty_points'):
                elements.append(Paragraph(f"Puntos de Fidelidad: {profile.loyalty_points or 0}", styles['Normal']))
        
        elements.append(Spacer(1, 20))
        
        # Best Laps Section
        elements.append(Paragraph("📊 MEJORES TIEMPOS", section_title))
        
        if best_laps:
            table_data = [['#', 'Circuito', 'Coche', 'Tiempo', 'Fecha']]
            for i, lap in enumerate(best_laps, 1):
                table_data.append([
                    str(i),
                    lap.track_name[:20] if lap.track_name else 'N/A',
                    lap.car_model[:20] if lap.car_model else 'N/A',
                    format_lap_time(lap.lap_time),
                    lap.timestamp.strftime('%d/%m/%Y') if lap.timestamp else 'N/A'
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
        query = db.query(models.LapTime)
        
        if track_name:
            query = query.filter(models.LapTime.track_name == track_name)
        
        # Get best time per driver
        from sqlalchemy import func
        subquery = db.query(
            models.LapTime.driver_name,
            func.min(models.LapTime.lap_time).label('best_time')
        ).group_by(models.LapTime.driver_name).subquery()
        
        entries = db.query(models.LapTime).join(
            subquery,
            (models.LapTime.driver_name == subquery.c.driver_name) &
            (models.LapTime.lap_time == subquery.c.best_time)
        ).order_by(models.LapTime.lap_time.asc()).limit(limit).all()
        
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
            best_time = entries[0].lap_time if entries else 0
            
            for i, entry in enumerate(entries, 1):
                gap = entry.lap_time - best_time
                gap_str = '-' if gap == 0 else f"+{gap/1000:.3f}s"
                
                table_data.append([
                    str(i),
                    entry.driver_name[:25],
                    entry.car_model[:25] if entry.car_model else 'N/A',
                    format_lap_time(entry.lap_time),
                    gap_str,
                    entry.timestamp.strftime('%d/%m/%Y') if entry.timestamp else 'N/A'
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
        
        # Get session results
        results = db.query(models.SessionResult).filter(
            models.SessionResult.event_id == event_id
        ).order_by(models.SessionResult.position.asc()).all()
        
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
            
            for r in results:
                table_data.append([
                    str(r.position) if r.position else '-',
                    r.driver_name[:25] if r.driver_name else 'N/A',
                    format_lap_time(r.best_lap) if r.best_lap else '--:--.---',
                    str(r.laps) if r.laps else '0'
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
