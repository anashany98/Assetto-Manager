
from datetime import timedelta, datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import os
import logging
from ..limiters import limiter
from ..security.api_keys import is_agent_token_allowed, is_client_token_allowed

from .. import database, models, auth
from ..auth import create_access_token, get_password_hash, verify_password, decode_access_token

router = APIRouter(tags=["auth"])
ENVIRONMENT = (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()
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

def _is_public_token_allowed(token: Optional[str], required_scopes: tuple[str, ...] = ()) -> bool:
    allowed = is_client_token_allowed(token=token, required_scopes=required_scopes, environment=ENVIRONMENT)
    if ENVIRONMENT == "production" and not allowed and not (os.getenv("CLIENT_TOKENS") or os.getenv("CLIENT_TOKENS_JSON") or os.getenv("PUBLIC_API_TOKEN") or os.getenv("PUBLIC_WS_TOKEN")):
        logger.error("No client tokens configured for production API access")
    return allowed

def _resolve_public_token(token: Optional[str], request: Request) -> Optional[str]:
    if token:
        return token
    allow_query = os.getenv("ALLOW_PUBLIC_TOKEN_QUERY", "false").lower() in {"1", "true", "yes"}
    if allow_query:
        # Optional support for public links (e.g., manage booking) when explicitly enabled
        return request.query_params.get("token")
    return None

def _is_agent_token_allowed(token: Optional[str], required_scopes: tuple[str, ...] = ()) -> bool:
    allowed = is_agent_token_allowed(token=token, required_scopes=required_scopes, environment=ENVIRONMENT)
    if ENVIRONMENT == "production" and not allowed and not (os.getenv("AGENT_TOKENS") or os.getenv("AGENT_TOKENS_JSON") or os.getenv("AGENT_TOKEN")):
        logger.error("No agent tokens configured for production agent access")
    return allowed

def require_admin(current_user: Annotated[models.User, Depends(get_current_active_user)]):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

def require_agent_token_scoped(*required_scopes: str):
    def _dep(agent_token: Annotated[Optional[str], Header(alias="X-Agent-Token")] = None):
        if not _is_agent_token_allowed(agent_token, tuple(required_scopes)):
            raise HTTPException(status_code=403, detail="Invalid agent token")
        return agent_token or "agent"

    return _dep


def require_agent_token(agent_token: Annotated[Optional[str], Header(alias="X-Agent-Token")] = None):
    # Backwards-compatible default: any configured agent token, no scope enforcement.
    return require_agent_token_scoped()(agent_token)


def require_public_token_scoped(*required_scopes: str):
    def _dep(
        request: Request,
        client_token: Annotated[Optional[str], Header(alias="X-Client-Token")] = None,
    ):
        resolved = _resolve_public_token(client_token, request)
        if not _is_public_token_allowed(resolved, tuple(required_scopes)):
            raise HTTPException(status_code=403, detail="Invalid client token")
        return resolved or "public"

    return _dep


def require_admin_or_public_token_scoped(*required_scopes: str):
    def _dep(
        request: Request,
        current_user: Annotated[Optional[models.User], Depends(get_current_user_optional)],
        client_token: Annotated[Optional[str], Header(alias="X-Client-Token")] = None,
    ):
        if current_user:
            if not current_user.is_active:
                raise HTTPException(status_code=400, detail="Inactive user")
            if current_user.role == "admin":
                return current_user
        resolved = _resolve_public_token(client_token, request)
        if _is_public_token_allowed(resolved, tuple(required_scopes)):
            return resolved or "public"
        raise HTTPException(status_code=403, detail="Not authenticated")

    return _dep

def require_admin_or_public_token(
    request: Request,
    current_user: Annotated[Optional[models.User], Depends(get_current_user_optional)],
    client_token: Annotated[Optional[str], Header(alias="X-Client-Token")] = None
):
    # Backwards-compatible default: any configured client token, no scope enforcement.
    return require_admin_or_public_token_scoped()(request, current_user, client_token)


def require_admin_or_public_token_or_kiosk(
    request: Request,
    current_user: Annotated[Optional[models.User], Depends(get_current_user_optional)],
    client_token: Annotated[Optional[str], Header(alias="X-Client-Token")] = None,
    kiosk_code: Annotated[Optional[str], Header(alias="X-Kiosk-Code")] = None,
):
    if current_user:
        if not current_user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
        if current_user.role == "admin":
            return current_user

    # Kiosk-specific routes should prefer the paired kiosk code over any generic
    # public token that may also be present in the request.
    normalized_kiosk = (kiosk_code or "").strip()
    if normalized_kiosk:
        return "kiosk"

    resolved = _resolve_public_token(client_token, request)
    if _is_public_token_allowed(resolved):
        return resolved or "public"
    raise HTTPException(status_code=403, detail="Not authenticated")

def require_public_token(
    request: Request,
    client_token: Annotated[Optional[str], Header(alias="X-Client-Token")] = None
):
    # Backwards-compatible default: any configured client token, no scope enforcement.
    return require_public_token_scoped()(request, client_token)

def require_admin_or_agent(
    current_user: Annotated[Optional[models.User], Depends(get_current_user_optional)],
    agent_token: Annotated[Optional[str], Header(alias="X-Agent-Token")] = None
):
    if current_user:
        if not current_user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
        if current_user.role == "admin":
            return current_user
    if _is_agent_token_allowed(agent_token):
        return agent_token or "agent"
    raise HTTPException(status_code=403, detail="Not authenticated")

# ... (Helpers remain sync)

# Track failed login attempts for progressive rate limiting
# Format: {ip_or_username: {"count": int, "first_attempt": datetime, "blocked_until": datetime}}
_failed_login_attempts: dict[str, dict] = {}
import threading
_failed_attempts_lock = threading.Lock()

# Check for multi-worker deployment at startup
_worker_count = int(os.getenv("UVICORN_WORKERS", "1") or os.getenv("WEB_CONCURRENCY", "1") or "1")
if _worker_count > 1:
    logger.warning(
        "Multi-worker deployment detected (UVICORN_WORKERS=%d). "
        "In-memory rate limiting is NOT shared across workers. "
        "For production with multiple workers, consider using Redis-based rate limiting.",
        _worker_count
    )

# Progressive rate limiting configuration
MAX_FAILED_ATTEMPTS_BEFORE_LOCKOUT = 5
LOCKOUT_DURATION_MINUTES = 15
PROGRESSIVE_DELAYS = [0, 1, 2, 5, 10]  # Seconds to wait after each failed attempt


def _get_client_identifier(request: Request, username: str) -> str:
    """Get a unique identifier for rate limiting (IP + username combo)."""
    client_ip = request.client.host if request.client else "unknown"
    return f"{client_ip}:{username}"


def _check_progressive_lockout(identifier: str) -> tuple[bool, int]:
    """
    Check if an identifier is currently locked out.
    Returns (is_locked_out, remaining_seconds).
    """
    with _failed_attempts_lock:
        if identifier not in _failed_login_attempts:
            return False, 0
        
        entry = _failed_login_attempts[identifier]
        blocked_until = entry.get("blocked_until")
        if blocked_until and datetime.now(timezone.utc) < blocked_until:
            remaining = int((blocked_until - datetime.now(timezone.utc)).total_seconds())
            return True, remaining
        
        return False, 0


def _record_failed_attempt(identifier: str) -> int:
    """
    Record a failed login attempt and return the delay in seconds before next attempt is allowed.
    Implements progressive delays and eventual lockout.
    """
    with _failed_attempts_lock:
        now = datetime.now(timezone.utc)
        
        if identifier not in _failed_login_attempts:
            _failed_login_attempts[identifier] = {"count": 0, "first_attempt": now}
        
        entry = _failed_login_attempts[identifier]
        entry["count"] += 1
        entry["last_attempt"] = now
        
        # Check for lockout
        if entry["count"] >= MAX_FAILED_ATTEMPTS_BEFORE_LOCKOUT:
            blocked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            entry["blocked_until"] = blocked_until
            logger.warning(
                "Login lockout triggered for %s after %d failed attempts. Locked until %s",
                identifier, entry["count"], blocked_until
            )
            return -1  # Special value indicating lockout
        
        # Return progressive delay
        delay_index = min(entry["count"] - 1, len(PROGRESSIVE_DELAYS) - 1)
        return PROGRESSIVE_DELAYS[delay_index]


def _clear_failed_attempts(identifier: str) -> None:
    """Clear failed attempts after successful login."""
    with _failed_attempts_lock:
        _failed_login_attempts.pop(identifier, None)


def _cleanup_old_attempts() -> None:
    """Clean up old failed attempt records (called periodically)."""
    now = datetime.now(timezone.utc)
    with _failed_attempts_lock:
        to_remove = []
        for identifier, entry in _failed_login_attempts.items():
            # Remove entries older than 1 hour or with expired lockouts
            last_attempt = entry.get("last_attempt", entry.get("first_attempt", now))
            blocked_until = entry.get("blocked_until")
            
            if blocked_until and now > blocked_until:
                to_remove.append(identifier)
            elif (now - last_attempt).total_seconds() > 3600:  # 1 hour
                to_remove.append(identifier)
        
        for identifier in to_remove:
            del _failed_login_attempts[identifier]


@router.post("/token")
@limiter.limit("10/minute")  # Base rate limit
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(database.get_db)
):
    """
    Login endpoint with progressive rate limiting:
    - Base limit: 10 attempts per minute per IP
    - Progressive delays: 0s, 1s, 2s, 5s, 10s after each failed attempt
    - Lockout: 15 minutes after 5 consecutive failed attempts
    - Audit logging of all failed attempts
    """
    identifier = _get_client_identifier(request, form_data.username)
    
    # Check for lockout first
    is_locked, remaining = _check_progressive_lockout(identifier)
    if is_locked:
        logger.warning(
            "Login attempt blocked for locked out identifier %s. Remaining: %ds",
            identifier, remaining
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked. Try again in {remaining} seconds.",
            headers={"Retry-After": str(remaining)}
        )
    
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        # Record failed attempt and get delay
        delay = _record_failed_attempt(identifier)
        
        # Log the failed attempt
        client_ip = request.client.host if request.client else "unknown"
        logger.warning(
            "Failed login attempt - username: %s, IP: %s, attempt count: %d",
            form_data.username, client_ip,
            _failed_login_attempts.get(identifier, {}).get("count", 1)
        )
        
        if delay == -1:
            # Account locked out
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Account locked for {LOCKOUT_DURATION_MINUTES} minutes.",
                headers={"Retry-After": str(LOCKOUT_DURATION_MINUTES * 60)}
            )
        
        if delay > 0:
            import time
            time.sleep(delay)  # Progressive delay
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # Clear failed attempts on successful login
    _clear_failed_attempts(identifier)
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    
    # Log successful login
    client_ip = request.client.host if request.client else "unknown"
    logger.info("Successful login - username: %s, IP: %s", user.username, client_ip)
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me")
def read_users_me(current_user: Annotated[models.User, Depends(get_current_active_user)]):
    return {
        "username": current_user.username,
        "role": current_user.role,
        "permissions": current_user.permissions or [],
    }

# Initial Setup Endpoint (Only works if no users exist)
from pydantic import BaseModel, Field, field_validator

class UserSetup(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_\-\.]+$")
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_not_trivial(cls, v: str) -> str:
        if v.lower() in {"password", "12345678", "admin1234", "changeme1"}:
            raise ValueError("Password is too common")
        return v

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
