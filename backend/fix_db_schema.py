from sqlalchemy import create_engine, text
from app.database import SQLALCHEMY_DATABASE_URL
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_schema():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        
        # Check bookings columns
        columns_to_add = [
            ("customer_email", "VARCHAR"),
            ("customer_phone", "VARCHAR"),
            ("num_players", "INTEGER DEFAULT 1"),
            ("duration_minutes", "INTEGER DEFAULT 60"),
            ("notes", "VARCHAR"),
            ("status", "VARCHAR DEFAULT 'pending'") # If status exists but is different app might fail, but let's assume it might not exist or need update
        ]
        
        for col, col_type in columns_to_add:
            try:
                print(f"Attempting to add {col} to bookings...")
                conn.execute(text(f"ALTER TABLE bookings ADD COLUMN {col} {col_type}"))
                print(f"✅ Added {col}")
            except Exception as e:
                print(f"⚠️ Could not add {col} (might exist): {e}")

if __name__ == "__main__":
    fix_schema()
