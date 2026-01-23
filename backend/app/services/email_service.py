"""
Email Service - Send notification emails
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Email Configuration (from environment variables)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "VRacing Bar")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "")


def is_email_configured() -> bool:
    """Check if email is properly configured"""
    return bool(SMTP_USER and SMTP_PASSWORD and SMTP_FROM_EMAIL)


def send_email(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
    """
    Send an email using SMTP.
    Returns True if successful, False otherwise.
    """
    if not is_email_configured():
        if ENVIRONMENT != "test":
            logger.warning("Email not configured. Skipping email send.")
        return False
    
    if not to_email:
        logger.warning("No recipient email provided. Skipping.")
        return False
    
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg["To"] = to_email
        
        # Plain text version (fallback)
        if text_content:
            msg.attach(MIMEText(text_content, "plain"))
        
        # HTML version
        msg.attach(MIMEText(html_content, "html"))
        
        # Send
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, to_email, msg.as_string())
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def send_booking_confirmation(
    customer_email: str,
    customer_name: str,
    date: str,
    time_slot: str,
    num_players: int,
    duration_minutes: int,
    booking_id: int,
    manage_token: Optional[str] = None,
    bar_name: str = "VRacing Bar"
) -> bool:
    """
    Send booking confirmation email to customer.
    """
    subject = f"✅ Confirmación de Reserva - {bar_name}"
    
    style_block = """
        <style>
            body { font-family: Arial, sans-serif; background-color: #1a1a2e; color: #ffffff; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%); border-radius: 16px; overflow: hidden; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .booking-card { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin: 20px 0; }
            .booking-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .booking-row:last-child { border-bottom: none; }
            .label { color: #9ca3af; font-size: 14px; }
            .value { font-weight: bold; font-size: 16px; color: #60a5fa; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
        </style>
    """

    manage_link = f'<div style="text-align: center;"><a href="http://localhost:3010/reserva/{manage_token}" class="button">Gestionar Mi Reserva</a></div>' if manage_token else ''

    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        {style_block}
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏎️ ¡Reserva Confirmada!</h1>
            </div>
            <div class="content">
                <p>Hola <strong>{customer_name}</strong>,</p>
                <p>Tu reserva ha sido registrada correctamente. Aquí están los detalles:</p>
                
                <div class="booking-card">
                    <div class="booking-row">
                        <span class="label">📅 Fecha</span>
                        <span class="value">{date}</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">🕐 Horario</span>
                        <span class="value">{time_slot}</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">👥 Jugadores</span>
                        <span class="value">{num_players} persona(s)</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">⏱️ Duración</span>
                        <span class="value">{duration_minutes} minutos</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">🎫 Nº Reserva</span>
                        <span class="value">#{booking_id}</span>
                    </div>
                </div>
                
                <p style="color: #fbbf24;">⚠️ Por favor, llega 10 minutos antes de tu hora reservada.</p>
                
                <p>Si necesitas modificar o cancelar tu reserva, contáctanos.</p>
                
                {manage_link}
                
                <p>¡Te esperamos! 🏁</p>
            </div>
            <div class="footer">
                <p>{bar_name}</p>
                <p>Este email fue enviado automáticamente. Por favor, no respondas a este mensaje.</p>
            </div>
        </div>
    </body>
    </html>
    """.format(
        style_block=style_block,
        customer_name=customer_name,
        date=date,
        time_slot=time_slot,
        num_players=num_players,
        duration_minutes=duration_minutes,
        booking_id=booking_id,
        manage_link=manage_link,
        bar_name=bar_name
    )
    
    text_content = f"""
    ¡Reserva Confirmada!
    
    Hola {customer_name},
    
    Tu reserva ha sido registrada correctamente:
    
    📅 Fecha: {date}
    🕐 Horario: {time_slot}
    👥 Jugadores: {num_players} persona(s)
    ⏱️ Duración: {duration_minutes} minutos
    🎫 Nº Reserva: #{booking_id}
    
    Por favor, llega 10 minutos antes de tu hora reservada.
    
    ¡Te esperamos!
    {bar_name}
    """
    
    return send_email(customer_email, subject, html_content, text_content)


def send_booking_status_update(
    customer_email: str,
    customer_name: str,
    date: str,
    time_slot: str,
    new_status: str,
    booking_id: int,
    bar_name: str = "VRacing Bar"
) -> bool:
    """
    Send booking status update email (confirmed, cancelled, etc.)
    """
    status_messages = {
        "confirmed": ("✅ Reserva Confirmada", "Tu reserva ha sido CONFIRMADA", "#22c55e"),
        "cancelled": ("❌ Reserva Cancelada", "Tu reserva ha sido CANCELADA", "#ef4444"),
        "completed": ("🏁 Sesión Completada", "Gracias por visitarnos", "#3b82f6"),
    }
    
    if new_status not in status_messages:
        return False
    
    subject_text, message_text, color_code = status_messages[new_status]
    subject = f"{subject_text} - {bar_name}"
    
    style = """
        <style>
            body { font-family: Arial, sans-serif; background-color: #1a1a2e; color: #ffffff; padding: 20px; }
            .container { max-width: 500px; margin: 0 auto; background: #16213e; border-radius: 16px; padding: 30px; text-align: center; }
            .status { font-size: 24px; font-weight: bold; color: {color}; margin: 20px 0; }
            .details { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
    """.replace("{color}", color_code)
    
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        {style}
    </head>
    <body>
        <div class="container">
            <h1>🏎️ {bar_name}</h1>
            <p class="status">{message}</p>
            <div class="details">
                <p>📅 <strong>{date}</strong> a las <strong>{time_slot}</strong></p>
                <p>🎫 Reserva #{booking_id}</p>
            </div>
            <p>Hola {customer_name},</p>
            <p>{info_message}</p>
        </div>
    </body>
    </html>
    """.format(
        style=style,
        bar_name=bar_name,
        message=message_text,
        date=date,
        time_slot=time_slot,
        booking_id=booking_id,
        customer_name=customer_name,
        info_message=('Si tienes alguna duda, contáctanos.' if new_status != 'completed' else '¡Esperamos verte pronto de nuevo!')
    )
    
    return send_email(customer_email, subject, html_content)


def send_table_confirmation(
    customer_email: str,
    customer_name: str,
    date: str,
    time: str,
    pax: int,
    table_labels: str,
    booking_id: int,
    manage_token: Optional[str] = None,
    bar_name: str = "VRacing Bar"
) -> bool:
    """
    Send table booking confirmation email.
    """
    subject = f"🍽️ Mesa Confirmada - {bar_name}"
    
    style_block = """
        <style>
            body { font-family: Arial, sans-serif; background-color: #1a1a2e; color: #ffffff; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border-radius: 16px; overflow: hidden; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
            .content { padding: 30px; }
            .booking-card { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1); }
            .booking-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .booking-row:last-child { border-bottom: none; }
            .label { color: #9ca3af; font-size: 14px; }
            .value { font-weight: bold; font-size: 16px; color: #fbbf24; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
        </style>
    """

    manage_link = f'<div style="text-align: center;"><a href="http://localhost:3010/reserva/{manage_token}" class="button">Gestionar Mi Reserva</a></div>' if manage_token else ''

    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        {style_block}
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🍽️ Mesa Reservada</h1>
            </div>
            <div class="content">
                <p>Hola <strong>{customer_name}</strong>,</p>
                <p>Tu mesa ha sido confirmada:</p>
                
                <div class="booking-card">
                    <div class="booking-row">
                        <span class="label">📅 Fecha</span>
                        <span class="value">{date}</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">⏰ Hora</span>
                        <span class="value">{time}</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">👥 Pax</span>
                        <span class="value">{pax} personas</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">🪑 Mesas</span>
                        <span class="value">{table_labels}</span>
                    </div>
                    <div class="booking-row">
                        <span class="label">🎫 Ref.</span>
                        <span class="value">#{booking_id}</span>
                    </div>
                </div>

                {manage_link}
                
                <p>¡Disfruta de la experiencia! 🏁</p>
            </div>
            <div class="footer">
                <p>{bar_name}</p>
            </div>
        </div>
    </body>
    </html>
    """.format(
        style_block=style_block,
        customer_name=customer_name,
        date=date,
        time=time,
        pax=pax,
        table_labels=table_labels,
        booking_id=booking_id,
        manage_link=manage_link,
        bar_name=bar_name
    )
    
    return send_email(customer_email, subject, html_content)
