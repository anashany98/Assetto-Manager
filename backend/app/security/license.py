from __future__ import annotations

import datetime
import os
from typing import Any, Iterable

import jwt
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .. import database, models
from ..paths import REPO_ROOT
from ..utils.ttl_cache import TTLCache


DEFAULT_PUBLIC_KEY_PATH = REPO_ROOT / "certs" / "public_key.pem"
_license_cache = TTLCache(ttl_seconds=int(os.getenv("LICENSE_CACHE_SECONDS", "10")), maxsize=8)


def clear_license_cache() -> None:
    _license_cache.clear()


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
    raise RuntimeError("License public key not found on server")


def verify_license_token(token: str) -> dict[str, Any]:
    public_key = _load_public_key()
    payload = jwt.decode(token, public_key, algorithms=["RS256"], issuer="VRacing Sim Center")
    if not isinstance(payload, dict):
        raise ValueError("Invalid license payload")
    return payload


def _get_license_key(db: Session) -> str | None:
    setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == "license_key").first()
    if not setting or not setting.value:
        return None
    return str(setting.value)


def get_license_payload(db: Session) -> dict[str, Any] | None:
    key = _get_license_key(db)
    if not key:
        return None

    cached = _license_cache.get("license_payload")
    if cached and isinstance(cached, dict) and cached.get("key") == key:
        return cached.get("payload")

    try:
        payload = verify_license_token(key)
    except Exception:
        payload = None

    _license_cache.set("license_payload", {"key": key, "payload": payload})
    return payload


def get_license_status(db: Session) -> dict[str, Any]:
    key = _get_license_key(db)
    if not key:
        return {
            "client": "Unlicensed",
            "valid_until": "-",
            "modules": [],
            "is_valid": False,
            "days_remaining": 0,
        }

    try:
        payload = verify_license_token(key)
        exp_date = datetime.datetime.fromtimestamp(payload["exp"], tz=datetime.timezone.utc)
        now = datetime.datetime.now(datetime.timezone.utc)
        days = (exp_date - now).days
        return {
            "client": payload.get("sub", "Unknown"),
            "valid_until": exp_date.isoformat(),
            "modules": payload.get("modules", []) or [],
            "is_valid": True,
            "days_remaining": days,
        }
    except Exception:
        return {
            "client": "Invalid/Expired",
            "valid_until": "-",
            "modules": [],
            "is_valid": False,
            "days_remaining": 0,
        }


def _is_license_enforced() -> bool:
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env == "production":
        return True
    return os.getenv("ENFORCE_LICENSE", "false").lower() in {"1", "true", "yes"}


def _module_allowed(licensed: list[str], required: set[str]) -> bool:
    if "*" in licensed:
        return True
    if not required:
        return True
    return any(m in licensed for m in required)


def require_license_module(required: str | Iterable[str]):
    """
    Enforce licensed modules at the API layer.

    `required` can be a single module key or a list of alternative keys.
    Example: require_license_module(["bookings", "reservations"])
    """

    required_set = {required} if isinstance(required, str) else {m for m in required if m}

    def _dep(db: Session = Depends(database.get_db)):
        if not _is_license_enforced():
            return True

        payload = get_license_payload(db)
        if not payload:
            raise HTTPException(status_code=403, detail="License required")

        modules = payload.get("modules") or []
        if not isinstance(modules, list):
            modules = []
        modules = [str(m) for m in modules]

        if not _module_allowed(modules, required_set):
            raise HTTPException(status_code=403, detail="Module not licensed")
        return True

    return _dep

