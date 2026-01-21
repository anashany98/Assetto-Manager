
from datetime import datetime, timedelta, timezone
from typing import Optional
from joserfc import jwt
from joserfc.jwk import OctKey
from passlib.context import CryptContext
import os

# Configuration
# Prefer env vars, fallback to dev defaults
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if ENVIRONMENT == "production":
        raise RuntimeError("SECRET_KEY must be set in production")
    SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"

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
