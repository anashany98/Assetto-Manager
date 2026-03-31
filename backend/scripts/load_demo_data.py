#!/usr/bin/env python3
"""
Script para cargar datos de demo en la base de datos.
Ejecutar desde la carpeta backend:
    python scripts/load_demo_data.py
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Añadir el directorio app al path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal, engine
from app import models
from app.auth import get_password_hash


def create_demo_users(db):
    """Crear usuarios de demo"""
    print("==> Creating users...")
    
    users_data = [
        {"username": "admin", "role": "admin", "password": "admin123"},
        {"username": "manager", "role": "manager", "password": "manager123"},
        {"username": "cliente1", "role": "user", "password": "cliente123"},
    ]
    
    created = []
    for user_data in users_data:
        existing = db.query(models.User).filter(models.User.username == user_data["username"]).first()
        if not existing:
            user = models.User(
                username=user_data["username"],
                hashed_password=get_password_hash(user_data["password"]),
                role=user_data["role"],
                is_active=True
            )
            db.add(user)
            created.append(user_data["username"])
            print(f"  [OK] Usuario: {user_data['username']} ({user_data['role']})")
    
    db.commit()
    return created


def create_demo_stations(db):
    """Crear 4 estaciones de simuladores"""
    print("==> Creando estaciones...")
    
    stations_data = [
        {
            "name": "Sim 1",
            "ip_address": "192.168.1.101",
            "mac_address": "AA:BB:CC:DD:EE:01",
            "hostname": "SIMULADOR-01",
            "is_active": True,
            "is_online": True,
            "status": "online",
            "is_kiosk_mode": False,
            "group_name": "Simuladores",
            "ac_path": "D:\\AssettoCorsa",
        },
        {
            "name": "Sim 2",
            "ip_address": "192.168.1.102",
            "mac_address": "AA:BB:CC:DD:EE:02",
            "hostname": "SIMULADOR-02",
            "is_active": True,
            "is_online": True,
            "status": "online",
            "is_kiosk_mode": False,
            "group_name": "Simuladores",
            "ac_path": "D:\\AssettoCorsa",
        },
        {
            "name": "Sim 3",
            "ip_address": "192.168.1.103",
            "mac_address": "AA:BB:CC:DD:EE:03",
            "hostname": "SIMULADOR-03",
            "is_active": True,
            "is_online": True,
            "status": "online",
            "is_kiosk_mode": False,
            "group_name": "Simuladores",
            "ac_path": "D:\\AssettoCorsa",
        },
        {
            "name": "Sim 4",
            "ip_address": "192.168.1.104",
            "mac_address": "AA:BB:CC:DD:EE:04",
            "hostname": "SIMULADOR-04",
            "is_active": True,
            "is_online": True,
            "status": "online",
            "is_kiosk_mode": False,
            "group_name": "Simuladores",
            "ac_path": "D:\\AssettoCorsa",
        },
    ]
    
    created = []
    for station_data in stations_data:
        existing = db.query(models.Station).filter(models.Station.name == station_data["name"]).first()
        if not existing:
            station = models.Station(**station_data)
            db.add(station)
            created.append(station_data["name"])
            print(f"  [OK] Estación: {station_data['name']}")
    
    db.commit()
    return created


def create_demo_sessions(db):
    """Crear sesiones activas de demo"""
    print("==> Creando sesiones...")
    
    stations = db.query(models.Station).filter(models.Station.name.in_(["Sim 1", "Sim 2"])).all()
    
    sessions_data = []
    now = datetime.now(timezone.utc)
    
    for i, station in enumerate(stations):
        # Sesión 1: Sim 1 - Juan con Ferrari
        if i == 0:
            session = models.Session(
                station_id=station.id,
                driver_name="Juan Pérez",
                start_time=now - timedelta(minutes=5),
                end_time=now + timedelta(minutes=25),
                duration_minutes=30,
                status="active",
                is_paid=True,
                price=15.00,
                payment_method="bizum",
                notes="Demo: Cliente frecuente"
            )
            sessions_data.append(f"Juan - Sim 1")
        
        # Sesión 2: Sim 2 - María con Lamborghini
        elif i == 1:
            session = models.Session(
                station_id=station.id,
                driver_name="María García",
                start_time=now - timedelta(minutes=15),
                end_time=now + timedelta(minutes=45),
                duration_minutes=60,
                status="active",
                is_paid=True,
                price=30.00,
                payment_method="bizum",
                notes="Demo: Cliente VIP"
            )
            sessions_data.append(f"María - Sim 2")
        
        db.add(session)
    
    db.commit()
    print(f"  [OK] Sesiones creadas: {', '.join(sessions_data)}")
    return sessions_data


def create_demo_lobby(db):
    """Crear lobby multiplayer de demo"""
    print("==> Creando lobby multiplayer...")
    
    # Obtener estaciones para el lobby
    sim1 = db.query(models.Station).filter(models.Station.name == "Sim 1").first()
    sim2 = db.query(models.Station).filter(models.Station.name == "Sim 2").first()
    sim3 = db.query(models.Station).filter(models.Station.name == "Sim 3").first()
    
    if not sim1 or not sim2 or not sim3:
        print("  WARNING:  No hay suficientes estaciones para lobby")
        return None
    
    now = datetime.now(timezone.utc)
    
    lobby = models.Lobby(
        name="Carrera Rápida",
        host_station_id=sim1.id,
        track="barcelona",
        track_layout="gp",
        car="ks_ferrari_fxx_k",
        session_type="race",
        max_players=4,
        laps=5,
        duration_minutes=15,
        status="open",
        port=9600,
        created_at=now,
        started_at=None,
    )
    db.add(lobby)
    db.commit()
    db.refresh(lobby)
    
    # Agregar jugadores
    lobby.players = [sim1, sim2, sim3]
    db.commit()
    
    print(f"  [OK] Lobby creado: {lobby.name} - {lobby.track}")
    print(f"     Host: Sim 1, Jugadores: 3/4")
    
    return lobby


def create_demo_bookings(db):
    """Crear reservas de demo"""
    print("==> Creando bookings...")
    
    stations = db.query(models.Station).all()
    if not stations:
        print("  WARNING:  No hay estaciones")
        return []
    
    bookings_data = [
        {"customer_name": "Carlos López", "time_slot": "10:00", "date": datetime.now(timezone.utc).date()},
        {"customer_name": "Ana Martínez", "time_slot": "12:00", "date": datetime.now(timezone.utc).date()},
        {"customer_name": "Pedro Sánchez", "time_slot": "14:00", "date": datetime.now(timezone.utc).date()},
        {"customer_name": "Laura Rodríguez", "time_slot": "16:00", "date": datetime.now(timezone.utc).date()},
        {"customer_name": "Miguel Fernández", "time_slot": "18:00", "date": datetime.now(timezone.utc).date()},
    ]
    
    created = []
    for i, booking_data in enumerate(bookings_data):
        booking = models.Booking(
            station_id=stations[i % len(stations)].id,
            customer_name=booking_data["customer_name"],
            customer_email=f"{booking_data['customer_name'].lower().replace(' ', '.')}@demo.com",
            customer_phone="+34600000000",
            time_slot=booking_data["time_slot"],
            date=booking_data["date"],
            duration_minutes=60,
            status="confirmed",
            paid=True,
            notes="Reserva de demo"
        )
        db.add(booking)
        created.append(f"{booking_data['customer_name']} - {booking_data['time_slot']}")
    
    db.commit()
    print(f"  [OK] Bookings creados: {len(created)} reservas")
    return created


def create_demo_session_history(db):
    """Crear historial de sesiones"""
    print("==> Creando historial de sesiones...")
    
    stations = db.query(models.Station).all()
    if not stations:
        return []
    
    # Crear 20 sesiones de historial
    drivers = ["Juan", "María", "Carlos", "Ana", "Pedro", "Laura", "Miguel", "Sofia", "David", "Elena"]
    cars = ["ks_ferrari_fxx_k", "ks_lamborghini_huracan_gt3", "ks_bmw_m4", "ks_mclaren_p1", "ks_audi_r8_lms"]
    
    created = []
    now = datetime.now(timezone.utc)
    
    for i in range(20):
        station = stations[i % len(stations)]
        driver = drivers[i % len(drivers)]
        car = cars[i % len(cars)]
        
        start = now - timedelta(days=(i // 2) + 1, hours=i % 24)
        end = start + timedelta(minutes=30 + (i * 5) % 60)
        
        session = models.Session(
            station_id=station.id,
            driver_name=driver,
            start_time=start,
            end_time=end,
            duration_minutes=30 + (i * 5) % 60,
            status="completed",
            is_paid=True,
            price=15.00 + (i * 2.5),
            payment_method="bizum",
            notes=f"Demo session {i+1}"
        )
        db.add(session)
        created.append(f"{driver} - {car}")
    
    db.commit()
    print(f"  [OK] Historial creado: {len(created)} sesiones")
    return created


def ensure_demo_tags(db):
    """Asegurar que existan los tags de demo"""
    print("==> Verificando tags...")
    
    existing_tags = db.query(models.Tag).all()
    if len(existing_tags) > 10:
        print(f"  [OK] Tags ya existen: {len(existing_tags)}")
        return existing_tags
    
    tags_data = [
        {"name": "Car", "color": "#3b82f6"},
        {"name": "Track", "color": "#10b981"},
        {"name": "Ferrari", "color": "#ef4444"},
        {"name": "BMW", "color": "#3b82f6"},
        {"name": "Lamborghini", "color": "#fbbf24"},
        {"name": "McLaren", "color": "#f97316"},
        {"name": "Audi", "color": "#64748b"},
        {"name": "GT3", "color": "#ec4899"},
        {"name": "GT4", "color": "#8b5cf6"},
        {"name": "Drift", "color": "#14b8a6"},
        {"name": "F1", "color": "#ef4444"},
        {"name": "Rally", "color": "#84cc16"},
        {"name": "Endurance", "color": "#0ea5e9"},
        {"name": "Sprint", "color": "#f43f5e"},
        {"name": "Universal", "color": "#6b7280"},
    ]
    
    created = []
    for tag_data in tags_data:
        existing = db.query(models.Tag).filter(models.Tag.name == tag_data["name"]).first()
        if not existing:
            tag = models.Tag(**tag_data)
            db.add(tag)
            created.append(tag_data["name"])
    
    db.commit()
    print(f"  [OK] Tags creados: {len(created)}")
    return created


def update_station_content_cache(db):
    """Actualizar el cache de contenido de las estaciones"""
    print("==> Actualizando cache de contenido...")
    
    stations = db.query(models.Station).all()
    
    for station in stations:
        station.content_cache = {
            "cars": [
                "ks_ferrari_fxx_k",
                "ks_lamborghini_huracan_gt3", 
                "ks_bmw_m4",
                "ks_mclaren_p1",
                "ks_audi_r8_lms",
                "ks_lamborghini_aventador_sv",
                "ks_ferrari_488_gt3",
            ],
            "tracks": [
                "barcelona",
                "monza",
                "silverstone",
                "spa",
                "nürburgring",
                "paul_ricard",
                "zandvoort",
            ]
        }
        station.content_cache_updated = datetime.now(timezone.utc)
    
    db.commit()
    print(f"  [OK] Cache actualizado para {len(stations)} estaciones")
    return len(stations)


def main():
    """Función principal"""
    print("\n" + "="*60)
    print("==> LOADING DEMO DATA <==")
    print("="*60 + "\n")
    
    # Crear tablas si no existen
    print("==> Verifying database...")
    from app.database import Base
    Base.metadata.create_all(bind=engine)
    print("  [OK] Base de datos lista\n")
    
    db = SessionLocal()
    try:
        # 1. Usuarios
        users = create_demo_users(db)
        
        # 2. Estaciones
        stations = create_demo_stations(db)
        
        # 3. Tags
        tags = ensure_demo_tags(db)
        
        # 4. Sesiones activas
        sessions = create_demo_sessions(db)
        
        # 5. Lobby
        lobby = create_demo_lobby(db)
        
        # 6. Bookings
        bookings = create_demo_bookings(db)
        
        # 7. Historial
        history = create_demo_session_history(db)
        
        # 8. Cache de contenido
        cache = update_station_content_cache(db)
        
        print("\n" + "="*60)
        print("[OK] DATOS DE DEMO CARGADOS EXITOSAMENTE")
        print("="*60)
        print(f"""
 ==> SUMMARY:
    • Users: {len(users)} (admin, manager, cliente1)
    • Stations: {len(stations)} (Sim 1-4)
    • Tags: {len(tags)}
    • Active sessions: {len(sessions)}
    • Multiplayer lobby: {'Yes' if lobby else 'No'}
    • Bookings: {len(bookings)}
    • History: {len(history)} sessions

 ==> ACCESS:
    • Frontend: http://localhost:3010
    • User: admin / admin123

 ==> SCREENS TO TEST:
    • Dashboard: /admin
    • System Dashboard: /system-dashboard
    • Kiosko: /kiosk-modern
    • Hardware: /hardware
    • Mods: /mods
    • Bookings: /bookings
 """)
        
    finally:
        db.close()


if __name__ == "__main__":
    main()
