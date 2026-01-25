
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
        
        print("Migrating Scenarios schema...")
        
        commands = [
            """
            CREATE TABLE IF NOT EXISTS scenarios (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description VARCHAR(255),
                session_type VARCHAR(50) DEFAULT 'practice',
                allowed_cars JSONB DEFAULT '[]'::jsonb,
                allowed_tracks JSONB DEFAULT '[]'::jsonb,
                allowed_durations JSONB DEFAULT '[10, 15, 20]'::jsonb,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            """,
            "CREATE INDEX IF NOT EXISTS ix_scenarios_name ON scenarios (name);"
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
