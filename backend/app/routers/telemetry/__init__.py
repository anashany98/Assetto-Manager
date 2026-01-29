# Telemetry Package
# This package contains modular telemetry-related routers

from fastapi import APIRouter

# Create main router that will include all sub-routers
router = APIRouter(
    prefix="/telemetry",
    tags=["telemetry"]
)

# Import and include sub-routers
from .live import router as live_router
from .history import router as history_router
from .comparison import router as comparison_router
from .exports import router as exports_router
from .hall_of_fame import router as hall_of_fame_router

# Include all sub-routers (they have no prefix since main router has /telemetry)
router.include_router(live_router)
router.include_router(history_router)
router.include_router(comparison_router)
router.include_router(exports_router)
router.include_router(hall_of_fame_router)
