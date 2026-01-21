from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import engine, Base, ensure_station_schema
from .routers import stations, mods, telemetry, websockets, settings, profiles, events, config_manager, championships, integrations, tournament, logs, ads, auth, backup, exports, loyalty, bookings, analytics, push, elimination, elo, hardware, control, drivers, payments

# ...


from .routers.logs import MemoryLogHandler
from .services.scheduler import start_scheduler, stop_scheduler

# Create Tables
Base.metadata.create_all(bind=engine)
ensure_station_schema(engine)

from fastapi.staticfiles import StaticFiles
import os
from .paths import STORAGE_DIR, REPO_ROOT

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

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

# Lifecycle events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    _validate_runtime_config()
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
        # Permissive CSP for SPA - explicit script and worker sources
        csp_policy = (
            "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; "
            "script-src * data: blob: 'unsafe-inline' 'unsafe-eval'; "
            "worker-src * data: blob: 'unsafe-inline' 'unsafe-eval'; "
            "style-src * data: blob: 'unsafe-inline'; "
            "img-src * data: blob:; "
            "font-src * data:; "
            "connect-src * data: blob: wss: ws:;"
        )
        response.headers["Content-Security-Policy"] = csp_policy
        return response

app.add_middleware(CSPMiddleware)

# Global Exception Handler
from fastapi.responses import JSONResponse
from fastapi import Request
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5959,http://localhost:5174,http://localhost:5175").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Agent-Token", "X-Setup-Token", "X-Client-Token"],
)

# Rate Limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(profiles.router)
app.include_router(mods.router)
app.include_router(settings.router)
app.include_router(stations.router)
app.include_router(telemetry.router)
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

# Lobby / Multiplayer
from .routers import lobby
app.include_router(lobby.router)

# Scenarios
# Scenarios
from .routers import scenarios
app.include_router(scenarios.router)

# Leaderboard
from .routers import leaderboard
app.include_router(leaderboard.router)


# @app.get("/")
# async def root():
#     # Keep minimal payload to match health checks and automated tests
#     return {"message": "Assetto Corsa Manager API"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# --- Serve Frontend (Production) ---
from fastapi.responses import FileResponse

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
