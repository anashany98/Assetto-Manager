from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from .. import database, models
from .auth import require_admin, get_current_active_user

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_admin)]
)

class UserPermissionsUpdate(BaseModel):
    permissions: List[str]

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    permissions: Optional[List[str]] = []

    class Config:
        from_attributes = True

@router.get("/", response_model=List[UserResponse])
def list_users(db: Session = Depends(database.get_db)):
    users = db.query(models.User).all()
    # Normalize permissions to list if None
    for u in users:
        if u.permissions is None:
            u.permissions = []
    return users

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

    user.permissions = payload.permissions
    db.commit()
    db.refresh(user)
    return {"status": "ok", "permissions": user.permissions}
