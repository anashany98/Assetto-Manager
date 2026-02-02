"""
Spectator Mode Router - Controls OBS streaming on simulator stations.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

from .. import database, models
from .auth import get_current_active_user, require_admin_or_public_token
from .websockets import manager

router = APIRouter(prefix="/spectator", tags=["Spectator"])


class OBSCommandRequest(BaseModel):
    command: str  # connect, start_stream, stop_stream, status, set_scene
    scene: Optional[str] = None
    password: Optional[str] = None


class SpectatorStation(BaseModel):
    id: int
    name: str
    ip_address: str
    is_streaming: bool = False
    stream_url: Optional[str] = None


@router.get("/stations", response_model=List[SpectatorStation])
def get_spectator_stations(
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token)
):
    """Get all online stations available for spectating."""
    stations = db.query(models.Station).filter(
        models.Station.is_online == True,
        models.Station.archived_at.is_(None)
    ).all()
    
    return [
        SpectatorStation(
            id=s.id,
            name=s.name,
            ip_address=s.ip_address or "",
            is_streaming=s.is_streaming,
            stream_url=s.stream_url or (f"http://{s.ip_address}:8080/stream" if s.ip_address else None)
        )
        for s in stations
    ]


@router.post("/{station_id}/obs")
async def control_obs(
    station_id: int,
    request: OBSCommandRequest,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token)
):
    """
    Send OBS control command to a specific station.
    
    Commands:
    - connect: Connect to OBS WebSocket
    - start_stream: Start streaming
    - stop_stream: Stop streaming
    - status: Get streaming status
    - set_scene: Switch scene (requires scene parameter)
    """
    station = db.query(models.Station).filter(models.Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    if not station.is_online:
        raise HTTPException(status_code=400, detail="Station is offline")
    
    # Build command payload for agent
    payload = {
        "type": "obs_control",
        "command": request.command,
        "params": {}
    }
    
    if request.scene:
        payload["params"]["scene"] = request.scene
    if request.password:
        payload["params"]["password"] = request.password
    
    # Send to agent via WebSocket
    success = await manager.send_command(station_id, payload)
    
    if not success:
        # If we can't send, we assume agent is not connected/responding
        # But for 'status' checking we might want a different response?
        # For now, 503 is appropriate.
        raise HTTPException(status_code=503, detail="Agent not responding or not connected")
    
    return {"status": "command_sent"}


@router.post("/{station_id}/start")
async def start_spectating(
    station_id: int,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token)
):
    """Start streaming from a specific station (convenience endpoint)."""
    return await control_obs(
        station_id,
        OBSCommandRequest(command="start_stream"),
        db,
        user_or_client
    )


@router.post("/{station_id}/stop")
async def stop_spectating(
    station_id: int,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token)
):
    """Stop streaming from a specific station (convenience endpoint)."""
    return await control_obs(
        station_id,
        OBSCommandRequest(command="stop_stream"),
        db,
        user_or_client
    )


@router.get("/{station_id}/status")
async def get_stream_status(
    station_id: int,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_admin_or_public_token)
):
    """Get streaming status from a specific station."""
    return await control_obs(
        station_id,
        OBSCommandRequest(command="status"),
        db,
        user_or_client
    )
