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
            
            # Generate fake telemetry data (advanced)
            import json
            import math
            telemetry_points = []
            
            # Simple simulation state
            speed = 100
            rpm = 4000
            gear = 2
            tyre_temp = 80.0
            
            for t in range(0, lap_time, 200): # 5Hz points
                progress = t / lap_time
                
                # Simulate a lap with corners (sine wave steering)
                steer = math.sin(progress * 20) # -1 to 1
                
                # Gas/Brake logic based on steer (slow down in corners)
                if abs(steer) > 0.4:
                    gas = 0.1
                    brake = abs(steer) * 0.8
                    speed = max(50, speed - 2)
                    rpm = max(3000, rpm - 100)
                else:
                    gas = 0.9 + random.random() * 0.1
                    brake = 0
                    speed = min(320, speed + 2)
                    rpm = min(8500, rpm + 100)
                    
                # G-Forces
                g_lat = steer * 2.5 # ~2.5G lateral max
                g_lon = (gas * 1.0) - (brake * 2.0) # Accel vs Decel
                
                # Tyre Temps (heat up in corners/braking)
                heat_factor = abs(g_lat) + abs(g_lon)
                tyre_temp = (tyre_temp * 0.95) + (70 + heat_factor * 10) * 0.05
                
                telemetry_points.append({
                    "t": t,
                    "s": int(speed), 
                    "r": int(rpm), 
                    "g": int(gear), 
                    "n": progress,
                    "gas": round(gas, 2),
                    "brk": round(brake, 2),
                    "str": round(steer, 2),
                    "gl": round(g_lat, 2),
                    "gn": round(g_lon, 2),
                    "tt": round(tyre_temp, 1)
                })

            # Create Lap
            new_lap = models.LapTime(
                session_id=new_session.id,
                lap_number=1,
                time=lap_time,
                splits=[],
                telemetry_data=telemetry_points,
                valid=True
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
