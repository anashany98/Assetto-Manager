
import os
import psycopg2
from dotenv import load_dotenv

# Explicitly load .env from backend folder
load_dotenv("backend/.env")

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or os.getenv("DB_URL") or "postgresql://postgres.qwnckkraoxncjhmvdtih:OjELaIFdYjNA9bLZ@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"

def migrate():
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        print("Migrating schema...")
        
        commands = [
            # Core schema updates
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vms_id VARCHAR",
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email VARCHAR",
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_laps INTEGER DEFAULT 0",
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS safety_rating INTEGER DEFAULT 1000",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_drivers_vms_id ON drivers (vms_id)",

            "ALTER TABLE session_results ADD COLUMN IF NOT EXISTS station_id INTEGER",
            "ALTER TABLE session_results ADD COLUMN IF NOT EXISTS track_config VARCHAR",
            "ALTER TABLE session_results ADD COLUMN IF NOT EXISTS event_id INTEGER",

            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS lap_number INTEGER",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS time INTEGER",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS splits JSONB",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS telemetry_data JSONB",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS valid BOOLEAN DEFAULT TRUE",

            "ALTER TABLE events ADD COLUMN IF NOT EXISTS bracket_data JSONB",
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE",

            # Legacy table (kept for backward compatibility)
            """
            CREATE TABLE IF NOT EXISTS tournament_matches (
                id SERIAL PRIMARY KEY,
                event_id INTEGER REFERENCES events(id),
                round_number INTEGER,
                match_number INTEGER,
                player1 VARCHAR,
                player2 VARCHAR,
                winner VARCHAR,
                next_match_id INTEGER REFERENCES tournament_matches(id)
            );
            """,
            "CREATE INDEX IF NOT EXISTS ix_tournament_matches_id ON tournament_matches (id)",
            "CREATE INDEX IF NOT EXISTS ix_tournament_matches_event_id ON tournament_matches (event_id)"
        ]
        
        for cmd in commands:
            print(f"Executing: {cmd}")
            cur.execute(cmd)
            
        conn.commit()
        print("Migration successful.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
