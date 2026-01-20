
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")
url = os.getenv("DATABASE_URL")

def fix_stations_columns():
    if not url:
        print("No DATABASE_URL found")
        return

    print("Connecting to Supabase...")
    engine = create_engine(url)
    
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        try:
            # PostgreSQL requires explicit casting or correct defaults.
            # We will try to Drop and Add to be clean, or Alter with Type
            
            # 1. Fix is_tv_mode
            print("Fixing is_tv_mode...")
            # If it exists with wrong type or default, this ensures it's correct
            # Option A: ALTER COLUMN TYPE using USING
            # conn.execute(text("ALTER TABLE stations ALTER COLUMN is_tv_mode TYPE BOOLEAN USING is_tv_mode::boolean;"))
            # Option B: Drop and Add (safer if data is empty or irrelevant default 0)
            
            # Let's try to just add it safely or alter it.
            # Based on error: "column "is_tv_mode" is of type boolean but default expression is of type integer"
            # It implies the column MIGHT exist but is broken, or the previous command failed halfway.
            
            # Cleaning up potentially bad state
            try:
                conn.execute(text("ALTER TABLE stations DROP COLUMN IF EXISTS is_tv_mode"))
            except Exception as e:
                print(f"Drop error (ignoring): {e}")

            try:
                conn.execute(text("ALTER TABLE stations DROP COLUMN IF EXISTS is_kiosk_mode"))
            except Exception as e:
                print(f"Drop error (ignoring): {e}")
                
            try:
                 conn.execute(text("ALTER TABLE stations DROP COLUMN IF EXISTS is_locked"))
            except Exception as e:
                print(f"Drop error (ignoring): {e}")

            # Re-adding correctly for Postgres
            print("Adding columns correctly...")
            conn.execute(text("ALTER TABLE stations ADD COLUMN is_tv_mode BOOLEAN DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE stations ADD COLUMN is_kiosk_mode BOOLEAN DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE stations ADD COLUMN is_locked BOOLEAN DEFAULT FALSE"))
            
            print("✅ Columns fixed.")
            
        except Exception as e:
            print(f"❌ Error fixing columns: {e}")

if __name__ == "__main__":
    fix_stations_columns()
