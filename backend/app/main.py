from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import (
    engine,
    Base,
    ensure_station_schema,
    ensure_table_schema,
    ensure_user_schema,
    ensure_championship_schema,
)
from .routers import stations, mods, websockets, settings, profiles, events, config_manager, championships, integrations, tournament, logs, ads, auth, backup, exports, loyalty, bookings, analytics, push, elimination, elo, hardware, control, drivers, payments, tables, tracks, deploy_sync, maintenance
from .routers.telemetry import router as telemetry_router  # Modular telemetry package
import logging

# ...


from .routers.logs import MemoryLogHandler
from .services.scheduler import start_scheduler, stop_scheduler

from fastapi.staticfiles import StaticFiles
import os
import shutil
from pathlib import Path
from .paths import STORAGE_DIR, PUBLIC_STORAGE_DIR, PRIVATE_STORAGE_DIR, REPO_ROOT

ENVIRONMENT = (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()
STRICT_CONFIG = os.getenv("REQUIRE_SECRETS", "false").lower() in {"1", "true", "yes"}
AUTO_SCHEMA = os.getenv("AUTO_SCHEMA", "true" if ENVIRONMENT != "production" else "false").lower() in {"1", "true", "yes"}
logger = logging.getLogger(__name__)

_PLACEHOLDER_VALUES = {
    "",
    "change-me",
    "changeme",
    "replace-me",
    "default",
    "password",
    "secret",
    "your-secret",
    "your-token",
    "none",
    "null",
}


def _is_placeholder(value: str | None) -> bool:
    return (value or "").strip().lower() in _PLACEHOLDER_VALUES

def _get_worker_count() -> int:
    for key in ("UVICORN_WORKERS", "WEB_CONCURRENCY"):
        raw = os.getenv(key)
        if raw:
            try:
                return max(1, int(raw))
            except ValueError:
                logger.warning("Invalid %s value: %s", key, raw)
    return 1

def _ensure_storage_layout():
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    migrate = os.getenv("MIGRATE_STORAGE_LAYOUT", "true").lower() in {"1", "true", "yes"}
    if not migrate:
        return

    legacy_private = ("backups", "configs")

    for name in legacy_private:
        legacy_path = STORAGE_DIR / name
        target_path = PRIVATE_STORAGE_DIR / name
        if legacy_path.exists() and not target_path.exists():
            try:
                shutil.move(str(legacy_path), str(target_path))
                logger.info("Migrated legacy storage: %s -> %s", legacy_path, target_path)
            except Exception as exc:
                logger.warning("Failed to migrate %s to private storage: %s", legacy_path, exc)

def _validate_runtime_config():
    if ENVIRONMENT != "production" and not STRICT_CONFIG:
        return
    missing = []
    invalid = []
    required_keys = [
        "DATABASE_URL",
        "SECRET_KEY",
        "ALLOWED_ORIGINS",
        "SETUP_TOKEN",
        "UPDATE_SIGNING_KEY",
    ]
    for key in required_keys:
        raw = (os.getenv(key) or "").strip()
        if not raw:
            missing.append(key)
        elif ENVIRONMENT == "production" and _is_placeholder(raw):
            invalid.append(key)
    if not (os.getenv("AGENT_TOKENS_JSON") or os.getenv("AGENT_TOKENS") or os.getenv("AGENT_TOKEN")):
        missing.append("AGENT_TOKENS_JSON/AGENT_TOKENS/AGENT_TOKEN")
    if ENVIRONMENT == "production":
        for key in ("AGENT_TOKENS_JSON", "AGENT_TOKENS", "AGENT_TOKEN"):
            val = (os.getenv(key) or "").strip()
            if val and _is_placeholder(val):
                invalid.append(key)
        secret_key = (os.getenv("SECRET_KEY") or "").strip()
        if secret_key and len(secret_key) < 32:
            raise RuntimeError("SECRET_KEY must be at least 32 characters in production")
    if ENVIRONMENT == "production":
        # License verification in production requires a public key to validate tokens.
        public_key_inline = (os.getenv("LICENSE_PUBLIC_KEY") or "").strip()
        public_key_path_raw = (os.getenv("LICENSE_PUBLIC_KEY_PATH") or "").strip()
        public_key_path = Path(public_key_path_raw).expanduser() if public_key_path_raw else None
        has_public_key = (
            bool(public_key_inline)
            or (public_key_path is not None and public_key_path.exists())
            or (REPO_ROOT / "certs" / "public_key.pem").exists()
        )
        if not has_public_key:
            missing.append("LICENSE_PUBLIC_KEY/LICENSE_PUBLIC_KEY_PATH/certs/public_key.pem")
        allow_public_query = os.getenv("ALLOW_PUBLIC_TOKEN_QUERY", "false").lower() in {"1", "true", "yes"}
        allow_ws_query = os.getenv("ALLOW_WS_TOKEN_QUERY", "false").lower() in {"1", "true", "yes"}
        allow_insecure_query = os.getenv("ALLOW_INSECURE_QUERY_TOKENS", "false").lower() in {"1", "true", "yes"}
        if (allow_public_query or allow_ws_query) and not allow_insecure_query:
            raise RuntimeError(
                "Query-string tokens are disabled in production by default. "
                "Set ALLOW_INSECURE_QUERY_TOKENS=true only if you explicitly accept this risk."
            )
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    if invalid:
        raise RuntimeError(f"Insecure placeholder values detected for: {', '.join(sorted(set(invalid)))}")
    allowed_raw = os.getenv("ALLOWED_ORIGINS", "")
    allowed = [o.strip() for o in allowed_raw.split(",") if o.strip()]
    if ENVIRONMENT == "production" and "*" in allowed:
        raise RuntimeError("ALLOWED_ORIGINS cannot include '*' in production")
    worker_count = _get_worker_count()
    allow_multi_ws = os.getenv("ALLOW_MULTI_WORKER_WS", "false").lower() in {"1", "true", "yes"}
    if worker_count > 1 and not allow_multi_ws:
        raise RuntimeError(
            "UVICORN_WORKERS>1 detected. WebSockets and in-memory state require a single worker. "
            "Set UVICORN_WORKERS=1 or ALLOW_MULTI_WORKER_WS=true if you provide external WS state."
        )
    if worker_count > 1 and allow_multi_ws:
        ws_pubsub = (os.getenv("WS_PUBSUB", "none") or "none").lower().strip()
        if ws_pubsub != "redis":
            raise RuntimeError("Multi-worker WS requires WS_PUBSUB=redis (pubsub fanout across workers)")
        if not os.getenv("REDIS_URL"):
            raise RuntimeError("Multi-worker WS requires REDIS_URL to be set")

# Lifecycle events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    _validate_runtime_config()
    if AUTO_SCHEMA and ENVIRONMENT != "production":
        logger.info("AUTO_SCHEMA enabled (Dev Only): Checking schema...")
        Base.metadata.create_all(bind=engine)
        # ensure_station_schema(engine) # DEPRECATED: Use Alembic
        # ensure_table_schema(engine) # DEPRECATED: Use Alembic
        # ensure_user_schema(engine) # DEPRECATED: Use Alembic
    else:
        logger.info("AUTO_SCHEMA disabled or Production Mode; skipping runtime schema changes")
    try:
        # Backward compatibility for databases created before championship timestamps existed.
        ensure_championship_schema(engine)
    except Exception as exc:
        logger.warning("Failed to ensure championship schema: %s", exc)
    scheduler_enabled = os.getenv("ENABLE_SCHEDULER", "true").lower() in {"1", "true", "yes"}
    worker_count = _get_worker_count()
    if worker_count > 1 and scheduler_enabled:
        force_scheduler = os.getenv("FORCE_SCHEDULER", "false").lower() in {"1", "true", "yes"}
        if not force_scheduler:
            scheduler_enabled = False
            logger.warning(
                "Scheduler disabled because UVICORN_WORKERS=%s. Set FORCE_SCHEDULER=true to override.",
                worker_count,
            )
    if scheduler_enabled:
        start_scheduler()
    else:
        logger.info("Scheduler disabled by ENABLE_SCHEDULER")

    # Optional cross-worker WS pubsub (Redis)
    from .routers.websockets import manager as ws_manager
    await ws_manager.start_pubsub()
    yield
    # Shutdown
    await ws_manager.stop_pubsub()
    stop_scheduler()


app = FastAPI(
    title="AC Manager Central Server",
    description="API for managing Assetto Corsa mods and simulators",
    version="0.1.0",
    lifespan=lifespan
)

# Never serve sensitive storage paths via static files, even if they exist on disk.
# Keep this defense even if storage is restructured later.
@app.middleware("http")
async def block_private_static_paths(request, call_next):
    path = request.url.path or ""
    if path.startswith("/static/private") or path.startswith("/static/backups") or path.startswith("/static/configs"):
        raise HTTPException(status_code=404, detail="Not found")
    return await call_next(request)

# CSP Middleware - Allow eval for React/Vite dev tools compatibility
from starlette.middleware.base import BaseHTTPMiddleware

class CSPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # Permissive CSP for dev tools; tighter defaults in production.
        if ENVIRONMENT == "production":
            csp_policy = (
                "default-src 'self'; "
                "script-src 'self'; "
                "worker-src 'self' blob:; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self' data:; "
                "connect-src 'self' https: http: wss: ws:;"
            )
        else:
            csp_policy = (
                "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; "
                "script-src * data: blob: 'unsafe-inline' 'unsafe-eval'; "
                "worker-src * data: blob: 'unsafe-inline' 'unsafe-eval'; "
                "style-src * data: blob: 'unsafe-inline'; "
                "img-src * data: blob:; "
                "media-src * data: blob:; "
                "font-src * data:; "
                "connect-src * data: blob: wss: ws:;"
            )
        response.headers["Content-Security-Policy"] = csp_policy
        return response

app.add_middleware(CSPMiddleware)

# Security headers (production hardening)
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
        if ENVIRONMENT == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Global Exception Handler
from fastapi.responses import JSONResponse
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from time import perf_counter
from uuid import uuid4
from .observability import record_request
import logging
from logging.handlers import RotatingFileHandler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Persistent log file
LOG_DIR = Path(os.getenv("LOG_DIR", str(REPO_ROOT / "logs")))
LOG_DIR.mkdir(parents=True, exist_ok=True)

def _configure_file_logging():
    log_path = LOG_DIR / "backend.log"
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        if isinstance(handler, RotatingFileHandler) and getattr(handler, "baseFilename", "") == str(log_path):
            return
    max_bytes = int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024)))
    backup_count = int(os.getenv("LOG_BACKUP_COUNT", "5"))
    file_handler = RotatingFileHandler(
        str(log_path),
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root_logger.addHandler(file_handler)

_configure_file_logging()

# Attach Memory Handler for UI Logs
# Use protected handler to prevent crash
root_logger = logging.getLogger()
memory_handler = MemoryLogHandler()
memory_handler.setLevel(logging.INFO)
root_logger.addHandler(memory_handler)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global Exception: {exc}", exc_info=True)
    detail = str(exc)
    if ENVIRONMENT == "production":
        detail = "Internal Server Error"
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error. The system recovered automatically.", "detail": detail},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "message": "Request failed",
            "detail": exc.detail,
            "code": exc.status_code,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "message": "Validation error",
            "detail": exc.errors(),
            "code": 422,
        },
    )


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    start = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (perf_counter() - start) * 1000
        route = request.scope.get("route")
        # Use the templated route for metrics to avoid cardinality/memory blow-ups
        # from random 404 paths or user-controlled segments.
        metrics_path = route.path if route else "<unmatched>"
        # Keep logs readable by using the real path when the route is not resolved.
        log_path = route.path if route else request.url.path
        record_request(request.method, metrics_path, 500, duration_ms)
        logger.exception(
            "Request failed %s %s duration_ms=%.2f request_id=%s",
            request.method,
            log_path,
            duration_ms,
            request_id,
        )
        raise

    duration_ms = (perf_counter() - start) * 1000
    route = request.scope.get("route")
    metrics_path = route.path if route else "<unmatched>"
    log_path = route.path if route else request.url.path
    record_request(request.method, metrics_path, response.status_code, duration_ms)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "Request %s %s status=%s duration_ms=%.2f request_id=%s",
        request.method,
        log_path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response

