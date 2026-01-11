from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Dict, Any
import json
import logging

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
                # If sending fails, assume execution is dead and remove? 
                # Better to let the receive loop handle disconnects, but send failures usually mean dead socket.
                pass

manager = ConnectionManager()

@router.websocket("/ws/telemetry/client")
async def websocket_client_endpoint(websocket: WebSocket):
    await manager.connect_client(websocket)
    try:
        while True:
            # Clients (Frontend) usually just listen, but might send "subscribe" messages later
            # For now we just keep the connection open
            # data = await websocket.receive_text()  <-- This blocks and expects data. If client sends nothing, it might timeout or close?
            # Instead, just wait forever until disconnect
            # Instead, just wait forever until disconnect
            # await websocket.receive_text()
            
            # Simple keepalive loop with heartbeat
            import asyncio
            while True:
                await asyncio.sleep(5)
                # Send heartbeat to keep connection alive and avoid 1006
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect_client(websocket)
    except Exception as e:
        logger.error(f"Client WS error: {e}")
        manager.disconnect_client(websocket)

@router.websocket("/ws/telemetry/agent")
async def websocket_agent_endpoint(websocket: WebSocket):
    await manager.connect_agent(websocket)
    try:
        while True:
            # Agents stream JSON data
            data = await websocket.receive_text()
            # Broadcast immediately to all clients
            # We could parse here to validate or just passthrough for performance
            # Passthrough is faster for high frequency
            await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect_agent(websocket)
    except Exception as e:
        logger.error(f"Agent WS error: {e}")
        manager.disconnect_agent(websocket)
