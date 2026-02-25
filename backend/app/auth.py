
from datetime import datetime, timedelta, timezone
from typing import Optional
from joserfc import jwt
from joserfc.jwk import OctKey
from passlib.context import CryptContext
import logging
import os
import secrets
from pathlib import Path

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

# Persistent dev key file - stored in backend directory for development
_DEV_KEY_FILE = Path(__file__).resolve().parent.parent / ".dev_secret_key"


def _load_or_create_dev_key() -> str:
    """
    Load or create a persistent development secret key.
    This ensures JWT tokens remain valid across server restarts in development.
    """
    try:
        if _DEV_KEY_FILE.exists():
            stored_key = _DEV_KEY_FILE.read_text().strip()
            if stored_key and len(stored_key) >= 32:
                logger.info("Loaded persistent development SECRET_KEY from %s", _DEV_KEY_FILE)
                return stored_key
    except Exception as e:
        logger.warning("Failed to read dev key file: %s", e)
    
    # Generate new persistent key for development
    new_key = secrets.token_urlsafe(48)
    try:
        _DEV_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        _DEV_KEY_FILE.write_text(new_key)
        # Set restrictive permissions (readable only by owner)
        _DEV_KEY_FILE.chmod(0o600)
        logger.info("Generated and saved persistent development SECRET_KEY to %s", _DEV_KEY_FILE)
    except Exception as e:
        logger.warning("Failed to save dev key file: %s. Using in-memory key for this session.", e)
    
    return new_key


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

    # Dev/test fallback: use persistent key file to maintain sessions across restarts
    logger.info("SECRET_KEY not configured. Using persistent development key.")
    return _load_or_create_dev_key()


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
