
import sys
import os
import json
from datetime import datetime

# Add project root to path
sys.path.append(os.getcwd())

from backend.app.database import SessionLocal
from backend.app import models

def fix():
    db = SessionLocal()
    print("Checking Active Stations...")

    active_stations = db.query(models.Station).filter(models.Station.is_active == True).all()
    print(f"Found {len(active_stations)} active stations.")

    # Get all cars/tracks to cache
    all_cars = db.query(models.Mod).filter(models.Mod.type == "car").all()
    all_tracks = db.query(models.Mod).filter(models.Mod.type == "track").all()

    cache_data = {
        "cars": [
            {
                "id": c.source_path.split("/")[-1] if "::" not in c.source_path else c.name,
                "name": c.name,
                "brand": c.name.split(" ")[0] if " " in c.name else "Brand",
                "image_url": f"/static/mods/{c.source_path.split('/')[-1]}/ui/preview.jpg", # Mock path
                "specs": {
                    "bhp": "500 HP",
                    "weight": "1200 kg",
                    "top_speed": "280 km/h"
                }
            } for c in all_cars
        ],
        "tracks": [
            {
                "id": t.source_path.split("/")[-1] if "::" not in t.source_path else t.name,
                "name": t.name,
                "layout": "GP",
                "image_url": f"/static/mods/{t.source_path.split('/')[-1]}/ui/preview.jpg"
            } for t in all_tracks
        ]
    }

    for s in active_stations:
        print(f"Updating cache for Station: {s.name} (ID: {s.id})")
        s.content_cache = cache_data
        s.content_cache_updated = datetime.now()
        
    db.commit()
    print("All active stations updated.")
    db.close()

if __name__ == "__main__":
    fix()