# Ensure storage directory layout exists
_ensure_storage_layout()
app.mount("/static", StaticFiles(directory=str(PUBLIC_STORAGE_DIR)), name="static")

# CORS Configuration
allowed_origin_raw = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [o.strip() for o in allowed_origin_raw.split(",") if o.strip()]
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ["*"]
ALLOW_CREDENTIALS = "*" not in ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Rate Limiting
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from .limiters import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(profiles.router)
app.include_router(mods.router)
app.include_router(settings.router)
app.include_router(stations.router)
app.include_router(telemetry_router)
app.include_router(events.router)
app.include_router(config_manager.router)
app.include_router(championships.router)
app.include_router(integrations.router)
app.include_router(websockets.router)
app.include_router(tournament.router)
app.include_router(logs.router)
app.include_router(ads.router)
app.include_router(auth.router)
app.include_router(backup.router)
app.include_router(exports.router)

from .routers import system
app.include_router(system.router)

from .routers import user_management, license
app.include_router(user_management.router)
app.include_router(license.router)
app.include_router(loyalty.router)
app.include_router(bookings.router)
app.include_router(analytics.router)
app.include_router(push.router)
app.include_router(elimination.router)
app.include_router(elo.router)
app.include_router(hardware.router)
app.include_router(control.router)
app.include_router(drivers.router)
app.include_router(payments.router)
app.include_router(maintenance.router)

