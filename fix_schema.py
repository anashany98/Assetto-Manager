
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE session_results ADD COLUMN sectors TEXT"))
        print("Column 'sectors' added successfully.")
    except Exception as e:
        print(f"Error adding column (might already exist): {e}")
