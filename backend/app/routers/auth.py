
from datetime import timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import os
import logging
from ..limiters import limiter

from .. import database, models, auth
from ..auth import create_access_token, get_password_hash, verify_password, decode_access_token

router = APIRouter(tags=["auth"])
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
oauth2_optional = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_user_optional(
    token: Annotated[Optional[str], Depends(oauth2_optional)],
    db: Session = Depends(database.get_db)
):
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_current_active_user(current_user: Annotated[models.User, Depends(get_current_user)]):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def _is_public_token_allowed(token: Optional[str]) -> bool:
    expected = os.getenv("PUBLIC_API_TOKEN") or os.getenv("PUBLIC_WS_TOKEN")
    if ENVIRONMENT == "production":
        if not expected:
            logger.error("PUBLIC_API_TOKEN not configured for production API access")
            return False
        return token == expected
    if expected and token != expected:
        return False
    return True

def _is_agent_token_allowed(token: Optional[str]) -> bool:
    expected = os.getenv("AGENT_TOKEN")
    if ENVIRONMENT == "production":
        if not expected:
            logger.error("AGENT_TOKEN not configured for production agent access")
            return False
        return token == expected
    if expected and token != expected:
        return False
    return True

def require_admin(current_user: Annotated[models.User, Depends(get_current_active_user)]):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

def require_agent_token(
    token: Annotated[Optional[str], Header(None, alias="X-Agent-Token")]
):
    if not _is_agent_token_allowed(token):
        raise HTTPException(status_code=403, detail="Invalid agent token")
    return token or "agent"

def require_admin_or_public_token(
    token: Annotated[Optional[str], Header(None, alias="X-Client-Token")],
    current_user: Annotated[Optional[models.User], Depends(get_current_user_optional)]
):
    if current_user:
        if not current_user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
        if current_user.role == "admin":
            return current_user
    if _is_public_token_allowed(token):
        return token or "public"
    raise HTTPException(status_code=403, detail="Not authenticated")

def require_admin_or_agent(
    token: Annotated[Optional[str], Header(None, alias="X-Agent-Token")],
    current_user: Annotated[Optional[models.User], Depends(get_current_user_optional)]
):
    if current_user:
        if not current_user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
        if current_user.role == "admin":
            return current_user
    if _is_agent_token_allowed(token):
        return token or "agent"
    raise HTTPException(status_code=403, detail="Not authenticated")

# ... (Helpers remain sync)

@router.post("/token")
@limiter.limit("5/minute")
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(database.get_db)
):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me")
def read_users_me(current_user: Annotated[models.User, Depends(get_current_active_user)]):
    return {"username": current_user.username, "role": current_user.role}

# Initial Setup Endpoint (Only works if no users exist)
from pydantic import BaseModel
class UserSetup(BaseModel):
    username: str
    password: str

@router.post("/users/setup")
@limiter.limit("3/hour")
def setup_admin(
    request: Request,
    data: UserSetup,
    db: Session = Depends(database.get_db),
    setup_token: Optional[str] = Header(None, alias="X-Setup-Token")
):
    if db.query(models.User).count() > 0:
         raise HTTPException(status_code=400, detail="Users already exist. Setup disabled.")

    expected_setup_token = os.getenv("SETUP_TOKEN")
    if ENVIRONMENT == "production" and not expected_setup_token:
        raise HTTPException(status_code=500, detail="SETUP_TOKEN not configured")
    if expected_setup_token and setup_token != expected_setup_token:
        raise HTTPException(status_code=403, detail="Invalid setup token")
    
    hashed = get_password_hash(data.password)
    user = models.User(username=data.username, hashed_password=hashed, role="admin")
    db.add(user)
    db.commit()
    return {"status": "ok", "message": "Admin user created"}

@router.post("/register")
@limiter.limit("5/hour")
def register_user(
    request: Request,
    data: UserSetup,
    db: Session = Depends(database.get_db)
):
    if ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Registration disabled in production")
    existing_user = db.query(models.User).filter(models.User.username == data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed = get_password_hash(data.password)
    # Default to admin role for local instances as verified earlier
    new_user = models.User(username=data.username, hashed_password=hashed, role="admin", is_active=True)
    db.add(new_user)
    db.commit()
    return {"status": "ok", "message": "User registered successfully"}
