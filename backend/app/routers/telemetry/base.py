# Telemetry Base Module
# Shared utilities, constants, and helper functions for all telemetry routers

from fastapi import Depends
from sqlalchemy.orm import Session
from typing import List, Optional, Union
import json
import math
import logging

# Constants
DEFAULT_LAP_LENGTH_KM = 4.8
CONSISTENCY_STD_DEV_DIVISOR = 50
TELEMETRY_POINTS_PER_LAP = 200
MIN_CONSISTENCY_SCORE = 0
MAX_CONSISTENCY_SCORE = 100

logger = logging.getLogger(__name__)


def _coerce_json_value(value: Optional[Union[dict, list, str]]) -> Optional[Union[dict, list]]:
    """Convert string JSON to dict/list, or return None if invalid."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return None
    return None


def _coerce_splits(value) -> list:
    """Safely parse splits data to a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def calculate_consistency_score(times: List[int]) -> float:
    """
    Calculates a consistency score (0-100) based on lap time standard deviation.
    Higher is better (more consistent).
    """
    if len(times) < 2:
        return 100.0
        
    avg_lap = sum(times) / len(times)
    variance = sum((t - avg_lap) ** 2 for t in times) / len(times)
    std_dev = math.sqrt(variance)
    
    score = max(
        MIN_CONSISTENCY_SCORE, 
        min(MAX_CONSISTENCY_SCORE, MAX_CONSISTENCY_SCORE - (std_dev / CONSISTENCY_STD_DEV_DIVISOR))
    )
    return float(score)


def format_ms(ms: int) -> str:
    """Format milliseconds to MM:SS.mmm string."""
    if not ms: 
        return "--:--.---"
    mins = ms // 60000
    secs = (ms % 60000) / 1000
    return f"{mins:02d}:{secs:06.3f}"


def _classify_car_category(car_model: str) -> str:
    """
    Heuristics to group cars into categories for TV Display.
    """
    model = car_model.lower()
    
    if "f1" in model or "formula" in model or "tatuus" in model or "rss" in model: 
        return "Formula"
    if "gt3" in model: 
        return "GT3"
    if "gt4" in model: 
        return "GT4"
    if "lmp" in model or "prototype" in model or "hypercar" in model: 
        return "Prototype"
    if "drift" in model or "e30" in model: 
        return "Drift"
    if "rally" in model or "wrc" in model: 
        return "Rally"
    if "cup" in model or "mx5" in model or "clio" in model: 
        return "Cup"
    if "kart" in model: 
        return "Karting"
    if "jdm" in model or "nissan" in model or "toyota" in model or "honda" in model:
        return "JDM / Tuner"
        
    return "Road Cars"
