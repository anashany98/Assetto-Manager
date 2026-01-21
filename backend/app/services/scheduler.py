"""
Scheduler Service - Background tasks for automated reminders
Uses APScheduler for periodic task execution
"""
import asyncio
import json
from datetime import datetime, timedelta, date
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

from .. import database, models
from ..services.email_service import send_email
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Scheduler instance
scheduler = AsyncIOScheduler()


def send_booking_reminder(
    customer_email: str,
    customer_name: str,
    date_str: str,
    time_slot: str,
    booking_id: int
):
    """Send reminder email 24h before booking"""
    try:
        subject = f"🔔 Recordatorio: Tu reserva es mañana"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 20px; background-color: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border-radius: 16px; overflow: hidden; border: 1px solid #374151;">
                <div style="padding: 30px; text-align: center; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                    <h1 style="color: white; margin: 0; font-size: 24px;">🔔 ¡Tu reserva es mañana!</h1>
                </div>
                
                <div style="padding: 30px;">
                    <p style="color: #d1d5db; font-size: 16px; margin: 0 0 20px 0;">
                        Hola <strong style="color: white;">{customer_name}</strong>,
                    </p>
                    
                    <p style="color: #9ca3af; font-size: 14px; margin: 0 0 25px 0;">
                        Te recordamos que tienes una reserva mañana. ¡Te esperamos!
                    </p>
                    
                    <div style="background: #374151; border-radius: 12px; padding: 20px; border-left: 4px solid #f59e0b;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="color: #9ca3af; padding: 5px 0; font-size: 12px; text-transform: uppercase;">Fecha</td>
                                <td style="color: white; padding: 5px 0; font-weight: bold; text-align: right;">{date_str}</td>
                            </tr>
                            <tr>
                                <td style="color: #9ca3af; padding: 5px 0; font-size: 12px; text-transform: uppercase;">Hora</td>
                                <td style="color: #22c55e; padding: 5px 0; font-weight: bold; text-align: right; font-size: 18px;">{time_slot}</td>
                            </tr>
                            <tr>
                                <td style="color: #9ca3af; padding: 5px 0; font-size: 12px; text-transform: uppercase;">Nº Reserva</td>
                                <td style="color: #60a5fa; padding: 5px 0; font-weight: bold; text-align: right;">#{booking_id}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="margin-top: 25px; padding: 15px; background: #1e3a5f; border-radius: 8px; text-align: center;">
                        <p style="color: #93c5fd; margin: 0; font-size: 13px;">
                            💡 <strong>Consejo:</strong> Llega 10 minutos antes para prepararte
                        </p>
                    </div>
                </div>
                
                <div style="padding: 20px; background: #0f172a; text-align: center; border-top: 1px solid #374151;">
                    <p style="color: #6b7280; font-size: 11px; margin: 0;">
                        Si no puedes asistir, contáctanos para cancelar o reprogramar.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        plain_content = f"""
        ¡Tu reserva es mañana!
        
        Hola {customer_name},
        
        Te recordamos tu reserva:
        - Fecha: {date_str}
        - Hora: {time_slot}
        - Nº Reserva: #{booking_id}
        
        ¡Te esperamos! Llega 10 minutos antes.
        """
        
        send_email(customer_email, subject, html_content, plain_content)
        logger.info(f"Reminder sent to {customer_email} for booking #{booking_id}")
        
    except Exception as e:
        logger.error(f"Failed to send reminder to {customer_email}: {e}")


async def check_and_send_reminders():
    """Check for bookings tomorrow and send reminders"""
    logger.info("Running booking reminder check...")
    
    db: Session = database.SessionLocal()
    try:
        tomorrow = date.today() + timedelta(days=1)
        
        # Find confirmed bookings for tomorrow that haven't been reminded yet
        bookings = db.query(models.Booking).filter(
            models.Booking.date >= datetime.combine(tomorrow, datetime.min.time()),
            models.Booking.date < datetime.combine(tomorrow + timedelta(days=1), datetime.min.time()),
            models.Booking.status.in_(["pending", "confirmed"]),
            models.Booking.customer_email.isnot(None),
            models.Booking.customer_email != ""
        ).all()
        
        reminders_sent = 0
        for booking in bookings:
            if booking.customer_email:
                send_booking_reminder(
                    customer_email=booking.customer_email,
                    customer_name=booking.customer_name,
                    date_str=booking.date.strftime('%d/%m/%Y') if booking.date else tomorrow.strftime('%d/%m/%Y'),
                    time_slot=booking.time_slot,
                    booking_id=booking.id
                )
                reminders_sent += 1
        
        logger.info(f"Reminder check complete. Sent {reminders_sent} reminders for tomorrow ({tomorrow})")
        
    except Exception as e:
        logger.error(f"Error in reminder check: {e}")
    finally:
        db.close()


from ..routers.websockets import manager as ws_manager

async def sync_station_content():
    """Trigger content scan on all active stations"""
    logger.info("Triggering hourly content sync for active stations...")
    try:
        active_count = 0
        for station_id, ws in ws_manager.active_agents.items():
            try:
                # We need to get the AC path for this station to send it back?
                # The agent knows its path, but the command expects it?
                # Looking at control.py: get_station_content sends "ac_path".
                # We can fetch it from DB.
                db = database.SessionLocal()
                station = db.query(models.Station).filter(models.Station.id == station_id).first()
                if station and station.ac_path:
                    await ws.send_text(json.dumps({
                        "command": "scan_content",
                        "ac_path": station.ac_path
                    }))
                    active_count += 1
                db.close()
            except Exception as ex:
                logger.error(f"Failed to sync station {station_id}: {ex}")
        
        logger.info(f"Content sync triggered for {active_count} stations")
    except Exception as e:
        logger.error(f"Error in global content sync: {e}")

def start_scheduler():
    """Initialize and start the scheduler"""
    # Run reminder check every day at 18:00 (6 PM)
    scheduler.add_job(
        check_and_send_reminders,
        CronTrigger(hour=18, minute=0),
        id="booking_reminders",
        replace_existing=True
    )

    # Sync Content every hour
    scheduler.add_job(
        sync_station_content,
        'interval',
        minutes=60,
        id="content_sync",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Scheduler started - Booking reminders (18:00) & Content Sync (Hourly)")


def stop_scheduler():
    """Stop the scheduler gracefully"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")
