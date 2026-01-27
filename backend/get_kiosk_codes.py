from app.database import SessionLocal
from app import models

def get_codes():
    db = SessionLocal()
    try:
        stations = db.query(models.Station).all()
        print(f"Found {len(stations)} stations:")
        for station in stations:
            print(f"Station ID: {station.id}, Name: {station.name}, Kiosk Code: {station.kiosk_code}, IP: {station.ip_address}, Hostname: {station.hostname}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    get_codes()
