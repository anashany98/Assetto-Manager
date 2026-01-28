import logging
import os
from pathlib import Path
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import event, inspect, text

# Supabase (PostgreSQL) by default; tests may override with SQLite.
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
if not SQLALCHEMY_DATABASE_URL:
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
logger = logging.getLogger(__name__)

def ensure_station_schema(db_engine):
    inspector = inspect(db_engine)
    if "stations" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("stations")}
    column_specs = {
        "is_kiosk_mode": ("BOOLEAN", "FALSE", "0"),
        "is_locked": ("BOOLEAN", "FALSE", "0"),
        "is_tv_mode": ("BOOLEAN", "FALSE", "0"),
        "is_vr": ("BOOLEAN", "FALSE", "0"),
        "last_seen": ("TIMESTAMP", "NULL", "NULL"),
        "archived_at": ("TIMESTAMP", "NULL", "NULL"),
    }

    is_postgres = db_engine.dialect.name == "postgresql"
    missing = [name for name in column_specs if name not in existing]
    if not missing:
        return

    with db_engine.begin() as conn:
        for name in missing:
            col_type, default_pg, default_sqlite = column_specs[name]
            default_value = default_pg if is_postgres else default_sqlite
            if is_postgres:
                conn.execute(
                    text(
                        f"ALTER TABLE stations ADD COLUMN IF NOT EXISTS {name} {col_type} DEFAULT {default_value}"
                    )
                )
            else:
                conn.execute(
                    text(
                        f"ALTER TABLE stations ADD COLUMN {name} {col_type} DEFAULT {default_value}"
                    )
                )
            logger.info("Added missing column stations.%s", name)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
