from sqlalchemy import create_engine, text
from app.database import SQLALCHEMY_DATABASE_URL
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        
        try:
            print("Attempting to add is_tv_mode to stations...")
            conn.execute(text("ALTER TABLE stations ADD COLUMN is_tv_mode BOOLEAN DEFAULT 0"))
            print("✅ Added is_tv_mode")
        except Exception as e:
            print(f"⚠️ Could not add is_tv_mode (might exist): {e}")

if __name__ == "__main__":
    migrate()
