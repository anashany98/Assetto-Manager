
import sqlite3
import os

db_path = "ac_manager.db"
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
try:
    cursor.execute("PRAGMA table_info(session_results)")
    columns = cursor.fetchall()
    print("Columns in session_results:")
    found = False
    for col in columns:
        print(col)
        if col[1] == 'sectors':
            found = True
    
    if not found:
        print("ADDING COLUMN MANUALLY VIA SQLITE3...")
        cursor.execute("ALTER TABLE session_results ADD COLUMN sectors TEXT")
        conn.commit()
        print("Column added.")
    else:
        print("Column 'sectors' indeed exists.")

    # Check for another potential missing column 'track_config'
    found_config = False
    for col in columns:
        if col[1] == 'track_config':
            found_config = True
            
    if not found_config:
        print("ADDING COLUMN track_config...")
        cursor.execute("ALTER TABLE session_results ADD COLUMN track_config TEXT")
        conn.commit()
        print("Column track_config added.")

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
