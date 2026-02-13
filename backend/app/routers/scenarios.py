from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import PydanticCustomError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .auth import require_admin, require_admin_or_public_token

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

ALLOWED_SESSION_TYPES = {"practice", "race", "drift", "trackday", "traffic", "overtake"}
DEFAULT_DURATIONS = [10, 15, 20]
MIN_DURATION_MINUTES = 5
MAX_DURATION_MINUTES = 180
MAX_ALLOWED_ITEMS = 500
MAX_ITEM_LENGTH = 120


def _validation_error(message: str):
    raise PydanticCustomError("scenario_validation", message)


def _normalize_name(raw: str) -> str:
    value = " ".join((raw or "").strip().split())
    if not value:
        _validation_error("Scenario name is required")
    if len(value) > 100:
        _validation_error("Scenario name must be 100 characters or less")
    return value


def _normalize_description(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    if len(value) > 255:
        _validation_error("Description must be 255 characters or less")
    return value


def _normalize_session_type(raw: str) -> str:
    value = (raw or "practice").strip().lower()
    if value not in ALLOWED_SESSION_TYPES:
        allowed = ", ".join(sorted(ALLOWED_SESSION_TYPES))
        _validation_error(f"Invalid session type. Allowed: {allowed}")
    return value


def _normalize_id_list(items: Optional[List[str]], *, field_name: str) -> List[str]:
    if items is None:
        return []
    out: List[str] = []
    seen: set[str] = set()
    for item in items:
        text = str(item).strip()
        if not text:
            continue
        if len(text) > MAX_ITEM_LENGTH:
            _validation_error(f"{field_name} values must be {MAX_ITEM_LENGTH} characters or less")
        if text in seen:
            continue
        seen.add(text)
        out.append(text)
        if len(out) > MAX_ALLOWED_ITEMS:
            _validation_error(f"{field_name} supports up to {MAX_ALLOWED_ITEMS} values")
    return out


def _normalize_durations(values: Optional[List[int]]) -> List[int]:
    if values is None:
        return list(DEFAULT_DURATIONS)
    unique_sorted = sorted({int(v) for v in values})
    if not unique_sorted:
        _validation_error("At least one duration is required")
    for minutes in unique_sorted:
        if minutes < MIN_DURATION_MINUTES or minutes > MAX_DURATION_MINUTES:
            _validation_error(
                f"Duration values must be between {MIN_DURATION_MINUTES} and {MAX_DURATION_MINUTES} minutes"
            )
    return unique_sorted


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class ScenarioBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    session_type: str = "practice"
    allowed_cars: List[str] = Field(default_factory=list)
    allowed_tracks: List[str] = Field(default_factory=list)
    allowed_durations: List[int] = Field(default_factory=lambda: list(DEFAULT_DURATIONS))
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _normalize_name(value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_description(value)

    @field_validator("session_type")
    @classmethod
    def validate_session_type(cls, value: str) -> str:
        return _normalize_session_type(value)

    @field_validator("allowed_cars")
    @classmethod
    def validate_allowed_cars(cls, value: List[str]) -> List[str]:
        return _normalize_id_list(value, field_name="allowed_cars")

    @field_validator("allowed_tracks")
    @classmethod
    def validate_allowed_tracks(cls, value: List[str]) -> List[str]:
        return _normalize_id_list(value, field_name="allowed_tracks")

    @field_validator("allowed_durations")
    @classmethod
    def validate_allowed_durations(cls, value: List[int]) -> List[int]:
        return _normalize_durations(value)


class ScenarioCreate(ScenarioBase):
    pass


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    session_type: Optional[str] = None
    allowed_cars: Optional[List[str]] = None
    allowed_tracks: Optional[List[str]] = None
    allowed_durations: Optional[List[int]] = None
    is_active: Optional[bool] = None
    expected_updated_at: Optional[datetime] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _normalize_name(value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_description(value)

    @field_validator("session_type")
    @classmethod
    def validate_session_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _normalize_session_type(value)

    @field_validator("allowed_cars")
    @classmethod
    def validate_allowed_cars(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        return _normalize_id_list(value, field_name="allowed_cars")

    @field_validator("allowed_tracks")
    @classmethod
    def validate_allowed_tracks(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        return _normalize_id_list(value, field_name="allowed_tracks")

    @field_validator("allowed_durations")
    @classmethod
    def validate_allowed_durations(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        if value is None:
            return None
        return _normalize_durations(value)


class ScenarioResponse(ScenarioBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("/", response_model=List[ScenarioResponse], dependencies=[Depends(require_admin_or_public_token)])
def get_scenarios(skip: int = 0, limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    return db.query(models.Scenario).order_by(models.Scenario.name.asc()).offset(skip).limit(limit).all()


@router.get("/{scenario_id}", response_model=ScenarioResponse, dependencies=[Depends(require_admin_or_public_token)])
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = db.query(models.Scenario).filter(models.Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.post("/", response_model=ScenarioResponse, dependencies=[Depends(require_admin)])
def create_scenario(scenario: ScenarioCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.Scenario)
        .filter(func.lower(models.Scenario.name) == scenario.name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Scenario with this name already exists")

    now = datetime.now(timezone.utc)
    db_scenario = models.Scenario(
        name=scenario.name,
        description=scenario.description,
        session_type=scenario.session_type,
        allowed_cars=scenario.allowed_cars,
        allowed_tracks=scenario.allowed_tracks,
        allowed_durations=scenario.allowed_durations,
        is_active=scenario.is_active,
        created_at=now,
        updated_at=now,
    )
    db.add(db_scenario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Scenario with this name already exists")
    db.refresh(db_scenario)
    return db_scenario


@router.put("/{scenario_id}", response_model=ScenarioResponse, dependencies=[Depends(require_admin)])
def update_scenario(scenario_id: int, scenario_update: ScenarioUpdate, db: Session = Depends(get_db)):
    db_scenario = db.query(models.Scenario).filter(models.Scenario.id == scenario_id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    update_data = scenario_update.model_dump(exclude_unset=True)
    expected_updated_at = update_data.pop("expected_updated_at", None)
    if expected_updated_at is not None:
        current_updated_at = db_scenario.updated_at or db_scenario.created_at
        if current_updated_at and _to_utc(current_updated_at) != _to_utc(expected_updated_at):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "scenario_conflict",
                    "message": "Scenario was modified by another operation. Reload and try again.",
                    "current_updated_at": current_updated_at.isoformat(),
                },
            )

    if "name" in update_data and update_data["name"].lower() != db_scenario.name.lower():
        existing = (
            db.query(models.Scenario)
            .filter(func.lower(models.Scenario.name) == update_data["name"].lower())
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Scenario with this name already exists")

    if not update_data:
        return db_scenario

    for key, value in update_data.items():
        setattr(db_scenario, key, value)
    db_scenario.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Scenario with this name already exists")
    db.refresh(db_scenario)
    return db_scenario


@router.delete("/{scenario_id}", dependencies=[Depends(require_admin)])
def delete_scenario(
    scenario_id: int,
    confirm_name: Optional[str] = Query(None, min_length=1, max_length=100),
    db: Session = Depends(get_db),
):
    db_scenario = db.query(models.Scenario).filter(models.Scenario.id == scenario_id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if confirm_name is not None and _normalize_name(confirm_name) != db_scenario.name:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Confirmation name does not match scenario name",
        )

    deleted_snapshot = ScenarioResponse.model_validate(db_scenario).model_dump(mode="json")
    db.delete(db_scenario)
    db.commit()
    return {"status": "ok", "message": "Scenario deleted", "deleted": deleted_snapshot}
