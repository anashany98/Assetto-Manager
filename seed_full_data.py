import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal, engine
from backend.app import models

# Init DB
models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

def seed_data():
    print("🌱 Seeding Assetto Corsa Manager with Rich Data...")

    # --- 1. Drivers ---
    drivers_list = [
        ("Max Verstappen", "Alien"), ("Lando Norris", "Alien"), ("Fernando Alonso", "Pro"),
        ("Lewis Hamilton", "Alien"), ("Charles Leclerc", "Pro"), ("Carlos Sainz", "Pro"),
        ("Oscar Piastri", "Pro"), ("George Russell", "Pro"), ("Sergio Perez", "Amateur"),
        ("Yuki Tsunoda", "Amateur"), ("Daniel Ricciardo", "Amateur"), ("Alex Albon", "Amateur"),
        ("Juan Perez", "Rookie"), ("Maria Garcia", "Rookie"), ("Pepe Botella", "Rookie")
    ]
    
    created_drivers = []
    for name, tier in drivers_list:
        driver = db.query(models.Driver).filter(models.Driver.name == name).first()
        if not driver:
            vms_id = f"VMS_{name.split(' ')[-1].upper()[:3]}{random.randint(10,99)}"
            # Check if VMS ID exists just in case
            if db.query(models.Driver).filter(models.Driver.vms_id == vms_id).first():
                 vms_id = f"VMS_{name.split(' ')[-1].upper()[:3]}{random.randint(100,999)}"

            driver = models.Driver(
                name=name,
                vms_id=vms_id,
                email=f"{name.lower().replace(' ', '.')}@example.com",
                total_laps=random.randint(50, 500),
                safety_rating=random.randint(800, 1000)
            )
            db.add(driver)
            db.commit()
            print(f"Created Driver: {name} ({tier})")
        created_drivers.append(name)

    # --- 2. Championships ---
    champ = db.query(models.Championship).filter(models.Championship.name == "Copa Invierno 2024").first()
    if not champ:
        champ = models.Championship(
            name="Copa Invierno 2024",
            description="Campeonato oficial de pretemporada. GT3 @ Europa.",
            start_date=datetime.now() - timedelta(days=30),
            end_date=datetime.now() + timedelta(days=30),
            is_active=True
        )
        db.add(champ)
        db.commit()
        print("Created Championship: Copa Invierno 2024")

    # --- 3. Events & Results ---
    tracks = [("monza", "Monza"), ("spa", "Spa Francorchamps"), ("imola", "Imola")]
    cars = ["ks_ferrari_488_gt3", "ks_lamborghini_huracan_gt3", "ks_porsche_911_gt3_r_2016"]

    for i, (track_code, track_name) in enumerate(tracks):
        event_name = f"GP de {track_name}"
        event = db.query(models.Event).filter(models.Event.name == event_name).first()
        
        if not event:
            start_date = datetime.now() - timedelta(days=20 - (i * 7))
            end_date = datetime.now() + timedelta(days=7) if i == 2 else start_date + timedelta(hours=2)

            event = models.Event(
                name=event_name,
                description=f"Ronda {i+1} de la Copa Invierno",
                track_name=track_code,
                allowed_cars=cars,
                championship_id=champ.id,
                start_date=start_date,
                end_date=end_date,
                is_active=(i == 2), # Create one active event (Imola)
                status="active" if i == 2 else "completed"
            )
            db.add(event)
            db.commit()
            print(f"Created Event: {event_name}")

            # Create Session Results for this event
            # Logic: Aliens are faster
            base_times = {"monza": 108000, "spa": 138000, "imola": 102000} # ms
            
            for driver_name in created_drivers:
                # Determine skill modifier
                tier = next(skill for name, skill in drivers_list if name == driver_name)
                skill_mod = 0
                if tier == "Alien": skill_mod = random.randint(0, 500)
                elif tier == "Pro": skill_mod = random.randint(500, 1500)
                elif tier == "Amateur": skill_mod = random.randint(1500, 3000)
                else: skill_mod = random.randint(3000, 6000)

                lap_time = base_times[track_code] + skill_mod
                
                # Session
                session = models.SessionResult(
                    station_id=1,
                    event_id=event.id,
                    track_name=track_code,
                    track_config="gp",
                    car_model=random.choice(cars),
                    driver_name=driver_name,
                    session_type="qualify",
                    date=event.start_date,
                    best_lap=lap_time
                )
                db.add(session)
                db.commit()
                db.refresh(session)

                # Lap (Linked to Session)
                lap = models.LapTime(
                    session_id=session.id,
                    lap_number=1,
                    time=lap_time,
                    splits=[30000, 40000, 32000], # Dummy
                    valid=True
                )
                db.add(lap)
                
    db.commit()
    print("✅ Database Seeded Successfully!")

if __name__ == "__main__":
    seed_data()
