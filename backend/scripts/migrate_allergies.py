import sys
import os
from sqlalchemy import text

sys.path.append(os.getcwd())
from app.database import engine

def migrate():
    print("Adding allergies column to table_bookings...")
    with engine.connect() as conn:
        try:
            # SQLite doesn't support JSON column type natively as distinct from TEXT until recent versions, 
            # but SQLAlchemy handles it. For raw SQL in SQLite, we add as TEXT or JSON.
            # Postgres supports JSONB or JSON.
            # Let's try adding as JSON generic (which maps to correct type per dialect usually) via pure SQL is tricky if we don't know dialect perfectly.
            # But usually TEXT works for SQLite JSON.
            
            # Detecting dialect roughly or just using exception fallback
            dialect = engine.dialect.name
            col_type = "JSON" if dialect == "postgresql" else "TEXT"
            
            conn.execute(text(f"ALTER TABLE table_bookings ADD COLUMN IF NOT EXISTS allergies {col_type}"))
            conn.commit()
            print("Migration completed.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
