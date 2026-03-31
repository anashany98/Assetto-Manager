"""
Spectator Mode Router - Controls OBS streaming on simulator stations.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
import os

from .. import database, models
from .auth import require_admin_or_public_token, require_admin_or_public_token_scoped
from .websockets import manager
from ..security.license import require_license_module

router = APIRouter(
    prefix="/spectator",
    tags=["Spectator"],
    dependencies=[Depends(require_license_module("tv_spectator"))],
)

require_spectator_control = require_admin_or_public_token_scoped("tv:control")


class OBSCommandRequest(BaseModel):
    command: str  # connect, start_stream, stop_stream, status, set_scene, get_scenes
    scene: Optional[str] = None
    password: Optional[str] = None


class SpectatorStation(BaseModel):
    id: int
    name: str
    ip_address: str
    is_streaming: bool = False
    stream_url: Optional[str] = None


def _default_stream_url(station: models.Station) -> Optional[str]:
    """Build a sensible low-latency fallback URL when station.stream_url is unset."""
    mode = (os.getenv("STREAM_FALLBACK_MODE", "webrtc") or "webrtc").strip().lower()
    station_suffix = f"station{station.id}"
    base_url = (os.getenv("STREAM_BASE_URL") or "").strip().rstrip("/")

    if base_url:
        if mode == "flv":
            return f"{base_url}/{station_suffix}.flv"
        if mode == "hls":
            return f"{base_url}/{station_suffix}.m3u8"
        # Default: WebRTC/WHEP base endpoint consumed by StreamPlayer
        return f"{base_url}/{station_suffix}"

    host = (station.ip_address or "").strip()
    if not host:
        return None

    if mode == "flv":
        return f"http://{host}:8888/live/{station_suffix}.flv"
    if mode == "hls":
        return f"http://{host}:8888/live/{station_suffix}.m3u8"
    return f"http://{host}:8889/live/{station_suffix}"


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
            stream_url=s.stream_url or _default_stream_url(s)
        )
        for s in stations
    ]


@router.post("/{station_id}/obs")
async def control_obs(
    station_id: int,
    request: OBSCommandRequest,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_spectator_control)
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
    user_or_client: models.User | str = Depends(require_spectator_control)
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
    user_or_client: models.User | str = Depends(require_spectator_control)
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
    user_or_client: models.User | str = Depends(require_spectator_control)
):
    """Get streaming status from a specific station."""
    return await control_obs(
        station_id,
        OBSCommandRequest(command="status"),
        db,
        user_or_client
    )


@router.get("/{station_id}/scenes")
async def get_obs_scenes(
    station_id: int,
    db: Session = Depends(database.get_db),
    user_or_client: models.User | str = Depends(require_spectator_control)
):
    """Get the list of available OBS scenes from a specific station."""
    return await control_obs(
        station_id,
        OBSCommandRequest(command="get_scenes"),
        db,
        user_or_client
    )
