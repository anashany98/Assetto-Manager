"""
OBS WebSocket Control Module for Assetto Manager Agent.

This module allows the Agent to control OBS Studio remotely for streaming
simulator gameplay to the TV Spectator page.

Requirements:
- OBS Studio installed on the simulator PC
- obs-websocket plugin installed (built-in since OBS 28+)
- OBS configured with a Scene for game capture
"""

import asyncio
import json
import hashlib
import base64
import websockets
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class OBSController:
    """Controls OBS Studio via WebSocket for streaming management."""
    
    def __init__(self, host: str = "localhost", port: int = 4455, password: str = ""):
        self.host = host
        self.port = port
        self.password = password
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        self.streaming = False
        
    async def connect(self) -> bool:
        """Connect to OBS WebSocket server."""
        try:
            uri = f"ws://{self.host}:{self.port}"
            self.ws = await websockets.connect(uri, ping_interval=None)
            
            # Receive Hello message
            hello = json.loads(await self.ws.recv())
            if hello.get("op") != 0:
                logger.error("Invalid OBS WebSocket hello")
                return False
            
            # Authenticate if required
            auth_required = hello.get("d", {}).get("authentication")
            if auth_required and self.password:
                challenge = auth_required.get("challenge", "")
                salt = auth_required.get("salt", "")
                auth_string = self._generate_auth_string(challenge, salt)
                
                await self._send({
                    "op": 1,
                    "d": {
                        "rpcVersion": 1,
                        "authentication": auth_string
                    }
                })
            else:
                await self._send({
                    "op": 1,
                    "d": {"rpcVersion": 1}
                })
            
            # Wait for Identified response
            identified = json.loads(await self.ws.recv())
            if identified.get("op") == 2:
                self.connected = True
                logger.info("Connected to OBS WebSocket")
                return True
            else:
                logger.error(f"OBS authentication failed: {identified}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to connect to OBS: {e}")
            return False
    
    def _generate_auth_string(self, challenge: str, salt: str) -> str:
        """Generate authentication string for OBS WebSocket."""
        secret = base64.b64encode(
            hashlib.sha256((self.password + salt).encode()).digest()
        ).decode()
        auth = base64.b64encode(
            hashlib.sha256((secret + challenge).encode()).digest()
        ).decode()
        return auth
    
    async def _send(self, data: Dict[str, Any]) -> None:
        """Send message to OBS."""
        if self.ws:
            await self.ws.send(json.dumps(data))
    
    async def _request(self, request_type: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Send a request to OBS and wait for response."""
        if not self.connected or not self.ws:
            return {"error": "Not connected"}
        
        request_id = str(hash(request_type + str(data)))
        
        msg = {
            "op": 6,
            "d": {
                "requestType": request_type,
                "requestId": request_id,
            }
        }
        if data:
            msg["d"]["requestData"] = data
        
        await self._send(msg)
        
        # Wait for response
        try:
            response = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=5.0))
            if response.get("op") == 7:
                return response.get("d", {}).get("responseData", {})
        except asyncio.TimeoutError:
            return {"error": "Timeout"}
        
        return {"error": "Unknown response"}
    
    async def start_streaming(self) -> bool:
        """Start OBS streaming."""
        try:
            result = await self._request("StartStream")
            if "error" not in result:
                self.streaming = True
                logger.info("OBS streaming started")
                return True
        except Exception as e:
            logger.error(f"Failed to start streaming: {e}")
        return False
    
    async def stop_streaming(self) -> bool:
        """Stop OBS streaming."""
        try:
            result = await self._request("StopStream")
            if "error" not in result:
                self.streaming = False
                logger.info("OBS streaming stopped")
                return True
        except Exception as e:
            logger.error(f"Failed to stop streaming: {e}")
        return False
    
    async def get_stream_status(self) -> Dict[str, Any]:
        """Get current streaming status."""
        try:
            result = await self._request("GetStreamStatus")
            return {
                "streaming": result.get("outputActive", False),
                "duration": result.get("outputDuration", 0),
                "bytes": result.get("outputBytes", 0)
            }
        except Exception as e:
            return {"streaming": False, "error": str(e)}
    
    async def set_scene(self, scene_name: str) -> bool:
        """Switch to a specific scene."""
        try:
            await self._request("SetCurrentProgramScene", {"sceneName": scene_name})
            return True
        except Exception as e:
            logger.error(f"Failed to set scene: {e}")
            return False
    
    async def disconnect(self) -> None:
        """Disconnect from OBS WebSocket."""
        if self.ws:
            await self.ws.close()
            self.ws = None
            self.connected = False


# Singleton instance for the agent
obs_controller: Optional[OBSController] = None


def get_obs_controller(password: str = "") -> OBSController:
    """Get or create the OBS controller instance."""
    global obs_controller
    if obs_controller is None:
        obs_controller = OBSController(password=password)
    return obs_controller


async def handle_obs_command(command: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Handle OBS commands from the backend.
    
    Commands:
    - connect: Connect to OBS
    - start_stream: Start streaming
    - stop_stream: Stop streaming
    - status: Get stream status
    - set_scene: Switch scene
    """
    controller = get_obs_controller(params.get("password", "") if params else "")
    params = params or {}
    
    if command == "connect":
        success = await controller.connect()
        return {"success": success, "connected": controller.connected}
    
    elif command == "start_stream":
        if not controller.connected:
            await controller.connect()
        success = await controller.start_streaming()
        return {"success": success, "streaming": controller.streaming}
    
    elif command == "stop_stream":
        success = await controller.stop_streaming()
        return {"success": success, "streaming": controller.streaming}
    
    elif command == "status":
        status = await controller.get_stream_status()
        status["connected"] = controller.connected
        return status
    
    elif command == "set_scene":
        scene = params.get("scene", "Game")
        success = await controller.set_scene(scene)
        return {"success": success, "scene": scene}
    
    elif command == "disconnect":
        await controller.disconnect()
        return {"success": True, "connected": False}
    
    return {"error": f"Unknown command: {command}"}
