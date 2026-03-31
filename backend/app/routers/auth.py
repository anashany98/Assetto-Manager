
from datetime import timedelta, datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
import os
import logging
from ..limiters import limiter
from ..security.api_keys import is_agent_token_allowed, is_client_token_allowed
from ..utils.token_blacklist import token_blacklist

from .. import database, models, auth
from ..auth import create_access_token, get_password_hash, verify_password, decode_access_token, create_refresh_token, decode_refresh_token, ACCESS_TOKEN_EXPIRE_MINUTES_SHORT

router = APIRouter(prefix="/auth", tags=["auth"])
ENVIRONMENT = (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()
logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
oauth2_optional = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"
_COOKIE_MAX_AGE = ACCESS_TOKEN_EXPIRE_MINUTES_SHORT * 60
_COOKIE_SAMESITE = "lax"
_COOKIE_SECURE = ENVIRONMENT == "production"
_COOKIE_PATH = "/"


def _get_token_from_request(
    token: Annotated[Optional[str], Depends(oauth2_optional)],
    request: Request,
) -> Optional[str]:
    """Read JWT from Authorization header, then fall back to httpOnly cookie."""
    if token:
        return token
    return request.cookies.get(ACCESS_COOKIE_NAME)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        max_age=_COOKIE_MAX_AGE,
        path=_COOKIE_PATH,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        max_age=30 * 24 * 3600,
        path=_COOKIE_PATH,
    )


def _clear_auth_cookies(response: Response) -> None:
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        response.delete_cookie(key=name, path=_COOKIE_PATH)


def get_current_user(
    request_token: Annotated[Optional[str], Depends(_get_token_from_request)],
    db: Session = Depends(database.get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not request_token:
        raise credentials_exception
    try:
        payload = decode_access_token(request_token)
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
    request_token: Annotated[Optional[str], Depends(_get_token_from_request)],
    db: Session = Depends(database.get_db),
):
    if not request_token:
        return None
    try:
        payload = decode_access_token(request_token)
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

from ..utils.login_rate_limiter import login_rate_limiter


def _get_client_identifier(request: Request, username: str) -> str:
    """Get a unique identifier for rate limiting (IP + username combo)."""
    client_ip = request.client.host if request.client else "unknown"
    return f"{client_ip}:{username}"


@router.post("/token")
@limiter.limit("10/minute")
def login_for_access_token(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(database.get_db)
):
    """
    Login endpoint with progressive rate limiting and httpOnly cookie support.
    Tokens are returned in JSON body (backwards compatible) AND set as httpOnly cookies.
    """
    identifier = _get_client_identifier(request, form_data.username)

    # Check for lockout first
    is_locked, remaining = login_rate_limiter.check_lockout(identifier)
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
        delay = login_rate_limiter.record_failed_attempt(identifier)

        # Log the failed attempt
        client_ip = request.client.host if request.client else "unknown"
        logger.warning(
            "Failed login attempt - username: %s, IP: %s",
            form_data.username, client_ip,
        )

        if delay == -1:
            # Account locked out
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Account locked for {login_rate_limiter.LOCKOUT_MINUTES} minutes.",
                headers={"Retry-After": str(login_rate_limiter.LOCKOUT_MINUTES * 60)}
            )

        if delay > 0:
            # Return 429 with Retry-After so the client waits, not the server.
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Please wait {delay} seconds before retrying.",
                headers={"Retry-After": str(delay)},
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Clear failed attempts on successful login
    login_rate_limiter.clear(identifier)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES_SHORT)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )

    refresh_token = create_refresh_token(
        data={"sub": user.username, "role": user.role}
    )

    # Set httpOnly cookies
    _set_auth_cookies(response, access_token, refresh_token)

    # Log successful login
    client_ip = request.client.host if request.client else "unknown"
    logger.info("Successful login - username: %s, IP: %s", user.username, client_ip)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES_SHORT * 60
    }


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    token: Annotated[Optional[str], Depends(_get_token_from_request)] = None,
):
    """Logout endpoint - blacklists the JWT token and clears cookies."""
    if token:
        try:
            payload = decode_access_token(token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                token_blacklist.add(jti, float(exp))
                logger.info("Token blacklisted (jti=%s)", jti[:8])
        except Exception:
            pass

    _clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None

@router.post("/refresh")
def refresh_access_token(
    request: Request,
    response: Response,
    token_data: Optional[RefreshTokenRequest] = None,
    db: Session = Depends(database.get_db)
):
    """
    Refresh access token using a valid refresh token.
    Returns new access and refresh tokens.
    """
    try:
        refresh_token = token_data.refresh_token if token_data else None
        if not refresh_token:
            refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing refresh token"
            )

        payload = decode_refresh_token(refresh_token)
        username = payload.get("sub")
        role = payload.get("role")
        
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES_SHORT)
        access_token = create_access_token(
            data={"sub": user.username, "role": user.role},
            expires_delta=access_token_expires
        )
        
        new_refresh_token = create_refresh_token(
            data={"sub": user.username, "role": user.role}
        )

        _set_auth_cookies(response, access_token, new_refresh_token)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "refresh_token": new_refresh_token,
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES_SHORT * 60
        }
        
    except ValueError as e:
        logger.warning("Refresh token failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired or invalid"
        )

@router.get("/users/me")
def read_users_me(current_user: Annotated[models.User, Depends(get_current_active_user)]):
    return {
        "username": current_user.username,
        "role": current_user.role,
        "permissions": current_user.permissions or [],
    }

# Initial Setup Endpoint (Only works if no users exist)
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
