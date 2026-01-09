from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import stations, mods, telemetry, websockets, settings, profiles

# Create Tables
Base.metadata.create_all(bind=engine)

from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title="AC Manager Central Server",
    description="API for managing Assetto Corsa mods and simulators",
    version="0.1.0"
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stations.router)
app.include_router(mods.router)
app.include_router(profiles.router)
app.include_router(websockets.router, tags=["websockets"])
app.include_router(telemetry.router)
app.include_router(settings.router)

@app.get("/")
async def root():
    return {"message": "AC Manager Central Server Running", "status": "online"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
