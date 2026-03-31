from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from . import models
from .security.api_keys import is_client_token_allowed

logger = logging.getLogger(__name__)


def is_admin(user_or_client: object) -> bool:
    """Check if the current actor is an admin user."""
    return hasattr(user_or_client, "role") and getattr(user_or_client, "role") == "admin"


def is_kiosk_client(user_or_client: object) -> bool:
    """Check if the current actor is a kiosk client."""
    return user_or_client == "kiosk"


def normalize_kiosk_code(value: Optional[str]) -> str:
    """Normalize a kiosk code for comparison."""
    return (value or "").strip().upper()


_KIOSK_ALLOWED_SCOPES = frozenset({"kiosk:control", "payments:write", "payments:read"})


def require_client_scope(user_or_client: object, required_scope: str) -> None:
    """
    Enforce client token scopes for non-admin actors.

    Admins bypass scope checks entirely.
    Kiosk clients are granted kiosk:control and payment scopes.
    Other clients must present a valid scoped token.
    """
    if is_admin(user_or_client):
        return
    if is_kiosk_client(user_or_client):
        if required_scope in _KIOSK_ALLOWED_SCOPES:
            return
        raise HTTPException(status_code=403, detail="Kiosk client missing required scope")
    token = None if user_or_client in (None, "public") else str(user_or_client)
    if not is_client_token_allowed(token=token, required_scopes=(required_scope,)):
        raise HTTPException(status_code=403, detail="Client token missing required scope")


def require_kiosk_access(
    station: Optional[models.Station],
    kiosk_code: Optional[str],
    user_or_client: object,
) -> None:
    """
    Verify that the actor has kiosk access to the given station.

    Admins bypass kiosk checks.
    Non-kiosk clients are rejected outright.
    Kiosk clients must present a valid, non-expired kiosk code matching the station.
    """
    if is_admin(user_or_client):
        return
    if user_or_client != "kiosk":
        raise HTTPException(status_code=403, detail="Kiosk access required")
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if not station.is_kiosk_mode:
        raise HTTPException(status_code=403, detail="Kiosk mode disabled for station")
    if normalize_kiosk_code(station.kiosk_code) != normalize_kiosk_code(kiosk_code):
        raise HTTPException(status_code=403, detail="Invalid kiosk code")
    if station.kiosk_code_expires_at:
        expires_at = station.kiosk_code_expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=403, detail="Kiosk code expired")
