"""
Hardware Monitor API Router

Endpoints for monitoring station health (CPU, RAM, GPU, temperature, peripherals).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from ..database import get_db
from ..models import Station

router = APIRouter(
    prefix="/hardware",
    tags=["hardware"]
)


class StationHealthReport(BaseModel):
    """Health report sent by agent on each station."""
    station_id: int
    cpu_percent: float
    ram_percent: float
    gpu_percent: Optional[float] = None
    gpu_temp: Optional[float] = None
    disk_percent: float
    wheel_connected: bool = False
    pedals_connected: bool = False
    shifter_connected: bool = False
    ac_running: bool = False
    current_driver: Optional[str] = None
    current_track: Optional[str] = None
    current_car: Optional[str] = None


class StationHealthStatus(BaseModel):
    """Stored health status for a station."""
    station_id: int
    station_name: str
    is_online: bool
    last_seen: Optional[datetime] = None
    cpu_percent: float = 0
    ram_percent: float = 0
    gpu_percent: float = 0
    gpu_temp: float = 0
    disk_percent: float = 0
    wheel_connected: bool = False
    pedals_connected: bool = False
    shifter_connected: bool = False
    ac_running: bool = False
    current_driver: Optional[str] = None
    current_track: Optional[str] = None
    current_car: Optional[str] = None
    alerts: List[str] = []
    is_locked: bool = False


# In-memory storage for health reports (in production, use Redis or DB)
_health_cache: dict[int, dict] = {}


@router.post("/report")
async def report_health(report: StationHealthReport, db: Session = Depends(get_db)):
    """
    Endpoint for agents to report station health.
    Called periodically by the agent running on each simulator PC.
    """
    # Update station last seen
    station = db.query(Station).filter(Station.id == report.station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    station.is_online = True
    station.status = "online"
    db.commit()
    
    # Store in cache
    _health_cache[report.station_id] = {
        **report.dict(),
        "last_seen": datetime.now(timezone.utc),
        "station_name": station.name,
    }
    
    return {"status": "ok"}


@router.get("/status", response_model=List[StationHealthStatus])
async def get_all_health(db: Session = Depends(get_db)):
    """Get health status of all stations."""
    stations = db.query(Station).order_by(Station.id).all()
    
    result = []
    now = datetime.now(timezone.utc)
    
    for station in stations:
        cached = _health_cache.get(station.id, {})
        last_seen = cached.get("last_seen")
        
        # Check if station is stale (no report in 60 seconds)
        is_online = False
        if last_seen:
            if isinstance(last_seen, datetime):
                is_online = (now - last_seen).total_seconds() < 60
        
        # Generate alerts
        alerts = []
        cpu = cached.get("cpu_percent") or 0
        ram = cached.get("ram_percent") or 0
        gpu_temp = cached.get("gpu_temp") or 0
        disk = cached.get("disk_percent") or 0
        
        if cpu > 90:
            alerts.append("CPU crítico (>90%)")
        elif cpu > 75:
            alerts.append("CPU alto (>75%)")
            
        if ram > 90:
            alerts.append("RAM crítica (>90%)")
        elif ram > 80:
            alerts.append("RAM alta (>80%)")
            
        if gpu_temp > 85:
            alerts.append(f"GPU caliente ({gpu_temp}°C)")
        elif gpu_temp > 75:
            alerts.append(f"GPU templada ({gpu_temp}°C)")
            
        if disk > 90:
            alerts.append("Disco lleno (>90%)")
            
        if not cached.get("wheel_connected", False) and is_online:
            alerts.append("Volante desconectado")
        if not cached.get("pedals_connected", False) and is_online:
            alerts.append("Pedales desconectados")
        
        if not is_online and station.is_online:
            alerts.append("Sin respuesta")
        
        result.append(StationHealthStatus(
            station_id=station.id,
            station_name=station.name,
            is_online=is_online,
            last_seen=last_seen,
            cpu_percent=cpu,
            ram_percent=ram,
            gpu_percent=cached.get("gpu_percent") or 0,
            gpu_temp=gpu_temp,
            disk_percent=disk,
            wheel_connected=cached.get("wheel_connected", False),
            pedals_connected=cached.get("pedals_connected", False),
            shifter_connected=cached.get("shifter_connected", False),
            ac_running=cached.get("ac_running", False),
            current_driver=cached.get("current_driver"),
            current_track=cached.get("current_track"),
            current_car=cached.get("current_car"),
            alerts=alerts,
        ))
    
    return result


@router.get("/status/{station_id}", response_model=StationHealthStatus)
async def get_station_health(station_id: int, db: Session = Depends(get_db)):
    """Get health status of a specific station."""
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    cached = _health_cache.get(station_id, {})
    now = datetime.now(timezone.utc)
    last_seen = cached.get("last_seen")
    
    is_online = False
    if last_seen and isinstance(last_seen, datetime):
        is_online = (now - last_seen).total_seconds() < 60
    
    return StationHealthStatus(
        station_id=station.id,
        station_name=station.name,
        is_online=is_online,
        last_seen=last_seen,
        cpu_percent=cached.get("cpu_percent") or 0,
        ram_percent=cached.get("ram_percent") or 0,
        gpu_percent=cached.get("gpu_percent") or 0,
        gpu_temp=cached.get("gpu_temp") or 0,
        disk_percent=cached.get("disk_percent") or 0,
        wheel_connected=cached.get("wheel_connected", False),
        pedals_connected=cached.get("pedals_connected", False),
        shifter_connected=cached.get("shifter_connected", False),
        ac_running=cached.get("ac_running", False),
        current_driver=cached.get("current_driver"),
        current_track=cached.get("current_track"),
        current_car=cached.get("current_car"),
        alerts=[],
        is_locked=station.is_locked
    )


@router.get("/summary")
async def get_health_summary(db: Session = Depends(get_db)):
    """Get summary of all stations health."""
    stations = db.query(Station).all()
    
    total = len(stations)
    online = 0
    with_alerts = 0
    running_ac = 0
    
    now = datetime.now(timezone.utc)
    
    for station in stations:
        cached = _health_cache.get(station.id, {})
        last_seen = cached.get("last_seen")
        
        if last_seen and isinstance(last_seen, datetime):
            if (now - last_seen).total_seconds() < 60:
                online += 1
                
                # Check for alerts
                if (cached.get("cpu_percent", 0) > 75 or 
                    cached.get("ram_percent", 0) > 80 or
                    cached.get("gpu_temp", 0) > 75 or
                    not cached.get("wheel_connected", False)):
                    with_alerts += 1
                
                if cached.get("ac_running", False):
                    running_ac += 1
    
    return {
        "total_stations": total,
        "online": online,
        "offline": total - online,
        "with_alerts": with_alerts,
        "running_ac": running_ac,
    }
