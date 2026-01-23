import sys
import os
from sqlalchemy import text

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app.database import engine

def migrate():
    print(f"Connecting to database via app.database engine...")
    
    with engine.connect() as conn:
        # Check if column exists
        # This query is Postgres specific for efficient check, but acceptable since we saw Postgres URL.
        # For universal support, we'd inspect, but let's try direct ALTER with catch.
        try:
            print("Attempting to add driver_id column...")
            # Postgres syntax
            conn.execute(text("ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id)"))
            conn.commit()
            print("Migration completed or column already exists.")
        except Exception as e:
            print(f"Migration error (might be already existing or syntax diff): {e}")

if __name__ == "__main__":
    migrate()
