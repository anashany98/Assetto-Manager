from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from .. import models, database
from ..database import get_db

router = APIRouter(
    prefix="/scenarios",
    tags=["scenarios"]
)

# --- Pydantic Schemas ---
class ScenarioBase(BaseModel):
    name: str
    description: Optional[str] = None
    allowed_cars: List[str] = [] # List of car IDs/names
    allowed_tracks: List[str] = [] # List of track IDs/names
    allowed_durations: List[int] = [10, 15, 20]
    is_active: bool = True

class ScenarioCreate(ScenarioBase):
    pass

class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    allowed_cars: Optional[List[str]] = None
    allowed_tracks: Optional[List[str]] = None
    allowed_durations: Optional[List[int]] = None
    is_active: Optional[bool] = None

class ScenarioResponse(ScenarioBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Endpoints ---

@router.get("/", response_model=List[ScenarioResponse])
def get_scenarios(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Scenario).offset(skip).limit(limit).all()

@router.get("/{scenario_id}", response_model=ScenarioResponse)
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = db.query(models.Scenario).filter(models.Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario

@router.post("/", response_model=ScenarioResponse)
def create_scenario(scenario: ScenarioCreate, db: Session = Depends(get_db)):
    # Check name uniqueness
    existing = db.query(models.Scenario).filter(models.Scenario.name == scenario.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Scenario with this name already exists")
    
    db_scenario = models.Scenario(
        name=scenario.name,
        description=scenario.description,
        allowed_cars=scenario.allowed_cars,
        allowed_tracks=scenario.allowed_tracks,
        allowed_durations=scenario.allowed_durations,
        is_active=scenario.is_active
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    return db_scenario

@router.put("/{scenario_id}", response_model=ScenarioResponse)
def update_scenario(scenario_id: int, scenario_update: ScenarioUpdate, db: Session = Depends(get_db)):
    db_scenario = db.query(models.Scenario).filter(models.Scenario.id == scenario_id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    update_data = scenario_update.dict(exclude_unset=True)
    
    if "name" in update_data and update_data["name"] != db_scenario.name:
        existing = db.query(models.Scenario).filter(models.Scenario.name == update_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Scenario with this name already exists")

    for key, value in update_data.items():
        setattr(db_scenario, key, value)
    
    db.commit()
    db.refresh(db_scenario)
    return db_scenario

@router.delete("/{scenario_id}")
def delete_scenario(scenario_id: int, db: Session = Depends(get_db)):
    db_scenario = db.query(models.Scenario).filter(models.Scenario.id == scenario_id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    db.delete(db_scenario)
    db.commit()
    return {"status": "ok", "message": "Scenario deleted"}
