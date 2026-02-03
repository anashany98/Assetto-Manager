from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import engine, Base, ensure_station_schema, ensure_table_schema, ensure_user_schema
from .routers import stations, mods, websockets, settings, profiles, events, config_manager, championships, integrations, tournament, logs, ads, auth, backup, exports, loyalty, bookings, analytics, push, elimination, elo, hardware, control, drivers, payments, tables, tracks, deploy_sync
from .routers.telemetry import router as telemetry_router  # Modular telemetry package
import logging

# ...


from .routers.logs import MemoryLogHandler
from .services.scheduler import start_scheduler, stop_scheduler

from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path
from .paths import STORAGE_DIR, REPO_ROOT

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
AUTO_SCHEMA = os.getenv("AUTO_SCHEMA", "true" if ENVIRONMENT != "production" else "false").lower() in {"1", "true", "yes"}
logger = logging.getLogger(__name__)

def _validate_runtime_config():
    if ENVIRONMENT != "production":
        return
    missing = []
    if not os.getenv("DATABASE_URL"):
        missing.append("DATABASE_URL")
    if not os.getenv("SECRET_KEY"):
        missing.append("SECRET_KEY")
    if not os.getenv("ALLOWED_ORIGINS"):
        missing.append("ALLOWED_ORIGINS")
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    allowed_raw = os.getenv("ALLOWED_ORIGINS", "")
    allowed = [o.strip() for o in allowed_raw.split(",") if o.strip()]
    if "*" in allowed:
        raise RuntimeError("ALLOWED_ORIGINS cannot include '*' in production")

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
    scheduler_enabled = os.getenv("ENABLE_SCHEDULER", "true").lower() in {"1", "true", "yes"}
    if scheduler_enabled:
        start_scheduler()
    else:
        logger.info("Scheduler disabled by ENABLE_SCHEDULER")
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="AC Manager Central Server",
    description="API for managing Assetto Corsa mods and simulators",
    version="0.1.0",
    lifespan=lifespan
)

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

# Ensure storage directory exists
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STORAGE_DIR)), name="static")

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

# Reservations (Online Booking)
from .routers import reservations
app.include_router(reservations.router)

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
    status = "ok"
    checks = {}

    # DB check
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"
        status = "degraded"

    # Storage check
    try:
        test_path = STORAGE_DIR / ".healthcheck"
        with open(test_path, "w", encoding="utf-8") as f:
            f.write("ok")
        test_path.unlink(missing_ok=True)
        checks["storage"] = "ok"
    except Exception:
        checks["storage"] = "error"
        status = "degraded"

    return {"status": status, "checks": checks}

# --- Serve Frontend (Production) ---
from fastapi.responses import FileResponse
from sqlalchemy import text

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
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
            
        # Fallback to index.html for SPA routing
        return FileResponse(frontend_dist / "index.html")
else:
    logger.warning(f"Frontend build not found at {frontend_dist}. Running in API-only mode.")
