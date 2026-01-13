from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List, Dict, Any
import json
import logging
from sqlalchemy.orm import Session
from ..database import SessionLocal
from .. import schemas, models
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Active connections: list of WebSockets
        self.active_clients: List[WebSocket] = []
        self.active_agents: List[WebSocket] = []
        # Last known state per agent (keyed by car/station ID usually, but here we might just store by agent WS)
        self.agent_states: Dict[WebSocket, Any] = {}

    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.active_clients.append(websocket)
        logger.info(f"Client connected. Total clients: {len(self.active_clients)}")

    async def connect_agent(self, websocket: WebSocket):
        await websocket.accept()
        self.active_agents.append(websocket)
        logger.info(f"Agent connected. Total agents: {len(self.active_agents)}")

    def disconnect_client(self, websocket: WebSocket):
        if websocket in self.active_clients:
            self.active_clients.remove(websocket)
            logger.info(f"Client disconnected. Total clients: {len(self.active_clients)}")

    def disconnect_agent(self, websocket: WebSocket):
        if websocket in self.active_agents:
            self.active_agents.remove(websocket)
            if websocket in self.agent_states:
                del self.agent_states[websocket]
            logger.info(f"Agent disconnected. Total agents: {len(self.active_agents)}")

    async def broadcast(self, message: str):
        # Broadcast message from Agent to all Clients
        # Use a copy of the list to avoid modification issues during iteration if Disconnect happens
        for connection in list(self.active_clients):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect_client(connection)

manager = ConnectionManager()

# Dependency to get DB session (created manually within async context if needed, but here we use a fresh session for each operation)
def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.websocket("/ws/telemetry/client")
async def websocket_client_endpoint(websocket: WebSocket):
    logger.info("Attempting to connect a new client...")
    await manager.connect_client(websocket)
    try:
        while True:
            # Wait for any message from the client (e.g. keepalives or commands)
            data = await websocket.receive_text()
            # logger.info(f"Received from client: {data}")
    except WebSocketDisconnect:
        logger.info("Client disconnected gracefully.")
        manager.disconnect_client(websocket)
    except Exception as e:
        logger.error(f"Client WS Error (Critical): {e}")
        manager.disconnect_client(websocket)

@router.websocket("/ws/telemetry/agent")
async def websocket_agent_endpoint(websocket: WebSocket):
    await manager.connect_agent(websocket)
    try:
        while True:
            # Agents stream JSON data
            raw_data = await websocket.receive_text()
            
            # 1. Broadcast immediately to all clients (Live visual updates)
            await manager.broadcast(raw_data)
            
            # 2. Process for Auto-Lap (Backend Logic)
            try:
                data = json.loads(raw_data)
                
                # Check if this message indicates a LAP COMPLETION
                # The agent plugin should send a specific event type or we detect 'lap_completed': true
                # For now, let's assume the agent sends specific event metadata
                
                if data.get("event") == "LapCompleted":
                    # Extract necessary info
                    # Expected format: { "event": "LapCompleted", "driver_name": "...", "car_model": "...", "track_name": "...", "lap_time": 123456, "sectors": [1,2,3] }
                    
                    driver_name = data.get("driver_name", "Unknown Driver")
                    car_model = data.get("car_model", "unknown_car")
                    track_name = data.get("track_name", "unknown_track")
                    lap_time = data.get("lap_time", 0)
                    
                    if lap_time > 0:
                        # Save to DB
                        db = SessionLocal()
                        try:
                            # Create SessionResult object manually (replacing crud)
                            new_session = models.SessionResult(
                                driver_name=driver_name,
                                car_model=car_model,
                                track_name=track_name,
                                best_lap=lap_time,
                                date=datetime.utcnow(),
                                session_type="practice",
                                track_config=None
                            )
                            db.add(new_session)
                            db.commit()
                            db.refresh(new_session)
                            
                            logger.info(f"Auto-saved lap for {driver_name}: {lap_time}ms")
                        finally:
                            db.close()
                            
            except json.JSONDecodeError:
                pass # Ignore invalid JSON
            except Exception as e:
                logger.error(f"Error processing stats: {e}")
                
    except WebSocketDisconnect:
        manager.disconnect_agent(websocket)
    except Exception as e:
        logger.error(f"Agent WS Context Error: {e}", exc_info=True)
        manager.disconnect_agent(websocket)
