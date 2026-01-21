import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app import models

# Init DB
print("⚠️ RESETTING DATABASE SCHEMA FOR DEMO...")
# Drop all to ensure clean state (fixes schema drift)
models.Base.metadata.drop_all(bind=engine)
models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

# Constants
TRACKS = ["monza", "spa", "nurburgring", "imola", "silverstone", "suzuka", "barcelona"]
CARS = ["ferrari_488_gt3", "porsche_911_gt3_r", "mercedes_amg_gt3", "audi_r8_lms", "lamborghini_huracan_gt3", "mclaren_720s_gt3"]
DRIVERS = [
    "Carlos Sainz", "Fernando Alonso", "Max Verstappen", "Lewis Hamilton", 
    "Charles Leclerc", "Lando Norris", "Sergio Perez", "George Russell",
    "Oscar Piastri", "Alex Albon", "Daniel Ricciardo", "Yuki Tsunoda"
]

def seed_profiles():
    print("Seeding Profiles...")
    profiles = []
    for name in DRIVERS:
        profile = db.query(models.Profile).filter_by(name=name).first()
        if not profile:
            profile = models.Profile(
                name=name,
                description=f"Official Driver: {name}",
            )
            db.add(profile)
            profiles.append(profile)
    db.commit()
    return profiles

def seed_laps():
    print("Seeding Lap Times...")
    base_time_ms = 108000 
    
    for track in TRACKS:
        for car in CARS:
            for _ in range(random.randint(10, 20)):
                driver_name = random.choice(DRIVERS)
                variation = random.randint(-2000, 5000)
                final_time = base_time_ms + variation
                
                # ... calculated sectors ...
                s1 = final_time * 0.35
                s2 = final_time * 0.40
                s3 = final_time * 0.25

                # Generate Telemetry Trace (Mock Speed Curve & 3D Path)
                telemetry_trace = []
                num_points = 200 # 200 points for the chart
                for step in range(num_points):
                    progress = step / num_points
                    
                    import math
                    # Mock Speed: Base + Sine waves to simulate corners
                    base_speed = 150
                    corner_factor = math.sin(progress * math.pi * 4) * 80 
                    noise = random.randint(-5, 5)
                    speed = max(50, min(350, base_speed + corner_factor + noise))
                    
                    # Mock 3D coordinates (Simple Oval)
                    angle = progress * math.pi * 2
                    radius = 200 # meters scale
                    x = math.cos(angle) * radius
                    z = math.sin(angle) * radius
                    # Rotation tangent to circle
                    rot = angle + math.pi / 2 
                    
                    telemetry_trace.append({
                        "t": int((final_time / num_points) * step),
                        "s": int(speed),
                        "r": int(3000 + (speed / 350) * 5000),
                        "g": int(1 + (speed / 60)),
                        "n": round(progress, 3),
                        "x": round(x, 2),
                        "y": 0,
                        "z": round(z, 2),
                        "rot": round(rot, 2)
                    })

                session = models.SessionResult(
                    track_name=track,
                    car_model=car,
                    driver_name=driver_name,
                    date=datetime.now() - timedelta(days=random.randint(0, 30)),
                    session_type="qualify",
                    best_lap=final_time,
                )
                db.add(session)
                db.commit()
                db.refresh(session)

                lap = models.LapTime(
                    session_id=session.id,
                    lap_number=1,
                    time=final_time,
                    splits=[int(s1), int(s2), int(s3)],
                    telemetry_data=telemetry_trace,
                    valid=True
                )
                db.add(lap)

    db.commit()

def seed_events():
    print("Seeding Events...")
    # Clear old events
    db.query(models.Event).delete()
    
    events = [
        {
            "name": "GT3 Night Series",
            "track_name": "spa",
            "allowed_cars": ["GT3"],
            "start_date": datetime.now() + timedelta(hours=2), # Starts in 2h
            "end_date": datetime.now() + timedelta(hours=5),
            "description": "Carrera nocturna en Spa-Francorchamps. ¡Premios en metálico!",
            "status": "upcoming"
        },
        {
            "name": "Sunday Cup Final",
            "track_name": "monza",
            "allowed_cars": ["F1 2024"],
            "start_date": datetime.now() + timedelta(days=1, hours=15), # Tomorrow
            "end_date": datetime.now() + timedelta(days=1, hours=17),
            "description": "La gran final de la copa dominical.",
            "status": "upcoming"
        },
        {
            "name": "Nordschleife Track Day",
            "track_name": "nurburgring",
            "allowed_cars": ["OPEN"],
            "start_date": datetime.now() + timedelta(days=5),
            "end_date": datetime.now() + timedelta(days=5, hours=3),
            "description": "Día de puertas abiertas en el infierno verde.",
            "status": "upcoming"
        }
    ]

    for ev in events:
        db_event = models.Event(**ev)
        db.add(db_event)
    
    db.commit()

if __name__ == "__main__":
    print("🌱 Starting Seed Process...")
    try:
        seed_profiles()
        seed_laps()
        seed_events()
        print("✅ Database Seeded Successfully!")
        print(f"Added {len(DRIVERS)} drivers, generated laps for {len(TRACKS)} tracks.")
    except Exception as e:
        print(f"❌ Error seeding DB: {e}")
    finally:
        db.close()