from .routers import sessions
app.include_router(sessions.router)

from .routers import tables
app.include_router(tables.router)
# Lobby / Multiplayer
from .routers import lobby
app.include_router(lobby.router)

# Track Layout Parser
app.include_router(tracks.router)

# Leaderboard & CSV Export
from .routers import leaderboard
app.include_router(leaderboard.router)

# Online Booking handled by bookings router (/bookings)

# Pilot Portal (Public Driver Stats)
from .routers import portal
app.include_router(portal.router)

# Scenarios
from .routers import scenarios
app.include_router(scenarios.router)

# TV Spectator Mode (OBS Control)
from .routers import spectator
app.include_router(spectator.router)

# Mod Sync Across Stations
app.include_router(deploy_sync.router)

from .routers import wallpapers
app.include_router(wallpapers.router)


# @app.get("/")
# async def root():
#     # Keep minimal payload to match health checks and automated tests
#     return {"message": "Assetto Corsa Manager API"}

@app.get("/health")
def health_check():
    checks = _run_readiness_checks()
    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}


@app.get("/health/live")
def liveness_check():
    return {"status": "ok"}


@app.get("/health/ready")
def readiness_check():
    checks = _run_readiness_checks()
    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}

# --- Serve Frontend (Production) ---
from fastapi.responses import FileResponse
from sqlalchemy import text


