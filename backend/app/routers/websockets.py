from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List, Dict, Any
import json
import logging
from sqlalchemy.orm import Session
from ..database import SessionLocal
from .. import models
from datetime import datetime


router = APIRouter()
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Active connections: list of WebSockets
        self.active_clients: List[WebSocket] = []
        # Map Station ID -> WebSocket
        self.active_agents: Dict[int, WebSocket] = {}
        # Reverse map WS -> Station ID for cleanup
        self.ws_to_station: Dict[WebSocket, int] = {}
        # Last known state per agent (keyed by car/station ID usually, but here we might just store by agent WS)
        self.agent_states: Dict[WebSocket, Any] = {}

    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.active_clients.append(websocket)
        logger.info(f"Client connected. Total clients: {len(self.active_clients)}")

    async def register_agent(self, websocket: WebSocket, station_id: int):
        # Register authenticated/identified agent
        self.active_agents[station_id] = websocket
        self.ws_to_station[websocket] = station_id
        logger.info(f"Agent Registered: Station {station_id}. Total registered agents: {len(self.active_agents)}")

    def disconnect_client(self, websocket: WebSocket):
        if websocket in self.active_clients:
            self.active_clients.remove(websocket)
            logger.info(f"Client disconnected. Total clients: {len(self.active_clients)}")

    def disconnect_agent(self, websocket: WebSocket):
        if websocket in self.ws_to_station:
            station_id = self.ws_to_station[websocket]
            if station_id in self.active_agents:
                del self.active_agents[station_id]
            del self.ws_to_station[websocket]
            if websocket in self.agent_states:
                del self.agent_states[websocket]
            logger.info(f"Agent Disconnected: Station {station_id}")

    async def broadcast(self, message: str):
        # Broadcast message from Agent to all Clients
        # Use a copy of the list to avoid modification issues during iteration if Disconnect happens
        for connection in list(self.active_clients):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect_client(connection)



manager = ConnectionManager()

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
    await websocket.accept()
    # Note: We don't register immediately. We wait for 'identify' message.
    
    try:
        while True:
            # Agents stream JSON data
            raw_data = await websocket.receive_text()
            
            # 1. Parse JSON
            try:
                data = json.loads(raw_data)
                
                # Handle Identification
                if data.get("type") == "identify":
                    station_id = data.get("station_id")
                    if station_id:
                        await manager.register_agent(websocket, station_id)
                    continue

                # 1. Broadcast immediately to all clients (Live visual updates)
                await manager.broadcast(raw_data)
                
                # 2. Process for Auto-Lap (Backend Logic)
                # Check if this message indicates a LAP COMPLETION
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
                                date=datetime.now(datetime.timezone.utc),
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
