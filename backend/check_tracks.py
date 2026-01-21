from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check SessionResults tracks
    result = conn.execute(text("SELECT DISTINCT track_name FROM session_results"))
    tracks = [row[0] for row in result]
    print(f"Tracks in DB: {tracks}")

    # Check Active Combinations Logic (Simulate the API query)
    # Joining SessionResult and LapTime where LapTime is valid
    query = text("""
        SELECT DISTINCT s.track_name, s.car_model 
        FROM session_results s
        JOIN laptimes l ON s.id = l.session_id
        WHERE l.valid = true
    """)
    result_combos = conn.execute(query)
    combos = [{"track": row[0], "car": row[1]} for row in result_combos]
    print(f"Active Combinations for Rotation: {combos}")
