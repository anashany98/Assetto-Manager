"""
Elimination Race Mode Router

Carrera por eliminación donde el último de cada vuelta es eliminado.
- Vuelta 1 (warmup_laps): Calentamiento, sin eliminaciones
- Vuelta 2+: El más lento es eliminado
"""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging
import json

from .. import database, models

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/elimination",
    tags=["elimination-race"]
)

# --- Pydantic Schemas ---

class RaceCreate(BaseModel):
    name: str
    track_name: Optional[str] = None
    warmup_laps: int = 1  # Default: 1 lap warmup

class ParticipantRegister(BaseModel):
    driver_name: str
    station_id: Optional[int] = None

class LapComplete(BaseModel):
    driver_name: str
    lap_time: int  # in milliseconds

class ParticipantStatus(BaseModel):
    driver_name: str
    is_eliminated: bool
    eliminated_at_lap: Optional[int]
    laps_completed: int
    current_lap_time: Optional[int]
    best_lap_time: Optional[int]
    final_position: Optional[int]

class RaceStatus(BaseModel):
    id: int
    name: str
    status: str
    current_lap: int
    warmup_laps: int
    track_name: Optional[str]
    active_count: int
    eliminated_count: int
    participants: List[ParticipantStatus]
    last_eliminated: Optional[str] = None

# --- WebSocket connections for real-time updates ---
active_connections: dict[int, list[WebSocket]] = {}

async def broadcast_race_update(race_id: int, data: dict):
    """Send update to all connected clients for this race"""
    if race_id in active_connections:
        for connection in active_connections[race_id]:
            try:
                await connection.send_json(data)
            except:
                pass

# --- Endpoints ---

@router.post("/create", response_model=dict)
def create_race(race_data: RaceCreate, db: Session = Depends(database.get_db)):
    """Create a new elimination race"""
    race = models.EliminationRace(
        name=race_data.name,
        track_name=race_data.track_name,
        warmup_laps=race_data.warmup_laps,
        status="waiting"
    )
    db.add(race)
    db.commit()
    db.refresh(race)
    
    logger.info(f"Created elimination race: {race.id} - {race.name}")
    return {"id": race.id, "name": race.name, "status": race.status}

@router.get("/list")
def list_races(db: Session = Depends(database.get_db)):
    """List all elimination races"""
    races = db.query(models.EliminationRace).order_by(desc(models.EliminationRace.created_at)).limit(20).all()
    return [{"id": r.id, "name": r.name, "status": r.status, "current_lap": r.current_lap} for r in races]

