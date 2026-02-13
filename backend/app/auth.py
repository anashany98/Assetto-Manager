
from datetime import datetime, timedelta, timezone
from typing import Optional
from joserfc import jwt
from joserfc.jwk import OctKey
from passlib.context import CryptContext
import logging
import os
import secrets

# Configuration
# Prefer env vars and avoid static fallback secrets.
ENVIRONMENT = (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()
logger = logging.getLogger(__name__)

_INSECURE_SECRET_SENTINELS = {
    "change-me",
    "changeme",
    "replace-me",
    "default",
    "password",
    "secret",
    "your-secret",
    "your-secret-key",
    "test",
    "dev",
    "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7",
}


def _load_secret_key() -> str:
    candidate = (os.getenv("SECRET_KEY") or "").strip()
    if candidate:
        if ENVIRONMENT == "production":
            if candidate.lower() in _INSECURE_SECRET_SENTINELS:
                raise RuntimeError("SECRET_KEY uses an insecure placeholder value")
            if len(candidate) < 32:
                raise RuntimeError("SECRET_KEY must be at least 32 characters in production")
        return candidate

    if ENVIRONMENT == "production":
        raise RuntimeError("SECRET_KEY must be set in production")

    # Dev/test fallback: random per-process key (tokens rotate on restart).
    ephemeral = secrets.token_urlsafe(48)
    logger.warning(
        "SECRET_KEY not configured; using ephemeral in-memory key. "
        "Existing JWT sessions will be invalid after restart."
    )
    return ephemeral


SECRET_KEY = _load_secret_key()

ALGORITHM = "HS256"
DEFAULT_TOKEN_EXPIRE_MINUTES = 60 if ENVIRONMENT == "production" else 60 * 24 * 365
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(DEFAULT_TOKEN_EXPIRE_MINUTES)))

# Create JWK key for joserfc
key = OctKey.import_key(SECRET_KEY)

# Using pbkdf2_sha256 to avoid bcrypt dependency issues
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    to_encode.update({"exp": int(expire.timestamp())})
    
    header = {"alg": ALGORITHM}
    token = jwt.encode(header, to_encode, key)
    return token

def decode_access_token(token: str):
    """Decode and validate a JWT token. Returns payload or raises exception."""
    decoded = jwt.decode(token, key)
    claims = decoded.claims
    exp = claims.get("exp")
    if exp is None:
        raise ValueError("Token missing exp")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if exp < now_ts:
        raise ValueError("Token expired")
    return claims
