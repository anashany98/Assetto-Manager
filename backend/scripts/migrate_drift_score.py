from sqlalchemy import create_engine, text
from app.database import SQLALCHEMY_DATABASE_URL
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        logger.info("Starting migration: Adding score columns...")
        
        # Add total_score to session_results if not exists
        try:
            conn.execute(text("ALTER TABLE session_results ADD COLUMN total_score INTEGER DEFAULT 0"))
            logger.info("Added total_score to session_results")
        except Exception as e:
            logger.warning(f"Could not add total_score (might exist): {e}")

        # Add score to laptimes if not exists
        try:
            conn.execute(text("ALTER TABLE laptimes ADD COLUMN score INTEGER DEFAULT 0"))
            logger.info("Added score to laptimes")
        except Exception as e:
            logger.warning(f"Could not add score (might exist): {e}")
            
        logger.info("Migration completed.")

if __name__ == "__main__":
    migrate()
