"""
One-time database bootstrap for fresh installations.

This project does NOT run AUTO_SCHEMA in production, so a new database needs an explicit
bootstrap step to create tables before starting the server in production mode.

Usage (from repo root):
  py -3.11 bootstrap_db.py
  python bootstrap_db.py
"""

from backend.app.database import Base, engine

# Ensure all models are registered in Base.metadata before create_all().
from backend.app import models  # noqa: F401


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print("OK: database schema ensured (create_all).")


if __name__ == "__main__":
    main()

