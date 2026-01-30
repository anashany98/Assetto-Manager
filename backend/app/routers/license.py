from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
import jwt
import os
import datetime
from typing import List, Optional

from .. import database, models
from .auth import require_admin

router = APIRouter(
    prefix="/license",
    tags=["license"]
)

PUBLIC_KEY_PATH = os.path.join(os.path.dirname(__file__), "../certs/public_key.pem")

class LicenseUpdate(BaseModel):
    key: str

class LicenseStatus(BaseModel):
    client: str
    valid_until: str
    modules: List[str]
    is_valid: bool
    days_remaining: int

def verify_license_token(token: str) -> dict:
    if not os.path.exists(PUBLIC_KEY_PATH):
        # Fail safe if no key exists (development mode or broken install)
        # In strict mode, verify should fail. For now, let's return error.
        raise Exception("Public Key not found on server")

    with open(PUBLIC_KEY_PATH, "rb") as f:
        public_key = f.read()

    try:
        payload = jwt.decode(token, public_key, algorithms=["RS256"], issuer="VRacing Sim Center")
        return payload
    except jwt.ExpiredSignatureError:
        raise Exception("License has expired")
    except jwt.InvalidTokenError as e:
        raise Exception(f"Invalid license: {str(e)}")

@router.get("/", response_model=LicenseStatus)
def get_license_status(db: Session = Depends(database.get_db)):
    # Fetch from DB setting
    lic_setting = db.query(models.Setting).filter(models.Setting.key == "license_key").first()
    
    if not lic_setting or not lic_setting.value:
        return {
            "client": "Unlicensed",
            "valid_until": "-",
            "modules": [],
            "is_valid": False,
            "days_remaining": 0
        }

    try:
        payload = verify_license_token(lic_setting.value)
        exp_date = datetime.datetime.fromtimestamp(payload["exp"], tz=datetime.timezone.utc)
        now = datetime.datetime.now(datetime.timezone.utc)
        days = (exp_date - now).days
        
        return {
            "client": payload.get("sub", "Unknown"),
            "valid_until": exp_date.isoformat(),
            "modules": payload.get("modules", []),
            "is_valid": True,
            "days_remaining": days
        }
    except Exception as e:
        return {
            "client": "Invalid/Expired",
            "valid_until": "-",
            "modules": [],
            "is_valid": False,
            "days_remaining": 0
        }

@router.post("/", dependencies=[Depends(require_admin)])
def update_license(data: LicenseUpdate, db: Session = Depends(database.get_db)):
    # Verify before saving
    try:
        verify_license_token(data.key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Save to Settings
    setting = db.query(models.Setting).filter(models.Setting.key == "license_key").first()
    if not setting:
        setting = models.Setting(key="license_key", value=data.key)
        db.add(setting)
    else:
        setting.value = data.key
    
    db.commit()
    return {"status": "ok", "message": "License activated successfully"}
