import sys
import os
from sqlalchemy import text

sys.path.append(os.getcwd())
from app.database import engine

def migrate():
    print("Adding manage_token column to table_bookings...")
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS manage_token VARCHAR(64) UNIQUE"))
            conn.commit()
            print("Migration completed.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
