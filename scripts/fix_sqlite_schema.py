
import sqlite3

def fix_schema():
    print("Fixing SQLite schema...")
    conn = sqlite3.connect('ac_manager.db')
    cursor = conn.cursor()
    
    # List of columns to check/add in 'stations' table
    # Format: (column_name, column_type)
    new_columns = [
        ("is_kiosk_mode", "BOOLEAN DEFAULT 0"),
        ("is_tv_mode", "BOOLEAN DEFAULT 0"),
        ("is_locked", "BOOLEAN DEFAULT 0")
    ]
    
    for col_name, col_type in new_columns:
        try:
            cursor.execute(f"ALTER TABLE stations ADD COLUMN {col_name} {col_type}")
            print(f"Added column: {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"Column already exists: {col_name}")
            else:
                print(f"Error adding {col_name}: {e}")
                
    conn.commit()
    conn.close()
    print("Schema update complete.")

if __name__ == "__main__":
    fix_schema()
