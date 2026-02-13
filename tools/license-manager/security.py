from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(password, hashed)
    except Exception:
        return False


def _is_strict_mode() -> bool:
    env = (os.getenv("ENVIRONMENT") or "").strip().lower()
    if env == "production":
        return True
    return (os.getenv("LICENSE_ADMIN_STRICT") or "").strip().lower() in {"1", "true", "yes"}


def _get_secret_key() -> str:
    key = (os.getenv("LICENSE_ADMIN_SECRET_KEY") or "").strip()
    if not key:
        if _is_strict_mode():
            raise RuntimeError("LICENSE_ADMIN_SECRET_KEY must be set (strict/production mode)")
        # Dev-friendly default. In real deployments, set LICENSE_ADMIN_SECRET_KEY.
        key = "dev-only-change-me"

    if _is_strict_mode() and len(key) < 32:
        raise RuntimeError("LICENSE_ADMIN_SECRET_KEY too short; use at least 32 characters")
    return key


def create_access_token(payload: dict[str, Any], *, expires_minutes: int = 60 * 12) -> str:
    now = datetime.now(timezone.utc)
    data = dict(payload)
    data["iat"] = int(now.timestamp())
    data["exp"] = int((now + timedelta(minutes=expires_minutes)).timestamp())
    return jwt.encode(data, _get_secret_key(), algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, _get_secret_key(), algorithms=["HS256"])
