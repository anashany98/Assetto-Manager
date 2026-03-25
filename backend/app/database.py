import logging
import os
from pathlib import Path
from sqlalchemy import create_engine
from dotenv import load_dotenv
import warnings

load_dotenv()
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import event, inspect, text

logger = logging.getLogger(__name__)

# Supabase (PostgreSQL) by default; tests may override with SQLite.
ENVIRONMENT = (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()
STRICT_CONFIG = os.getenv("REQUIRE_SECRETS", "false").lower() in {"1", "true", "yes"}
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
if not SQLALCHEMY_DATABASE_URL:
    if ENVIRONMENT == "production" or STRICT_CONFIG:
        raise RuntimeError("DATABASE_URL is required in production or strict config mode.")
    # Fallback to local SQLite if no DATABASE_URL is provided in .env
    SQLALCHEMY_DATABASE_URL = "sqlite:///./ac_manager_local.db"
    logger.warning("DATABASE_URL not set. Falling back to local SQLite: %s", SQLALCHEMY_DATABASE_URL)

connect_args = {}
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    connect_args = {"check_same_thread": False}

engine_args = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

if "sqlite" not in SQLALCHEMY_DATABASE_URL:
    engine_args.update({
        "pool_size": 10,
        "max_overflow": 20
    })

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args=connect_args,
    **engine_args
)

# Enable Write-Ahead Logging (WAL) for concurrency ONLY for SQLite
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass
