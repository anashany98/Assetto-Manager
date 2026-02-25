from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from .. import database, models
from .auth import require_admin
from ..security.license import require_license_module
from ..security.module_catalog import (
    find_invalid_permission_keys,
    list_module_catalog,
    normalize_permission_keys,
)

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_admin), Depends(require_license_module("users"))]
)

class UserPermissionsUpdate(BaseModel):
    permissions: List[str]


class ModuleInfo(BaseModel):
    key: str
    label: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    permissions: Optional[List[str]] = []

@router.get("/", response_model=List[UserResponse])
def list_users(db: Session = Depends(database.get_db)):
    users = db.query(models.User).all()
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            role=u.role,
            is_active=bool(u.is_active),
            permissions=normalize_permission_keys(u.permissions),
        )
        for u in users
    ]


@router.get("/modules", response_model=List[ModuleInfo])
def list_permission_modules():
    modules = list_module_catalog()
    modules.sort(key=lambda item: item["label"].lower())
    return modules

@router.put("/{user_id}/permissions")
def update_permissions(
    user_id: int, 
    payload: UserPermissionsUpdate, 
    db: Session = Depends(database.get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.role == 'admin':
        # Admins always have all permissions effectively, but we can store them if needed.
        # However, it's safer to not restrict admins via this list.
        pass

    normalized_permissions = normalize_permission_keys(payload.permissions)
    invalid_permissions = find_invalid_permission_keys(payload.permissions)
    if invalid_permissions:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid permission keys",
                "invalid_keys": invalid_permissions,
            },
        )

    user.permissions = normalized_permissions
    db.commit()
    db.refresh(user)
    return {"status": "ok", "permissions": user.permissions}
