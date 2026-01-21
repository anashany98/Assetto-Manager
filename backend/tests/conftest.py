"""
Pytest configuration and fixtures
"""
import os
import tempfile
import uuid
from pathlib import Path

# Force a unique SQLite file DB per test session
os.environ["ENVIRONMENT"] = "test"
TEST_DB_PATH = Path(tempfile.gettempdir()) / f"ac_manager_test_{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models

# Use file-based SQLite for tests
SQLALCHEMY_DATABASE_URL = f"sqlite:///{TEST_DB_PATH}"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency with test database"""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create tables before tests"""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    # Seed required data
    db = TestingSessionLocal()
    # Check if station exists (it might if file persisted and remove failed)
    if not db.query(models.Station).first():
        station = models.Station(name="Sim 1", is_active=True)
        db.add(station)
        db.commit()
    db.close()

    yield
    db_session = TestingSessionLocal()
    db_session.close()
    engine.dispose()
    try:
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()
    except PermissionError:
        pass


@pytest.fixture
def client():
    """Create test client with overridden dependencies"""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
