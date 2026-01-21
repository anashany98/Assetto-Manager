from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app import models
from datetime import datetime, timedelta
import random

def create_dummy_tournament():
    db = SessionLocal()
    
    # 1. Create Event
    print("Creating Tournament...")
    start_date = datetime.now() - timedelta(days=1)
    end_date = datetime.now() + timedelta(days=6)
    
    event = models.Event(
        name="Copa de Verano 2026",
        description="Campeonato oficial de verano en Monza. ¡Gran premio para el ganador!",
        start_date=start_date,
        end_date=end_date,
        track_name="monza",
        allowed_cars=["ferrari_488_gt3", "audi_r8_lms"],
        status="active",
        is_active=True,
        rules="{}"
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    print(f"Event created: {event.name} (ID: {event.id})")
    
    # 2. Add Participants (Session Results)
    drivers = ["Juan Pérez", "Carlos Sainz", "Fernando Alonso", "Max V.", "Lewis H.", "Lando N.", "Oscar P.", "Pedro D.", "Jorge M.", "Ana G."]
    cars = ["ferrari_488_gt3", "audi_r8_lms"]
    
    base_time = 108000 # 1:48.000
    
    print("Adding 10 drivers...")
    for i, driver in enumerate(drivers):
        # Randomize time slightly
        lap_time = base_time + random.randint(0, 5000) - (i * 200) # Make first ones faster usually
        
        session_result = models.SessionResult(
            station_id=1,
            event_id=event.id,
            track_name="monza",
            car_model=random.choice(cars),
            driver_name=driver,
            session_type="race",
            date=datetime.now() - timedelta(minutes=random.randint(10, 300)),
            best_lap=lap_time
        )
        db.add(session_result)
        
        # Also add a LapTime entry for details
        lap = models.LapTime(
            session=session_result,
            lap_number=1,
            time=lap_time,
            splits=[30000, 40000, 38000],
            valid=True
        )
        db.add(lap)

    db.commit()
    print("Tournament data seeded successfully!")
    db.close()

if __name__ == "__main__":
    create_dummy_tournament()
