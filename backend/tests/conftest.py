"""
Pytest configuration and fixtures
"""
import os
# Force SQLite file DB for tests
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models

# Use file-based SQLite for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
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
    # Clean previous run
    if os.path.exists("./test.db"):
        try:
            os.remove("./test.db")
        except PermissionError:
            pass

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
    # No drop at end to avoid locking issues on Windows
    db_session = TestingSessionLocal()
    db_session.close()
    engine.dispose()


@pytest.fixture
def client():
    """Create test client with overridden dependencies"""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
