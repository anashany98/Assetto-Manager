from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from .. import database, models
from .auth import require_admin
from ..security.license import (
    clear_license_cache,
    get_license_status as _get_license_status,
    verify_license_token,
)

router = APIRouter(prefix="/license", tags=["license"])

class LicenseUpdate(BaseModel):
    key: str

class LicenseStatus(BaseModel):
    client: str
    valid_until: str
    modules: List[str]
    is_valid: bool
    days_remaining: int

@router.get("/", response_model=LicenseStatus)
def get_license_status(db: Session = Depends(database.get_db)):
    return _get_license_status(db)

@router.post("/", dependencies=[Depends(require_admin)])
def update_license(data: LicenseUpdate, db: Session = Depends(database.get_db)):
    # Verify before saving
    try:
        verify_license_token(data.key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Save to Settings
    setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "license_key").first()
    if not setting:
        setting = models.GlobalSettings(key="license_key", value=data.key)
        db.add(setting)
    else:
        setting.value = data.key
    
    db.commit()
    clear_license_cache()
    return {"status": "ok", "message": "License activated successfully"}
