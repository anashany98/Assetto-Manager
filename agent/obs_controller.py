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
import uuid
import websockets
from typing import Optional, Dict, Any
import logging
from config import OBS_HOST, OBS_PORT, OBS_PASSWORD

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
            self.ws = await websockets.connect(uri, ping_interval=20, ping_timeout=10)
            
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
        """Send a request to OBS and wait for the matching response by requestId."""
        if not self.connected or not self.ws:
            return {"error": "Not connected"}

        request_id = str(uuid.uuid4())

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

        loop = asyncio.get_event_loop()
        deadline = loop.time() + 5.0
        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    return {"error": "Timeout"}
                response = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=remaining))
                if response.get("op") == 7:
                    resp_d = response.get("d", {})
                    if resp_d.get("requestId") == request_id:
                        return resp_d.get("responseData", {})
                    # Different request's response — keep waiting for ours
        except asyncio.TimeoutError:
            return {"error": "Timeout"}
        except Exception as e:
            logger.error("Error waiting for OBS response: %s", e)
            return {"error": str(e)}
    
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
    
    async def get_scenes(self) -> Dict[str, Any]:
        """Get the list of available scenes and the current active scene."""
        try:
            result = await self._request("GetSceneList")
            scenes = [s.get("sceneName") for s in result.get("scenes", []) if s.get("sceneName")]
            return {
                "scenes": scenes,
                "current": result.get("currentProgramSceneName"),
            }
        except Exception as e:
            logger.error("Failed to get scenes: %s", e)
            return {"scenes": [], "error": str(e)}

    async def disconnect(self) -> None:
        """Disconnect from OBS WebSocket."""
        if self.ws:
            await self.ws.close()
            self.ws = None
            self.connected = False


# Singleton instance for the agent
obs_controller: Optional[OBSController] = None


def get_obs_controller(host: Optional[str] = None, port: Optional[int] = None, password: Optional[str] = None) -> OBSController:
    """Get or create the OBS controller instance."""
    global obs_controller
    target_host = host or OBS_HOST
    target_port = port or OBS_PORT
    target_password = password if password not in (None, "") else OBS_PASSWORD
    if (
        obs_controller is None
        or obs_controller.host != target_host
        or obs_controller.port != target_port
        or (target_password and obs_controller.password != target_password)
    ):
        obs_controller = OBSController(host=target_host, port=target_port, password=target_password)
    elif target_password and obs_controller.password != target_password:
        obs_controller.password = target_password
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
    params = params or {}
    controller = get_obs_controller(
        host=params.get("host"),
        port=params.get("port"),
        password=params.get("password")
    )

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
    
    elif command == "get_scenes":
        if not controller.connected:
            await controller.connect()
        return await controller.get_scenes()

    elif command == "disconnect":
        await controller.disconnect()
        return {"success": True, "connected": False}

    return {"error": f"Unknown command: {command}"}
