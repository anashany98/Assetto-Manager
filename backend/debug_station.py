from app.database import SessionLocal
from app.models import Station
from app.routers.hardware import StationHealthStatus
from datetime import datetime, timezone

def check_station():
    db = SessionLocal()

    print(f"Checking Stations...")
    all_stations = db.query(Station).all()
    print(f"Total Stations: {len(all_stations)}")
    for s in all_stations:
        print(f" - ID: {s.id}, Name: {s.name}, Locked: {s.is_locked}")

    try:
        station = db.query(Station).filter(Station.id == 1).first()
        if not station:
            print("Station 1 not found")
            return

        print(f"Station found: {station.name}")
        print(f"is_locked value: {station.is_locked} (Type: {type(station.is_locked)})")
        
        # Simulate Pydantic validation
        data = {
            "station_id": station.id,
            "station_name": station.name,
            "is_online": False,
            "last_seen": None,
            "cpu_percent": 0,
            "ram_percent": 0,
            "gpu_percent": 0,
            "gpu_temp": 0,
            "disk_percent": 0,
            "wheel_connected": False,
            "pedals_connected": False,
            "shifter_connected": False,
            "ac_running": False,
            "current_driver": None,
            "current_track": None,
            "current_car": None,
            "alerts": [],
            "is_locked": station.is_locked
        }
        
        try:
            model = StationHealthStatus(**data)
            print("Pydantic validation SUCCESS")
            print(model.dict())
        except Exception as e:
            print(f"Pydantic validation FAILED: {e}")

    except Exception as e:
        print(f"SQLAlchemy Query Failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_station()
