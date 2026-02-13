from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db import Base, engine, get_db
from models import License, LicenseStatus, Module, Tenant, User, UserRole
from security import create_access_token, hash_password, verify_password, decode_access_token


APP_TITLE = "Assetto Manager License Admin (SaaS)"
ISSUER = "VRacing Sim Center"

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parents[1]

DEFAULT_PRIVATE_KEY_PATH = REPO_ROOT / "certs" / "private_key.pem"
DEFAULT_PUBLIC_KEY_PATH = REPO_ROOT / "certs" / "public_key.pem"

PRIVATE_KEY_PATH = Path(os.getenv("LICENSE_SIGNING_PRIVATE_KEY_PATH", str(DEFAULT_PRIVATE_KEY_PATH))).expanduser()
PUBLIC_KEY_PATH = Path(os.getenv("LICENSE_VERIFY_PUBLIC_KEY_PATH", str(DEFAULT_PUBLIC_KEY_PATH))).expanduser()

BOOTSTRAP_TOKEN = (os.getenv("LICENSE_ADMIN_BOOTSTRAP_TOKEN") or "").strip()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "tenant"


def _load_private_key() -> bytes:
    if not PRIVATE_KEY_PATH.exists():
        raise RuntimeError(f"Private key not found: {PRIVATE_KEY_PATH}")
    return PRIVATE_KEY_PATH.read_bytes()


def _load_public_key() -> bytes:
    if PUBLIC_KEY_PATH.exists():
        return PUBLIC_KEY_PATH.read_bytes()
    # Optional: derive public from private? (not implemented)
    raise RuntimeError(f"Public key not found: {PUBLIC_KEY_PATH}")


def _seed_modules(db: Session) -> None:
    defaults: list[dict[str, str]] = [
        # Core
        {"key": "dashboard", "label": "Dashboard"},
        {"key": "settings", "label": "Ajustes"},
        {"key": "stations", "label": "Estaciones"},
        {"key": "users", "label": "Usuarios"},
        {"key": "profiles", "label": "Perfiles"},
        {"key": "editor", "label": "Editor AC"},

        # Management
        {"key": "drivers", "label": "Pilotos"},
        {"key": "championships", "label": "Campeonatos"},
        {"key": "history", "label": "Historial"},

        # TV / Public tools
        {"key": "tv_remote", "label": "Mando TV"},
        {"key": "tv_spectator", "label": "Espectador TV"},
        # Content & ops
        {"key": "mods", "label": "Libreria Mods"},
        {"key": "events", "label": "Eventos/Torneos"},
        {"key": "kiosk", "label": "Modo Kiosko"},
        {"key": "bookings", "label": "Reservas Simuladores"},
        {"key": "tables", "label": "Reservas Mesas"},
        {"key": "analytics", "label": "Analitica/Ingresos"},
        {"key": "online_reservations", "label": "Reservas Online"},
        {"key": "lap_comparison", "label": "Comparar Vueltas"},
        # Public screens (LandingPage)
        {"key": "leaderboard", "label": "Clasificacion en Vivo"},
        {"key": "passport", "label": "Pasaporte Piloto"},
        {"key": "live_map", "label": "Mapa en Vivo"},
        {"key": "tv", "label": "Modo TV"},
        {"key": "hall_of_fame", "label": "Salon de la Fama"},
        {"key": "battle", "label": "Modo Batalla"},
    ]

    existing = {m.key: m for m in db.query(Module).all()}
    changed = False
    for item in defaults:
        key = item["key"]
        label = item["label"]
        row = existing.get(key)
        if not row:
            db.add(Module(key=key, label=label, is_active=True))
            changed = True
            continue
        if row.label != label and label:
            row.label = label
            changed = True
        if not row.is_active:
            row.is_active = True
            changed = True

    if changed:
        db.commit()


def _require_bootstrap_token(x_bootstrap_token: Optional[str]) -> None:
    if not BOOTSTRAP_TOKEN:
        raise HTTPException(status_code=500, detail="Bootstrap disabled (LICENSE_ADMIN_BOOTSTRAP_TOKEN not set)")
    if not x_bootstrap_token or x_bootstrap_token.strip() != BOOTSTRAP_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid bootstrap token")


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Inactive or missing user")
    return user


def require_superadmin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Superadmin required")
    return current_user


def _ensure_tenant_access(current_user: User, tenant_id: int) -> None:
    if current_user.role == UserRole.superadmin:
        return
    if not current_user.tenant_id or current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Cross-tenant access denied")


class BootstrapRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    email: str
    role: str
    tenant_id: Optional[int]


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: Optional[str] = Field(default=None, max_length=200)


class TenantResponse(BaseModel):
    id: int
    name: str
    slug: str
    is_active: bool


class UserCreate(BaseModel):
    email: str
    password: str = Field(min_length=8)
    role: UserRole = UserRole.tenant_user


class UserResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    tenant_id: Optional[int]
    is_active: bool
    created_at: datetime


class ModuleResponse(BaseModel):
    key: str
    label: str
    is_active: bool


class LicenseCreate(BaseModel):
    days: int = Field(default=365, ge=1, le=3650)
    modules: list[str] = Field(default_factory=list)
    note: Optional[str] = None


class LicenseResponse(BaseModel):
    id: int
    status: LicenseStatus
    issued_at: datetime
    valid_until: datetime
    modules: list[str]
    token: str
    note: Optional[str]


app = FastAPI(title=APP_TITLE)


@app.on_event("startup")
def _startup() -> None:
    Base.metadata.create_all(bind=engine)
    gen = get_db()
    db = next(gen)
    try:
        _seed_modules(db)
    finally:
        gen.close()


@app.get("/api/config")
def api_config() -> dict[str, Any]:
    return {
        "has_private_key": PRIVATE_KEY_PATH.exists(),
        "has_public_key": PUBLIC_KEY_PATH.exists(),
        "private_key_path": str(PRIVATE_KEY_PATH),
        "public_key_path": str(PUBLIC_KEY_PATH),
        "bootstrap_enabled": bool(BOOTSTRAP_TOKEN),
    }


@app.post("/api/auth/bootstrap")
def bootstrap_superadmin(
    payload: BootstrapRequest,
    db: Session = Depends(get_db),
    x_bootstrap_token: Annotated[Optional[str], Header(alias="X-Bootstrap-Token")] = None,
) -> dict[str, str]:
    _require_bootstrap_token(x_bootstrap_token)
    if db.query(User).count() > 0:
        raise HTTPException(status_code=400, detail="Already initialized")

    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    user = User(email=email, hashed_password=hash_password(payload.password), role=UserRole.superadmin, tenant_id=None)
    db.add(user)
    db.commit()
    return {"status": "ok"}


@app.post("/api/auth/token", response_model=LoginResponse)
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db),
) -> LoginResponse:
    email = (form_data.username or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(form_data.password or "", user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id), "role": user.role.value, "tenant_id": user.tenant_id})
    return LoginResponse(access_token=token)


@app.get("/api/me", response_model=MeResponse)
def api_me(current_user: Annotated[User, Depends(get_current_user)]) -> MeResponse:
    return MeResponse(id=current_user.id, email=current_user.email, role=current_user.role.value, tenant_id=current_user.tenant_id)


@app.get("/api/modules", response_model=list[ModuleResponse])
def list_modules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[ModuleResponse]:
    modules = db.query(Module).filter(Module.is_active == True).order_by(Module.key.asc()).all()  # noqa: E712
    return [ModuleResponse(key=m.key, label=m.label, is_active=m.is_active) for m in modules]


@app.get("/api/tenants", response_model=list[TenantResponse])
def list_tenants(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[TenantResponse]:
    if current_user.role == UserRole.superadmin:
        tenants = db.query(Tenant).order_by(Tenant.name.asc()).all()
    else:
        if not current_user.tenant_id:
            return []
        tenants = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).all()
    return [TenantResponse(id=t.id, name=t.name, slug=t.slug, is_active=t.is_active) for t in tenants]


@app.post("/api/tenants", response_model=TenantResponse, dependencies=[Depends(require_superadmin)])
def create_tenant(payload: TenantCreate, db: Session = Depends(get_db)) -> TenantResponse:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")

    base_slug = _slugify(payload.slug or name)
    slug = base_slug
    i = 1
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        i += 1
        slug = f"{base_slug}-{i}"

    tenant = Tenant(name=name, slug=slug, is_active=True)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return TenantResponse(id=tenant.id, name=tenant.name, slug=tenant.slug, is_active=tenant.is_active)


@app.get("/api/tenants/{tenant_id}/users", response_model=list[UserResponse])
def list_tenant_users(
    tenant_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[UserResponse]:
    _ensure_tenant_access(current_user, tenant_id)
    users = db.query(User).filter(User.tenant_id == tenant_id).order_by(User.email.asc()).all()
    return [
        UserResponse(
            id=u.id,
            email=u.email,
            role=u.role,
            tenant_id=u.tenant_id,
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]


@app.post("/api/tenants/{tenant_id}/users", response_model=UserResponse)
def create_tenant_user(
    tenant_id: int,
    payload: UserCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> UserResponse:
    if current_user.role == UserRole.superadmin:
        # superadmin can create tenant_admin or tenant_user
        if payload.role == UserRole.superadmin:
            raise HTTPException(status_code=400, detail="Cannot create superadmin in tenant scope")
    else:
        _ensure_tenant_access(current_user, tenant_id)
        if current_user.role != UserRole.tenant_admin:
            raise HTTPException(status_code=403, detail="Tenant admin required")
        if payload.role != UserRole.tenant_user:
            raise HTTPException(status_code=403, detail="Tenant admins can only create tenant_user")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        tenant_id=user.tenant_id,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@app.get("/api/tenants/{tenant_id}/licenses", response_model=list[LicenseResponse])
def list_tenant_licenses(
    tenant_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[LicenseResponse]:
    _ensure_tenant_access(current_user, tenant_id)
    licenses = (
        db.query(License)
        .filter(License.tenant_id == tenant_id)
        .order_by(License.issued_at.desc())
        .all()
    )
    return [
        LicenseResponse(
            id=lic.id,
            status=lic.status,
            issued_at=lic.issued_at,
            valid_until=lic.valid_until,
            modules=list(lic.modules or []),
            token=lic.token,
            note=lic.note,
        )
        for lic in licenses
    ]


@app.post("/api/tenants/{tenant_id}/licenses", response_model=LicenseResponse, dependencies=[Depends(require_superadmin)])
def issue_license(
    tenant_id: int,
    payload: LicenseCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> LicenseResponse:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    modules = [str(m).strip() for m in (payload.modules or []) if str(m).strip()]
    if not modules:
        raise HTTPException(status_code=400, detail="At least one module is required")
    if "*" in modules:
        modules = ["*"]

    # Optional sanity: ensure module keys exist (except "*")
    if modules != ["*"]:
        known = {m.key for m in db.query(Module).filter(Module.is_active == True).all()}  # noqa: E712
        unknown = sorted({m for m in modules if m not in known})
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown module(s): {', '.join(unknown)}")

    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(days=payload.days)

    private_key = _load_private_key()

    lic_record = License(
        tenant_id=tenant.id,
        status=LicenseStatus.active,
        issued_at=now,
        valid_until=valid_until,
        modules=modules,
        token="__pending__",
        note=payload.note,
        issued_by_user_id=current_user.id,
    )
    db.add(lic_record)
    db.commit()
    db.refresh(lic_record)

    jwt_payload: dict[str, Any] = {
        "sub": tenant.name,
        "iss": ISSUER,
        "iat": now,
        "exp": valid_until,
        "modules": modules,
        "tenant_id": tenant.id,
        "license_id": lic_record.id,
    }
    token = jwt.encode(jwt_payload, private_key, algorithm="RS256")

    lic_record.token = token
    db.commit()
    db.refresh(lic_record)

    return LicenseResponse(
        id=lic_record.id,
        status=lic_record.status,
        issued_at=lic_record.issued_at,
        valid_until=lic_record.valid_until,
        modules=list(lic_record.modules or []),
        token=lic_record.token,
        note=lic_record.note,
    )


@app.post("/api/licenses/{license_id}/revoke", dependencies=[Depends(require_superadmin)])
def revoke_license(
    license_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict[str, str]:
    lic = db.query(License).filter(License.id == license_id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    if lic.status == LicenseStatus.revoked:
        return {"status": "ok"}
    lic.status = LicenseStatus.revoked
    lic.revoked_at = datetime.now(timezone.utc)
    lic.revoked_by_user_id = current_user.id
    db.commit()
    return {"status": "ok"}


@app.get("/api/public-key")
def get_public_key() -> dict[str, str]:
    # Handy for clients to configure LICENSE_PUBLIC_KEY_PATH/LINCENSE_PUBLIC_KEY.
    return {"public_key_pem": _load_public_key().decode("utf-8")}


# Serve frontend
app.mount("/", StaticFiles(directory=str(BASE_DIR / "static"), html=True), name="static")
