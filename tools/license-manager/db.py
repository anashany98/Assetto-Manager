from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent

DEFAULT_DB_URL = f"sqlite:///{(BASE_DIR / 'license_admin.db').as_posix()}"
DATABASE_URL = os.getenv("LICENSE_ADMIN_DATABASE_URL", DEFAULT_DB_URL)

connect_args: dict[str, object] = {}
engine_args: dict[str, object] = {"pool_pre_ping": True}

if DATABASE_URL.startswith("sqlite"):
    # Needed for SQLite + FastAPI threading
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args, **engine_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

