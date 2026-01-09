import time
import sys
import platform
import socket
import logging
import requests
import uuid

import asyncio
import threading
import websockets
import ac_telemetry

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("AC-Agent")

import os
from pathlib import Path

# Add shared directory to path
sys.path.append(str(Path(__file__).resolve().parents[1] / "shared"))
try:
    import hashing
except ImportError:
    # Fallback or error handling if shared not found
    logger.warning("Shared hashing module not found. Sync might fail.")

# Config Loading
CONFIG_FILE = "config.json"
SERVER_URL = "http://localhost:8000" # Default
AC_CONTENT_DIR = Path("ac_content_root") # Default

if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, 'r') as f:
            import json
            config = json.load(f)
            SERVER_URL = config.get("server_url", SERVER_URL)
            if config.get("ac_content_dir"):
                AC_CONTENT_DIR = Path(config["ac_content_dir"])
            logger.info(f"Loaded config. Server URL: {SERVER_URL}")
    except Exception as e:
        logger.error(f"Failed to load config file: {e}")

# Global Timeout for stability
REQUEST_TIMEOUT = 10

def get_mac_address():
    mac = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff) 
                    for elements in range(0, 2 * 6, 2)][::-1])
    return mac

def get_ip_address():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_system_info():
    return {
        "name": socket.gethostname(),
        "hostname": socket.gethostname(),
        "mac_address": get_mac_address(),
        "ip_address": get_ip_address(),
    }

def register_agent():
    info = get_system_info()
    try:
        logger.info(f"Attempting to register agent: {info}")
        response = requests.post(f"{SERVER_URL}/stations/", json=info, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        station_data = response.json()
        logger.info(f"Registered successfully. Station ID: {station_data['id']}")
        return station_data
    except requests.exceptions.ConnectionError:
        logger.error(f"Could not connect to server at {SERVER_URL}")
        return None
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        return None

def ensure_directories():
    AC_CONTENT_DIR.mkdir(parents=True, exist_ok=True)

def download_file(url, local_path):
    try:
        # If url is relative, prepend server url
        full_url = url if url.startswith("http") else f"{SERVER_URL}{url}"
        
        with requests.get(full_url, stream=True, timeout=30) as r: # Longer timeout for downloads
            r.raise_for_status()
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192): 
                    f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        return False

def synchronize_content(station_id):
    logger.info("Starting synchronization check...")
    
    # 1. Get Target Manifest
    try:
        resp = requests.get(f"{SERVER_URL}/stations/{station_id}/target-manifest", timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        target_manifest = resp.json()
    except Exception as e:
        logger.error(f"Could not fetch target manifest: {e}")
        return
    
    if not target_manifest:
        logger.info("No active profile/manifest. Skipping sync.")
        return "online"

    # 2. Get Local Manifest
    local_manifest = hashing.generate_manifest(str(AC_CONTENT_DIR))
    
    # 3. Calculate Diff
    files_to_download = []
    files_to_delete = []
    
    # Check what is missing or different
    for file_path, target_info in target_manifest.items():
        if file_path not in local_manifest:
            files_to_download.append((file_path, target_info))
        elif local_manifest[file_path]['hash'] != target_info['hash']:
             logger.info(f"Hash mismatch for {file_path}")
             files_to_download.append((file_path, target_info))
             
    # Check what is extra
    for file_path in local_manifest:
         if file_path not in target_manifest:
             files_to_delete.append(file_path)
             
    logger.info(f"Sync Status: {len(files_to_download)} to download, {len(files_to_delete)} to delete")
    
    if not files_to_download and not files_to_delete:
        logger.info("System is up to date.")
        return "online"

    # 4. Apply Changes
    # Update status to syncing
    requests.put(f"{SERVER_URL}/stations/{station_id}", json={"status": "syncing"}, timeout=REQUEST_TIMEOUT)
    
    for file_path in files_to_delete:
        try:
            full_path = AC_CONTENT_DIR / file_path
            if full_path.exists():
                os.remove(full_path)
        except Exception as e:
            logger.error(f"Failed to delete {file_path}: {e}")

    for file_path, info in files_to_download:
        local_path = AC_CONTENT_DIR / file_path
        if download_file(info['url'], local_path):
            logger.info(f"Downloaded: {file_path}")
        else:
            logger.error(f"Failed to download: {file_path}")
            return "error" # Stop if download fails
            
    return "online"

def send_heartbeat(station_id, status="online"):
    try:
        data = {
            "is_active": True,
            "status": status
        }
        requests.put(f"{SERVER_URL}/stations/{station_id}", json=data, timeout=REQUEST_TIMEOUT)
    except Exception as e:
        logger.error(f"Heartbeat failed: {e}")

import telemetry

def main():
    logger.info("Starting AC Manager Agent...")
    ensure_directories()
    
    station_id = None
    
    # Registration Loop...
    while station_id is None:
        station_data = register_agent()
        if station_data:
            station_id = station_data['id']
        else:
            time.sleep(5)
    
    # Start Telemetry Streamer
    telemetry_thread = TelemetryThread(station_id, SERVER_URL)
    telemetry_thread.start()

    # Main Loop
    while True:
        try:
            # Run Sync Check
            status = synchronize_content(station_id)
            
            # Check for new Race Results
            telemetry.check_for_new_results(SERVER_URL, station_id)
            
            # Send Heartbeat with current status
            send_heartbeat(station_id, status or "online")
            
            time.sleep(10) 
        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Main loop error: {e}")
            time.sleep(5)

class TelemetryThread(threading.Thread):
    def __init__(self, station_id, server_url):
        super().__init__()
        self.station_id = station_id
        self.server_url = server_url.replace("http", "ws") + "/ws/telemetry/agent"
        self.ac = ac_telemetry.ACSharedMemory()
        self.running = True
        self.daemon = True

    def run(self):
        asyncio.run(self.stream_telemetry())

    async def stream_telemetry(self):
        logger.info(f"Connecting to Telemetry WS: {self.server_url}")
        while self.running:
            try:
                async with websockets.connect(self.server_url) as websocket:
                    logger.info("Telemetry WS Connected")
                    # Handshake / Identify
                    await websocket.send(json.dumps({
                        "type": "identify",
                        "station_id": self.station_id,
                        "role": "agent"
                    }))

                    while self.running:
                        data = self.ac.read_data()
                        if data:
                            # Add station ID to packet
                            data['station_id'] = self.station_id
                            await websocket.send(json.dumps(data))
                        
                        # Rate limit 10Hz
                        await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"Telemetry WS Error: {e}")
                await asyncio.sleep(5) # Reconnect delay

if __name__ == "__main__":
    main()
