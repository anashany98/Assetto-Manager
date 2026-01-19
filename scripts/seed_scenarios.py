import sys
import os
# Adjust path to include project root
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from backend.app import models, database
from backend.app.database import SessionLocal

db = SessionLocal()

scenarios = [
    {
        "name": "Tandas GT3",
        "description": "Competicion oficial con vehiculos GT3 en Spa Francorchamps.",
        "allowed_cars": ["ks_mercedes_amg_gt3", "ks_ferrari_488_gt3", "ks_lamborghini_huracan_gt3", "ks_audi_r8_lms"],
        "allowed_tracks": ["spa", "nurburgring", "barcelona"],
        "allowed_durations": [10, 20, 30],
        "is_active": True
    },
    {
        "name": "Drift Academy",
        "description": "Aprende a derrapar con el clasico BMW E30.",
        "allowed_cars": ["bmw_e30_drift", "ks_toyota_supra_mkiv_drift"],
        "allowed_tracks": ["ks_drift_playground", "drift_track"],
        "allowed_durations": [10],
        "is_active": True
    },
    {
        "name": "F1 Experience",
        "description": "Siente la velocidad maxima de un F1 moderno.",
        "allowed_cars": ["ks_ferrari_sf70h", "rss_formula_hybrid_2022_s"],
        "allowed_tracks": ["monza", "imola", "austria"],
        "allowed_durations": [15, 30],
        "is_active": True
    },
    {
        "name": "Copa Abarth",
        "description": "Diversion pura con el pequeno 500 Abarth.",
        "allowed_cars": ["abarth500", "ks_abarth_500_assetto_corse"],
        "allowed_tracks": ["magione", "vallelunga_club"],
        "allowed_durations": [5, 10],
        "is_active": True
    }
]

for s_data in scenarios:
    existing = db.query(models.Scenario).filter(models.Scenario.name == s_data["name"]).first()
    if not existing:
        print(f"Creating scenario: {s_data['name']}")
        scenario = models.Scenario(**s_data)
        db.add(scenario)
    else:
        print(f"Scenario {s_data['name']} already exists. Updating...")
        for k, v in s_data.items():
            setattr(existing, k, v)

db.commit()
print("Scenarios seeded successfully!")
