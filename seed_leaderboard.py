import sys
import os
import random
from datetime import datetime, timedelta

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app import models, database
from app.database import SessionLocal, engine

# Create tables if they don't exist (just in case)
models.Base.metadata.create_all(bind=engine)

def seed_data(count=50):
    db = SessionLocal()
    try:
        drivers = ["Carlos Sainz", "Fernando Alonso", "Max Verstappen", "L. Hamilton", "Charles Leclerc", "Lando Norris", "Pedro G.", "Javi Racer", "SimDriver 01", "Maria Speed"]
        cars = ["ferrari_sf24", "redbull_rb20", "mclaren_mcl38", "porsche_911_gt3", "bmw_m4_gt3", "mercedes_w15"]
        tracks = ["monza", "spa", "imola", "nurburgring", "silverstone", "suzuka"]
        
        print(f"Seeding {count} laps...")
        
        for i in range(count):
            track = random.choice(tracks)
            car = random.choice(cars)
            driver = random.choice(drivers)
            
            # Base time depends on track length approx (mock logic)
            base_ms = 100000 
            if track == "spa": base_ms = 130000
            if track == "nurburgring": base_ms = 120000
            
            lap_time = base_ms + random.randint(-5000, 15000)
            
            # Create Session
            new_session = models.SessionResult(
                station_id=1,
                track_name=track,
                car_model=car,
                driver_name=driver,
                session_type="practice",
                date=datetime.now() - timedelta(days=random.randint(0, 30)),
                best_lap=lap_time
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            
            # Create Lap
            new_lap = models.LapTime(
                session_id=new_session.id,
                driver_name=driver,
                car_model=car,
                track_name=track,
                lap_time=lap_time,
                sectors="[]",
                is_valid=True,
                timestamp=new_session.date
            )
            db.add(new_lap)
            
            if i % 10 == 0:
                print(f"Generated {i} records...")
                
        db.commit()
        print("Done!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data(100)
