from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import stations, mods, telemetry, websockets, settings, profiles, events, config_manager, championships, integrations, tournament, logs
from .routers.logs import MemoryLogHandler

# Create Tables
Base.metadata.create_all(bind=engine)

from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title="AC Manager Central Server",
    description="API for managing Assetto Corsa mods and simulators",
    version="0.1.0"
)

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
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error. The system recovered automatically.", "detail": str(exc)},
    )

# Ensure storage directory exists
os.makedirs("backend/storage", exist_ok=True)
app.mount("/static", StaticFiles(directory="backend/storage"), name="static")

# CORS Configuration
origins = [
    "http://localhost:3000",  # React Frontend default port
    "http://localhost:5173",  # Vite default port
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/")
async def root():
    return {"message": "AC Manager Central Server Running", "status": "online"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}

# --- Serve Frontend (Production) ---
from fastapi.responses import FileResponse

# Calculate path to frontend/dist relative to this file
# main.py is in backend/app/
# frontend is in ../../frontend from here
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")

if os.path.exists(frontend_dist):
    # Mount assets (JS, CSS, Images in /assets)
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Serve other static files (favicon, etc) if needed?
    # Usually Vite puts everything else in root. We can mount root 'dist' to some path or handle individually.
    # But mounting root to "/" conflicts with API.
    # So we use catch-all.

    # Catch-all for SPA (must be last)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow API calls to pass through (should be handled by routers above, but just in case)
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
             return JSONResponse({"detail": "Not Found"}, status_code=404)
        
        # Check if file exists in dist (e.g. favicon.ico, manifest.json)
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to index.html
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:
    logger.warning(f"Frontend build not found at {frontend_dist}. Running in API-only mode.")

