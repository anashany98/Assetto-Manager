#!/usr/bin/env python
"""
Bootstrap database schema by creating all tables if they don't exist.
This is used in production when AUTO_SCHEMA is false but we still need to
create tables on first deployment.
"""
import sys
import os

# Add the backend directory to the path so we can import from app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.app.database import engine, Base
from backend.app import models  # Import all models to ensure they are registered with Base

def main():
    print("Creating database schema...")
    Base.metadata.create_all(bind=engine)
    print("Database schema created successfully.")

if __name__ == "__main__":
    main()