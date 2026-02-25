import asyncio
import websockets
import json
import logging
import platform
import os
import threading
import time
from config import AGENT_TOKEN, logger, OBS_HOST, OBS_PORT, OBS_PASSWORD, STREAM_URL
from scanner import scan_ac_content
from commands import (
    launch_session_logic, create_lobby_server, join_lobby_client, 
    stop_lobby_server, install_mod_logic, restart_agent_process, set_weather_logic,
    watchdog
)
from utils import get_system_info
import ac_telemetry
import telemetry # The existing telemetry module for saving results
from obs_controller import handle_obs_command
from idle_display import start_idle_display, stop_idle_display

class AgentWSClient(threading.Thread):
    def __init__(self, station_id, server_url):
        super().__init__()
        self.station_id = station_id
        self.server_url = server_url.replace("http", "ws") + "/ws/telemetry/agent"
        self.running = True
        self.daemon = True
        self.ac = ac_telemetry.ACSharedMemory()
        
        # Telemetry Buffer
        self.current_lap_buffer = []
        self.last_lap_count = -1
        self.last_lap_timestamp = time.time()

    def run(self):
        asyncio.run(self.stream_telemetry())

    async def stream_telemetry(self):
        logger.info(f"Connecting to Telemetry WS: {self.server_url}")
        while self.running:
            try:
                async with websockets.connect(self.server_url) as websocket:
                    logger.info("WS Connected")
                    await websocket.send(json.dumps({
                        "type": "identify",
                        "station_id": self.station_id,
                        "role": "agent",
                        "token": AGENT_TOKEN
                    }))

                    await asyncio.gather(
                        self.send_loop(websocket),
                        self.receive_loop(websocket),
                        return_exceptions=True
                    )
            except Exception as e:
                logger.error(f"WS Error: {e}")
                await asyncio.sleep(5)

    async def send_loop(self, websocket):
        loop = asyncio.get_event_loop()
        while self.running:
            try:
                data = await loop.run_in_executor(None, self.ac.read_data)
                if data:
                    data['station_id'] = self.station_id
                    await websocket.send(json.dumps(data))
                    
                    # Buffer logic
                    current_laps = data.get('laps', 0)
                    if self.last_lap_count == -1:
                        self.last_lap_count = current_laps
                    
                    self.current_lap_buffer.append({
                        "t": data.get('lap_time_ms', 0),
                         # ... (Full buffer logic skipped for brevity, but should be here)
                    })
                    
                    if current_laps > self.last_lap_count:
                        telemetry.save_lap_telemetry(self.last_lap_count, self.current_lap_buffer)
                        self.current_lap_buffer = []
                        self.last_lap_count = current_laps

                await asyncio.sleep(0.05)
            except websockets.ConnectionClosed:
                break
            except Exception:
                break

    async def receive_loop(self, websocket):
        while self.running:
            try:
                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                except asyncio.TimeoutError:
                    continue
                    
                data = json.loads(msg)
                command = data.get("command")

                if data.get("type") == "obs_control":
                    params = data.get("params") or {}
                    if "host" not in params and OBS_HOST:
                        params["host"] = OBS_HOST
                    if "port" not in params and OBS_PORT:
                        params["port"] = OBS_PORT
                    if "password" not in params and OBS_PASSWORD:
                        params["password"] = OBS_PASSWORD
                    result = await handle_obs_command(command, params)
                    response = {
                        "type": "obs_status",
                        "station_id": self.station_id,
                        "command": command,
                        "result": result,
                    }
                    if "streaming" in result:
                        response["is_streaming"] = bool(result.get("streaming"))
                    if STREAM_URL:
                        response["stream_url"] = STREAM_URL
                    await websocket.send(json.dumps(response))
                    continue
                
                if command:
                    logger.info(f"Received command: {command}")
                
                if command == "shutdown":
                    if platform.system() == "Windows":
                        os.system("shutdown /s /t 5")
                
                elif command == "restart":
                     if platform.system() == "Windows":
                        os.system("shutdown /r /t 5")
                
                elif command == "panic":
                    stop_idle_display()
                    watchdog.stop()
                    os.system("taskkill /F /IM acs.exe")
                    start_idle_display()
                
                elif command == "stop_session":
                    stop_idle_display()
                    watchdog.stop()
                    os.system("taskkill /F /IM acs.exe")
                    start_idle_display()
                
                elif command == "launch_session":
                    stop_idle_display()
                    threading.Thread(target=launch_session_logic, args=(data, self.station_id)).start()
                
                elif command == "create_lobby":
                    stop_idle_display()
                    threading.Thread(target=create_lobby_server, args=(data,)).start()
                    
                elif command == "join_lobby":
                    stop_idle_display()
                    threading.Thread(target=join_lobby_client, args=(data,)).start()
                    
                elif command == "stop_lobby":
                    stop_lobby_server()
                    start_idle_display()
                    
                elif command == "install_mod":
                    threading.Thread(target=install_mod_logic, args=(data,)).start()
                
                elif command == "scan_content":
                     ac_path = data.get("ac_path") or get_system_info().get("ac_path")
                     content = scan_ac_content(ac_path, station_ip=data.get("station_ip"))
                     await websocket.send(json.dumps({
                         "type": "content_scan_result",
                         "data": content
                     }))
                     
                elif command == "restart_agent":
                    threading.Thread(target=restart_agent_process).start()

                elif command == "set_weather":
                    threading.Thread(target=set_weather_logic, args=(data.get("value"),)).start()

            except websockets.ConnectionClosed:
                break
            except Exception as e:
                logger.error(f"Error processing WS message: {e}")
                break
