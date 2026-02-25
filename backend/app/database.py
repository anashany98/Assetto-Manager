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

# =============================================================================
# DEPRECATED: Manual Schema Migration Functions
# =============================================================================
# These functions are DEPRECATED and will be removed in a future version.
# 
# Please use Alembic for all database migrations:
#   - Create migration: alembic revision --autogenerate -m "description"
#   - Apply migrations: alembic upgrade head
#   - Rollback: alembic downgrade -1
#
# The manual functions below are kept only for backward compatibility with
# existing databases that may have been created before Alembic was set up.
# =============================================================================

_DEPRECATION_WARNING_SHOWN = False

def _show_migration_deprecation_warning():
    """Show deprecation warning for manual migration functions."""
    global _DEPRECATION_WARNING_SHOWN
    if not _DEPRECATION_WARNING_SHOWN:
        _DEPRECATION_WARNING_SHOWN = True
        warnings.warn(
            "Manual schema migration functions (ensure_*_schema) are deprecated. "
            "Use Alembic migrations instead. Run 'alembic upgrade head' to apply migrations.",
            DeprecationWarning,
            stacklevel=3
        )
        logger.warning(
            "DEPRECATED: Manual schema migration functions are being used. "
            "Please migrate to Alembic: 'alembic upgrade head'. "
            "These functions will be removed in a future version."
        )


def ensure_station_schema(db_engine):
    """
    DEPRECATED: Use Alembic migrations instead.
    
    This function is kept for backward compatibility only.
    It will be removed in a future version.
    
    To migrate, run: alembic upgrade head
    """
    _show_migration_deprecation_warning()
    
    inspector = inspect(db_engine)
    if "stations" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("stations")}
    column_specs = {
        "is_kiosk_mode": ("BOOLEAN", "FALSE", "0"),
        "is_locked": ("BOOLEAN", "FALSE", "0"),
        "is_tv_mode": ("BOOLEAN", "FALSE", "0"),
        "is_streaming": ("BOOLEAN", "FALSE", "0"),
        "stream_url": ("VARCHAR(255)", "NULL", "NULL"),
        "is_vr": ("BOOLEAN", "FALSE", "0"),
        "last_seen": ("TIMESTAMP", "NULL", "NULL"),
        "archived_at": ("TIMESTAMP", "NULL", "NULL"),
    }

    is_postgres = db_engine.dialect.name == "postgresql"
    missing = [name for name in column_specs if name not in existing]
    if not missing:
        return

    logger.warning(
        "Manual schema modification detected for stations table. "
        "Columns %s should be added via Alembic migration.", missing
    )

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

def ensure_user_schema(db_engine):
    """
    DEPRECATED: Use Alembic migrations instead.
    
    This function is kept for backward compatibility only.
    It will be removed in a future version.
    
    To migrate, run: alembic upgrade head
    """
    _show_migration_deprecation_warning()
    
    inspector = inspect(db_engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("users")}
    column_specs = {
        "permissions": ("JSON", "'[]'::json", "'[]'"),
    }

    is_postgres = db_engine.dialect.name == "postgresql"
    missing = [name for name in column_specs if name not in existing]
    if not missing:
        return

    logger.warning(
        "Manual schema modification detected for users table. "
        "Columns %s should be added via Alembic migration.", missing
    )

    with db_engine.begin() as conn:
        for name in missing:
            col_type, default_pg, default_sqlite = column_specs[name]
            default_value = default_pg if is_postgres else default_sqlite
            if is_postgres:
                conn.execute(
                    text(
                        f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {name} {col_type} DEFAULT {default_value}"
                    )
                )
            else:
                conn.execute(
                    text(
                        f"ALTER TABLE users ADD COLUMN {name} {col_type} DEFAULT {default_value}"
                    )
                )
            logger.info("Added missing column users.%s", name)

def ensure_championship_schema(db_engine):
    """
    DEPRECATED: Use Alembic migrations instead.
    
    This function is kept for backward compatibility only.
    It will be removed in a future version.
    
    To migrate, run: alembic upgrade head
    """
    _show_migration_deprecation_warning()
    
    inspector = inspect(db_engine)
    if "championships" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("championships")}
    is_postgres = db_engine.dialect.name == "postgresql"

    if "created_at" not in existing or "updated_at" not in existing:
        logger.warning(
            "Manual schema modification detected for championships table. "
            "Columns should be added via Alembic migration."
        )

    with db_engine.begin() as conn:
        if "created_at" not in existing:
            if is_postgres:
                conn.execute(
                    text(
                        "ALTER TABLE championships "
                        "ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE"
                    )
                )
                conn.execute(text("UPDATE championships SET created_at = NOW() WHERE created_at IS NULL"))
                conn.execute(text("ALTER TABLE championships ALTER COLUMN created_at SET DEFAULT NOW()"))
                conn.execute(text("ALTER TABLE championships ALTER COLUMN created_at SET NOT NULL"))
            else:
                conn.execute(
                    text(
                        "ALTER TABLE championships "
                        "ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
                    )
                )
            logger.info("Added missing column championships.created_at")

        if "updated_at" not in existing:
            if is_postgres:
                conn.execute(
                    text(
                        "ALTER TABLE championships "
                        "ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE"
                    )
                )
            else:
                conn.execute(text("ALTER TABLE championships ADD COLUMN updated_at DATETIME"))
            logger.info("Added missing column championships.updated_at")

def ensure_table_schema(db_engine):
    inspector = inspect(db_engine)
    if "tables" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("tables")}
    column_specs = {
        "x": ("FLOAT", "0.0", "0.0"),
        "y": ("FLOAT", "0.0", "0.0"),
        "width": ("FLOAT", "50.0", "50.0"),
        "height": ("FLOAT", "50.0", "50.0"),
        "shape": ("VARCHAR(20)", "'rect'", "'rect'"),
        "seats": ("INTEGER", "4", "4"),
        "rotation": ("FLOAT", "0.0", "0.0"),
        "zone": ("VARCHAR(20)", "'main'", "'main'"),
        "fixed_notes": ("VARCHAR(255)", "NULL", "NULL"),
        "is_active": ("BOOLEAN", "TRUE", "1"),
        "status": ("VARCHAR(20)", "'free'", "'free'"),
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
                 conn.execute(text(f"ALTER TABLE tables ADD COLUMN IF NOT EXISTS {name} {col_type} DEFAULT {default_value}"))
            else:
                 conn.execute(text(f"ALTER TABLE tables ADD COLUMN {name} {col_type} DEFAULT {default_value}"))
            
            logger.info("Added missing column tables.%s", name)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
