import sqlite3
import os

# Explicitly use the backend database
DB_PATH = "ac_manager.db"

def add_columns():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get existing columns
    cursor.execute("PRAGMA table_info(stations)")
    existing_columns = [row[1] for row in cursor.fetchall()]
    print(f"Existing columns: {existing_columns}")

    # Add columns if missing
    if "is_kiosk_mode" not in existing_columns:
        print("Adding is_kiosk_mode column...")
        cursor.execute("ALTER TABLE stations ADD COLUMN is_kiosk_mode BOOLEAN DEFAULT 0")
    
    if "is_tv_mode" not in existing_columns:
        print("Adding is_tv_mode column...")
        cursor.execute("ALTER TABLE stations ADD COLUMN is_tv_mode BOOLEAN DEFAULT 0")

    if "is_locked" not in existing_columns:
        print("Adding is_locked column...")
        cursor.execute("ALTER TABLE stations ADD COLUMN is_locked BOOLEAN DEFAULT 0")

    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    add_columns()
