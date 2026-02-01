from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
import jwt
import os
import datetime
from typing import List, Optional

from .. import database, models
from ..paths import REPO_ROOT
from .auth import require_admin

router = APIRouter(
    prefix="/license",
    tags=["license"]
)

DEFAULT_PUBLIC_KEY_PATH = REPO_ROOT / "certs" / "public_key.pem"

def _load_public_key() -> bytes:
    env_key = os.getenv("LICENSE_PUBLIC_KEY")
    if env_key:
        return env_key.encode("utf-8")
    env_path = os.getenv("LICENSE_PUBLIC_KEY_PATH")
    if env_path:
        key_path = os.path.expanduser(env_path)
        if os.path.exists(key_path):
            with open(key_path, "rb") as f:
                return f.read()
    if DEFAULT_PUBLIC_KEY_PATH.exists():
        with open(DEFAULT_PUBLIC_KEY_PATH, "rb") as f:
            return f.read()
    raise Exception("Public Key not found on server")

class LicenseUpdate(BaseModel):
    key: str

class LicenseStatus(BaseModel):
    client: str
    valid_until: str
    modules: List[str]
    is_valid: bool
    days_remaining: int

def verify_license_token(token: str) -> dict:
    public_key = _load_public_key()

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
