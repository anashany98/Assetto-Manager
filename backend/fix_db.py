import os
import sys
from sqlalchemy import create_engine, text, inspect
from dotenv import load_dotenv

# Add parent directory to path to import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SQLALCHEMY_DATABASE_URL

def fix_database():
    print(f"Connecting to: {SQLALCHEMY_DATABASE_URL}")
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    inspector = inspect(engine)
    
    with engine.connect() as conn:
        # 1. Fix session_results table
        columns = [c['name'] for c in inspector.get_columns('session_results')]
        
        if 'event_id' not in columns:
            print("Adding event_id to session_results...")
            try:
                conn.execute(text("ALTER TABLE session_results ADD COLUMN event_id INTEGER"))
                conn.commit()
            except Exception as e:
                print(f"Error adding event_id: {e}")
        
        if 'track_config' not in columns:
            print("Adding track_config to session_results...")
            try:
                conn.execute(text("ALTER TABLE session_results ADD COLUMN track_config VARCHAR"))
                conn.commit()
            except Exception as e:
                print(f"Error adding track_config: {e}")

        # 2. Fix laptimes table
        columns_laptimes = [c['name'] for c in inspector.get_columns('laptimes')]
        
        if 'telemetry_data' not in columns_laptimes:
            print("Adding telemetry_data to laptimes...")
            try:
                conn.execute(text("ALTER TABLE laptimes ADD COLUMN telemetry_data JSON"))
                conn.commit()
            except Exception as e:
                # If JSON fails (e.g. SQLite doesn't have it natively in some versions), use TEXT
                try:
                    conn.execute(text("ALTER TABLE laptimes ADD COLUMN telemetry_data TEXT"))
                    conn.commit()
                except:
                    print(f"Error adding telemetry_data: {e}")

        if 'valid' not in columns_laptimes:
            print("Adding valid to laptimes...")
            try:
                conn.execute(text("ALTER TABLE laptimes ADD COLUMN valid BOOLEAN DEFAULT TRUE"))
                conn.commit()
            except Exception as e:
                print(f"Error adding valid: {e}")

        if 'lap_time_ms' in columns_laptimes and 'time' not in columns_laptimes:
             print("Renaming lap_time_ms to time in laptimes...")
             try:
                 # Standard SQL doesn't support RENAME COLUMN easily in all versions (SQLite < 3.25)
                 # We'll just add 'time' if it's missing and copies data if possible
                 conn.execute(text("ALTER TABLE laptimes ADD COLUMN time INTEGER"))
                 conn.execute(text("UPDATE laptimes SET time = lap_time_ms"))
                 conn.commit()
             except Exception as e:
                 print(f"Error handling lap_time_ms/time: {e}")

    print("Database fix completed.")

if __name__ == "__main__":
    fix_database()
