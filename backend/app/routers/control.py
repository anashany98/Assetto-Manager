from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from .websockets import manager
import logging
import json

router = APIRouter(
    prefix="/control",
    tags=["Control"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

class WeatherCommand(BaseModel):
    weather_type: str # solar, windy, rainy, storm, fog, clear

@router.post("/global/weather")
async def set_global_weather(cmd: WeatherCommand):
    """
    Broadcast weather command to all Agents
    """
    logger.info(f"Setting global weather to: {cmd.weather_type}")
    
    # Generic "set_weather" command for the Agent
    payload = {
        "command": "set_weather",
        "value": cmd.weather_type
    }
    
    await manager.broadcast_to_agents(payload)
    
    return {"status": "command_sent", "weather": cmd.weather_type}

class RestartCommand(BaseModel):
    target: str = "all" # all or station_id

@router.post("/global/panic")
async def global_panic():
    """
    Emergency Stop for all Simulators
    """
    logger.warning("GLOBAL PANIC TRIGGERED")
    await manager.broadcast_to_agents({"command": "panic"})
    return {"status": "panic_signal_sent"}
