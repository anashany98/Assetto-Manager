"""
Pytest configuration and fixtures
"""
import os
import tempfile
import uuid
from pathlib import Path

# Force a unique SQLite file DB per test session
os.environ["ENVIRONMENT"] = "test"
# Enable all features so tests exercise the actual feature logic
os.environ.setdefault("PAYMENTS_ENABLED", "true")
os.environ.setdefault("EMAILS_ENABLED", "true")
TEST_DB_PATH = Path(tempfile.gettempdir()) / f"ac_manager_test_{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.routers import auth as auth_router
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
    # Ensure at least 2 stations exist for booking capacity tests
    existing_count = db.query(models.Station).count()
    if existing_count < 2:
        for idx in range(existing_count + 1, 3):
            db.add(models.Station(name=f"Sim {idx}", is_active=True))
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
    class _TestAdmin:
        role = "admin"
        is_active = True
        username = "test_admin"

    def _test_admin():
        return _TestAdmin()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[auth_router.require_admin] = _test_admin
    app.dependency_overrides[auth_router.require_admin_or_public_token] = _test_admin
    app.dependency_overrides[auth_router.require_admin_or_public_token_or_kiosk] = _test_admin
    app.dependency_overrides[auth_router.require_admin_or_agent] = _test_admin
    app.dependency_overrides[auth_router.get_current_active_user] = _test_admin
    app.dependency_overrides[auth_router.require_public_token] = lambda: "public"
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client_no_auth():
    """Create test client without auth overrides (use real auth dependencies)."""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
