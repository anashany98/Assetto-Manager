from backend.app.database import SessionLocal
from backend.app import models
import os

def seed_mods_and_profiles():
    db = SessionLocal()
    try:
        # Create Mods
        car_mod = models.Mod(
            name="Ferrari Test F40",
            version="1.0",
            type="car",
            source_path="fake_car_ks_ferrari_test.zip",
            status="approved",
            is_active=True
        )
        track_mod = models.Mod(
            name="Monza Circuit Test",
            version="1.0",
            type="track",
            source_path="fake_track_monza_test.zip",
            status="approved",
            is_active=True
        )
        db.add(car_mod)
        db.add(track_mod)
        db.commit()
        db.refresh(car_mod)
        db.refresh(track_mod)

        # Create Profile
        profile = models.Profile(
            name="Test Racing Profile",
            description="A profile for testing with random data",
            mods=[car_mod, track_mod]
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

        # Assign Profile to Station 1 if it exists
        station = db.query(models.Station).filter(models.Station.id == 1).first()
        if station:
            station.active_profile_id = profile.id
            db.commit()
            print(f"Assigned profile {profile.name} to station {station.name}")

        print("Random mods and profiles seeded!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_mods_and_profiles()
