
import os
import secrets
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
            "CREATE EXTENSION IF NOT EXISTS btree_gist",
            # Core schema updates
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vms_id VARCHAR",
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email VARCHAR",
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_laps INTEGER DEFAULT 0",
            "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS safety_rating INTEGER DEFAULT 1000",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_drivers_vms_id ON drivers (vms_id)",

            "ALTER TABLE session_results ADD COLUMN IF NOT EXISTS station_id INTEGER",
            "ALTER TABLE session_results ADD COLUMN IF NOT EXISTS track_config VARCHAR",
            "ALTER TABLE session_results ADD COLUMN IF NOT EXISTS event_id INTEGER",
            "ALTER TABLE session_results ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0",

            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS lap_number INTEGER",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS time INTEGER",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS splits JSONB",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS telemetry_data JSONB",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS valid BOOLEAN DEFAULT TRUE",
            "ALTER TABLE laptimes ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0",

            "ALTER TABLE events ADD COLUMN IF NOT EXISTS bracket_data JSONB",
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE",

            "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS session_type VARCHAR(50) DEFAULT 'practice'",
            "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS allowed_cars JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS allowed_tracks JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS allowed_durations JSONB DEFAULT '[10, 15, 20]'::jsonb",
            "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",

            "ALTER TABLE stations ADD COLUMN IF NOT EXISTS kiosk_code VARCHAR",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_stations_kiosk_code ON stations (kiosk_code)",
            "ALTER TABLE stations ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ",
            "ALTER TABLE stations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ",

            # Table Reservation Module
            """
            CREATE TABLE IF NOT EXISTS tables (
                id SERIAL PRIMARY KEY,
                label VARCHAR(20) NOT NULL,
                x FLOAT DEFAULT 0.0,
                y FLOAT DEFAULT 0.0,
                width FLOAT DEFAULT 50.0,
                height FLOAT DEFAULT 50.0,
                shape VARCHAR(20) DEFAULT 'rect',
                seats INTEGER DEFAULT 4,
                rotation FLOAT DEFAULT 0.0,
                is_active BOOLEAN DEFAULT TRUE
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS table_bookings (
                id SERIAL PRIMARY KEY,
                table_ids JSONB DEFAULT '[]'::jsonb,
                customer_name VARCHAR(100) NOT NULL,
                customer_phone VARCHAR(50),
                customer_email VARCHAR(100),
                start_time TIMESTAMP WITH TIME ZONE NOT NULL,
                end_time TIMESTAMP WITH TIME ZONE NOT NULL,
                pax INTEGER DEFAULT 2,
                status VARCHAR(20) DEFAULT 'confirmed',
                notes VARCHAR(500),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            """,
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS zone VARCHAR(20) DEFAULT 'main'",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS fixed_notes VARCHAR(255)",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'free'",
            "ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS allergies JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS manage_token VARCHAR(64)",
            "ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS driver_id INTEGER",
            "CREATE INDEX IF NOT EXISTS ix_tables_label ON tables (label)",
            "CREATE INDEX IF NOT EXISTS ix_table_bookings_date ON table_bookings (start_time)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_table_bookings_manage_token ON table_bookings (manage_token)",

            """
            CREATE TABLE IF NOT EXISTS table_booking_tables (
                booking_id INTEGER NOT NULL REFERENCES table_bookings(id) ON DELETE CASCADE,
                table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
                start_time TIMESTAMPTZ NOT NULL,
                end_time TIMESTAMPTZ NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
                PRIMARY KEY (booking_id, table_id)
            );
            """,
            "CREATE INDEX IF NOT EXISTS ix_table_booking_tables_table_id ON table_booking_tables (table_id)",
            "CREATE INDEX IF NOT EXISTS ix_table_booking_tables_booking_id ON table_booking_tables (booking_id)",
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'table_booking_no_overlap'
                ) THEN
                    ALTER TABLE table_booking_tables
                    ADD CONSTRAINT table_booking_no_overlap
                    EXCLUDE USING GIST (
                        table_id WITH =,
                        tstzrange(start_time, end_time, '[)') WITH &&
                    )
                    WHERE (status NOT IN ('cancelled', 'no-show', 'completed'));
                END IF;
            END $$;
            """,

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

        cur.execute(
            """
            INSERT INTO table_booking_tables (booking_id, table_id, start_time, end_time, status)
            SELECT
                b.id,
                (t.value)::int,
                b.start_time,
                b.end_time,
                b.status
            FROM table_bookings b
            JOIN LATERAL (
                SELECT jsonb_array_elements_text(
                    CASE
                        WHEN b.table_ids IS NULL THEN '[]'::jsonb
                        WHEN jsonb_typeof(b.table_ids::jsonb) = 'array' THEN b.table_ids::jsonb
                        ELSE jsonb_build_array(b.table_ids::jsonb)
                    END
                ) AS value
            ) t ON TRUE
            ON CONFLICT DO NOTHING
            """
        )

        cur.execute("SELECT id FROM stations WHERE kiosk_code IS NULL")
        missing_codes = cur.fetchall()
        for (station_id,) in missing_codes:
            code = None
            while True:
                candidate = secrets.token_hex(3).upper()
                cur.execute("SELECT 1 FROM stations WHERE kiosk_code = %s", (candidate,))
                if not cur.fetchone():
                    code = candidate
                    break
            cur.execute("UPDATE stations SET kiosk_code = %s WHERE id = %s", (code, station_id))
            
        conn.commit()
        print("Migration successful.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
