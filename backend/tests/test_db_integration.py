
import os
import pytest
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app import models, schemas
import uuid
import time

# Dependency to get DB session
@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

RUN_INTEGRATION_TESTS = os.getenv("RUN_INTEGRATION_TESTS") == "1"


@pytest.mark.skipif(
    not RUN_INTEGRATION_TESTS,
    reason="Set RUN_INTEGRATION_TESTS=1 to run against the Supabase database."
)
def test_create_and_delete_session_integration(db: Session):
    """
    Integration test that connects to the REAL database (Supabase),
    creates a dummy session, verifies it, and then deletes it.
    """
    # 1. Setup: Create unique test data
    test_id = str(uuid.uuid4())[:8]
    driver_name = f"TEST_DRIVER_{test_id}"
    track_name = "test_track_monza"
    
    # Create a SessionResult (simulate a completed race)
    new_session = models.SessionResult(
        track_name=track_name,
        driver_name=driver_name,
        car_model="ferrari_488_gt3",
        session_type="PRACTICE",
        best_lap=0
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    session_id = new_session.id
    assert session_id is not None
    
    try:
        # 2. Add a LapTime for this session
        lap = models.LapTime(
            session_id=session_id,
            lap_number=1,
            time=120000, # 2 minutes
            splits=[40000, 40000, 40000],
            valid=True
        )
        db.add(lap)
        db.commit()
        
        # 3. Verify Data exists
        stored_session = db.query(models.SessionResult).filter(models.SessionResult.driver_name == driver_name).first()
        assert stored_session is not None
        assert stored_session.id == session_id
        
        stored_lap = db.query(models.LapTime).filter(models.LapTime.session_id == session_id).first()
        assert stored_lap is not None
        assert stored_lap.time == 120000
        
        print(f"\n✅ Created test session {session_id} for driver {driver_name}")

    finally:
        # 4. Teardown: DELETE EVERYTHING
        # Delete the laps
        db.query(models.LapTime).filter(models.LapTime.session_id == session_id).delete()
        # Delete the session
        db.query(models.SessionResult).filter(models.SessionResult.id == session_id).delete()
        db.commit()
        
        # Verify it's gone
        deleted_session = db.query(models.SessionResult).filter(models.SessionResult.id == session_id).first()
        assert deleted_session is None
        print(f"✅ Cleaned up test data.")
