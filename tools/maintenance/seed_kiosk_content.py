
import sys
import os
import random
import json

# Add project root to path
sys.path.append(os.getcwd())

from backend.app.database import SessionLocal, engine
from backend.app import models

def seed():
    db = SessionLocal()
    print("Seeding database check...")

    # 1. Ensure we have a Station
    station = db.query(models.Station).first()
    if not station:
        print("Creating default Demo Station...")
        station = models.Station(
            name="Simulador 1",
            ip_address="192.168.1.100",
            status="active",
            is_active=True,
            is_online=True,
            is_kiosk_mode=True
        )
        db.add(station)
        db.commit()
        db.refresh(station)
    else:
        print(f"Station found: {station.name}")
        # Ensure it's active for kiosk
        station.is_active = True
        station.is_online = True
        station.is_kiosk_mode = True
        db.commit()

    # 2. Seed Cars if empty
    existing_cars = db.query(models.Mod).filter(models.Mod.type == "car").count()
    if existing_cars == 0:
        print("Seeding Cars...")
        cars = [
            {
                "name": "Ferrari 488 GT3",
                "source_path": "content/cars/ferrari_488_gt3", 
                "version": "1.0",
                "ui": {"bhp": "600 HP", "weight": "1260 kg", "top_speed": "290 km/h", "acceleration": "2.8s"}
            },
            {
                "name": "Porsche 911 GT3 R",
                "source_path": "content/cars/ks_porsche_911_gt3_r",
                "version": "1.2",
                "ui": {"bhp": "550 HP", "weight": "1230 kg", "top_speed": "295 km/h", "acceleration": "2.9s"}
            },
            {
                "name": "Lamborghini Huracan GT3",
                "source_path": "content/cars/ks_lamborghini_huracan_gt3",
                "version": "1.0",
                "ui": {"bhp": "580 HP", "weight": "1250 kg", "top_speed": "292 km/h", "acceleration": "2.9s"}
            },
            {
                "name": "AMG GT3",
                "source_path": "content/cars/ks_mercedes_amg_gt3",
                "version": "1.0",
                "ui": {"bhp": "550 HP", "weight": "1285 kg", "top_speed": "285 km/h", "acceleration": "3.0s"}
            }
        ]

        # Get 'Car' tag
        car_tag = db.query(models.Tag).filter(models.Tag.name == "Car").first()
        if not car_tag:
            car_tag = models.Tag(name="Car", color="#3b82f6")
            db.add(car_tag)
        
        for c in cars:
            mod = models.Mod(
                name=c["name"],
                type="car",
                version=c["version"],
                source_path=c["source_path"],
                is_active=True,
                status="approved",
                manifest="{}"
            )
            mod.tags.append(car_tag)
            db.add(mod)
        db.commit()
    else:
        print(f"Found {existing_cars} cars. Skipping car seed.")

    # 3. Seed Tracks if empty
    existing_tracks = db.query(models.Mod).filter(models.Mod.type == "track").count()
    if existing_tracks == 0:
        print("Seeding Tracks...")
        tracks = [
            {
                "name": "Spa Francorchamps",
                "source_path": "content/tracks/spa",
                "version": "1.0"
            },
            {
                "name": "Nürburgring GP",
                "source_path": "content/tracks/ks_nurburgring",
                "version": "1.0"
            },
            {
                "name": "Monza",
                "source_path": "content/tracks/monza",
                "version": "1.0"
            },
             {
                "name": "Imola",
                "source_path": "content/tracks/imola",
                "version": "1.0"
            }
        ]

        # Get 'Track' tag
        track_tag = db.query(models.Tag).filter(models.Tag.name == "Track").first()
        if not track_tag:
            track_tag = models.Tag(name="Track", color="#10b981")
            db.add(track_tag)

        for t in tracks:
            mod = models.Mod(
                name=t["name"],
                type="track",
                version=t["version"],
                source_path=t["source_path"],
                is_active=True,
                status="approved",
                manifest="{}"
            )
            mod.tags.append(track_tag)
            db.add(mod)
        db.commit()
    else:
        print(f"Found {existing_tracks} tracks. Skipping track seed.")

    # 4. Populate Station Cache so Kiosk sees it immediately
    # In a real scenario, the Agent scans and reports this.
    # Here we simulate that the station has ALL the seeded content.
    if station:
        all_cars = db.query(models.Mod).filter(models.Mod.type == "car").all()
        all_tracks = db.query(models.Mod).filter(models.Mod.type == "track").all()
        
        cache_data = {
            "cars": [
                {
                    "id": c.source_path.split("/")[-1], # Use folder name as ID usually
                    "name": c.name,
                    "brand": c.name.split(" ")[0] if " " in c.name else "Brand",
                    "specs": {
                        "bhp": "500 HP", # Dummy fallbacks if not in DB source
                        "weight": "1200 kg",
                        "top_speed": "280 km/h"
                    }
                } for c in all_cars
            ],
            "tracks": [
                {
                    "id": t.source_path.split("/")[-1],
                    "name": t.name,
                    "layout": "GP"
                } for t in all_tracks
            ]
        }
        
        station.content_cache = cache_data
        from datetime import datetime
        station.content_cache_updated = datetime.utcnow()
        db.commit()
        print("Updated Station content cache.")

    db.close()
    print("Seeding Complete!")

if __name__ == "__main__":
    seed()
