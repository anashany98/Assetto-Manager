
import os
import psycopg2
from dotenv import load_dotenv

# Explicitly load .env from backend folder
load_dotenv("backend/.env")

DB_URL = "postgresql://postgres.qwnckkraoxncjhmvdtih:OjELaIFdYjNA9bLZ@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"

def migrate():
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        print("Migrating schema...")
        
        commands = [
            # Create TournamentMatch Table
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
            "CREATE INDEX IF NOT EXISTS ix_tournament_matches_id ON tournament_matches (id);",
            "CREATE INDEX IF NOT EXISTS ix_tournament_matches_event_id ON tournament_matches (event_id);"
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