@router.post("/{race_id}/register")
def register_participant(race_id: int, participant: ParticipantRegister, db: Session = Depends(database.get_db)):
    """Register a driver for the race"""
    race = db.query(models.EliminationRace).filter(models.EliminationRace.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    if race.status != "waiting":
        raise HTTPException(status_code=400, detail="Race already started")
    
    # Check if already registered
    existing = db.query(models.EliminationParticipant).filter(
        models.EliminationParticipant.race_id == race_id,
        models.EliminationParticipant.driver_name == participant.driver_name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Driver already registered")
    
    new_participant = models.EliminationParticipant(
        race_id=race_id,
        driver_name=participant.driver_name,
        station_id=participant.station_id
    )
    db.add(new_participant)
    db.commit()
    
    return {"message": f"{participant.driver_name} registered"}

@router.post("/{race_id}/start")
def start_race(race_id: int, db: Session = Depends(database.get_db)):
    """Start the elimination race"""
    race = db.query(models.EliminationRace).filter(models.EliminationRace.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    participants = db.query(models.EliminationParticipant).filter(
        models.EliminationParticipant.race_id == race_id
    ).count()
    
    if participants < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 participants")
    
    race.status = "racing"
    race.current_lap = 1
    db.commit()
    
    logger.info(f"Race {race_id} started with {participants} participants")
    return {"message": "Race started", "current_lap": 1}

@router.post("/{race_id}/lap")
async def report_lap(race_id: int, lap_data: LapComplete, db: Session = Depends(database.get_db)):
    """Report a completed lap for a driver"""
    race = db.query(models.EliminationRace).filter(models.EliminationRace.id == race_id).first()
    if not race or race.status != "racing":
        raise HTTPException(status_code=400, detail="Race not active")
    
    participant = db.query(models.EliminationParticipant).filter(
        models.EliminationParticipant.race_id == race_id,
        models.EliminationParticipant.driver_name == lap_data.driver_name,
        models.EliminationParticipant.is_eliminated == False
    ).first()
    
    if not participant:
        raise HTTPException(status_code=404, detail="Active participant not found")
    
    # Update lap data
    participant.laps_completed += 1
    participant.current_lap_time = lap_data.lap_time
    if participant.best_lap_time is None or lap_data.lap_time < participant.best_lap_time:
        participant.best_lap_time = lap_data.lap_time
    
    db.commit()
    
    # Check if all active participants completed this lap
    active_participants = db.query(models.EliminationParticipant).filter(
        models.EliminationParticipant.race_id == race_id,
        models.EliminationParticipant.is_eliminated == False
    ).all()
    
    all_completed = all(p.laps_completed >= race.current_lap for p in active_participants)
    
    result = {"lap_recorded": True, "driver": lap_data.driver_name, "time": lap_data.lap_time}
    
    if all_completed:
        # Everyone finished this lap - process elimination
        if race.current_lap > race.warmup_laps:
            # ELIMINATION TIME! Find the slowest
            slowest = max(active_participants, key=lambda p: p.current_lap_time or 999999999)
            slowest.is_eliminated = True
            slowest.eliminated_at_lap = race.current_lap
            slowest.final_position = len(active_participants)
            
            logger.info(f"ELIMINATED: {slowest.driver_name} at lap {race.current_lap}")
            result["eliminated"] = slowest.driver_name
            result["eliminated_position"] = slowest.final_position
            
            # Check if race is over (only 1 left)
            remaining = len([p for p in active_participants if not p.is_eliminated and p.id != slowest.id])
            if remaining == 1:
                winner = next(p for p in active_participants if not p.is_eliminated and p.id != slowest.id)
                winner.final_position = 1
                race.status = "finished"
                result["winner"] = winner.driver_name
                logger.info(f"WINNER: {winner.driver_name}")
        else:
            result["warmup_lap"] = True
            result["message"] = f"Warmup lap {race.current_lap} of {race.warmup_laps}"
        
        # Advance to next lap
        if race.status == "racing":
            race.current_lap += 1
            # Reset current lap times for next lap
            for p in active_participants:
                if not p.is_eliminated:
                    p.current_lap_time = None
        
        result["next_lap"] = race.current_lap
        db.commit()
        
        # Broadcast update via WebSocket
        await broadcast_race_update(race_id, result)
    
    return result

@router.get("/{race_id}/status", response_model=RaceStatus)
def get_race_status(race_id: int, db: Session = Depends(database.get_db)):
    """Get current race status for TV display"""
    race = db.query(models.EliminationRace).filter(models.EliminationRace.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    participants = db.query(models.EliminationParticipant).filter(
        models.EliminationParticipant.race_id == race_id
    ).all()
    
    # Sort: active first (by current lap time), then eliminated (by elimination lap desc)
    active = sorted([p for p in participants if not p.is_eliminated], 
                   key=lambda x: x.current_lap_time or 999999999)
    eliminated = sorted([p for p in participants if p.is_eliminated],
                       key=lambda x: x.eliminated_at_lap or 0, reverse=True)
    
    last_eliminated = eliminated[0].driver_name if eliminated else None
    
    return RaceStatus(
        id=race.id,
        name=race.name,
        status=race.status,
        current_lap=race.current_lap,
        warmup_laps=race.warmup_laps,
        track_name=race.track_name,
        active_count=len(active),
        eliminated_count=len(eliminated),
        last_eliminated=last_eliminated,
        participants=[
            ParticipantStatus(
                driver_name=p.driver_name,
                is_eliminated=p.is_eliminated,
                eliminated_at_lap=p.eliminated_at_lap,
                laps_completed=p.laps_completed,
                current_lap_time=p.current_lap_time,
                best_lap_time=p.best_lap_time,
                final_position=p.final_position
            ) for p in (active + eliminated)
        ]
    )

@router.delete("/{race_id}")
def delete_race(race_id: int, db: Session = Depends(database.get_db)):
    """Delete a race"""
    race = db.query(models.EliminationRace).filter(models.EliminationRace.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    db.delete(race)
    db.commit()
    return {"message": "Race deleted"}

@router.websocket("/{race_id}/ws")
async def websocket_endpoint(websocket: WebSocket, race_id: int):
    """WebSocket for real-time race updates"""
    await websocket.accept()
    
    if race_id not in active_connections:
        active_connections[race_id] = []
    active_connections[race_id].append(websocket)
    
    try:
        while True:
            # Keep connection alive, wait for messages
            data = await websocket.receive_text()
            # Could handle ping/pong here
    except WebSocketDisconnect:
        active_connections[race_id].remove(websocket)
