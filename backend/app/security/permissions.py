from __future__ import annotations

from typing import Annotated, Iterable

from fastapi import Depends, HTTPException

from .. import models
from ..routers.auth import get_current_active_user


def require_permission(required: str | Iterable[str]):
    """
    Enforce per-user permissions for authenticated users.

    - Admins bypass permission checks.
    - Non-admin users must have the permission key in `user.permissions` or `*`.
    """

    required_set = {required} if isinstance(required, str) else {p for p in required if p}

    def _dep(current_user: Annotated[models.User, Depends(get_current_active_user)]):
        if current_user.role == "admin":
            return current_user

        perms = current_user.permissions or []
        if "*" in perms:
            return current_user

        if required_set and not any(p in perms for p in required_set):
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return current_user

    return _dep