def _run_readiness_checks() -> dict[str, str]:
    checks: dict[str, str] = {}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    try:
        test_path = PUBLIC_STORAGE_DIR / ".healthcheck"
        with open(test_path, "w", encoding="utf-8") as f:
            f.write("ok")
        test_path.unlink(missing_ok=True)
        checks["storage"] = "ok"
    except Exception:
        checks["storage"] = "error"

    return checks

# Calculate path to frontend/dist relative to this file
# main.py is in backend/app/
# frontend is in ../../frontend from here
frontend_dist = REPO_ROOT / "frontend" / "dist"

if frontend_dist.exists():
    # Mount assets (JS, CSS, Images in /assets)
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Serve other static files (favicon, etc) if needed?
    # Usually Vite puts everything else in root. We can mount root 'dist' to some path or handle individually.
    # But mounting root to "/" conflicts with API.
    # So we use catch-all.

    # Catch-all for SPA (must be last) - GET only to avoid capturing API POST/PUT/DELETE
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # API routes should never reach here - they are handled by routers above
        # This catch-all is ONLY for SPA client-side routing (GET requests to non-API paths)
        
        # Check if file exists in dist (e.g. favicon.ico, manifest.json)
        file_path = (frontend_dist / full_path).resolve()
        try:
            if not file_path.is_relative_to(frontend_dist.resolve()):
                raise HTTPException(status_code=404, detail="Not found")
        except AttributeError:
            # Python < 3.9 fallback
            if str(file_path).startswith(str(frontend_dist.resolve())) is False:
                raise HTTPException(status_code=404, detail="Not found")

        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
            
        # Fallback to index.html for SPA routing
        return FileResponse(frontend_dist / "index.html")
else:
    logger.warning(f"Frontend build not found at {frontend_dist}. Running in API-only mode.")
