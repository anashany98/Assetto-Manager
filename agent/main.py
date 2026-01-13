import time
import sys
import platform
import socket
import logging
import requests
import uuid
import datetime
import json
from datetime import datetime, timezone

import asyncio
import threading
import websockets
import ac_telemetry

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "funcName": record.funcName,
            "lineno": record.lineno
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger("AC-Agent")

# --- Network Log Handler ---
class NetworkLogHandler(logging.Handler):
    def __init__(self, server_url):
        super().__init__()
        self.server_url = server_url
        self.agent_name = socket.gethostname()

    def emit(self, record):
        # Prevent infinite recursion if requests logs something
        if record.name.startswith("urllib3") or record.name.startswith("requests"):
            return
            
        try:
            log_data = {
                "level": record.levelname,
                "source": f"Agent-{self.agent_name}",
                "message": record.getMessage(),
                "details": f"{record.filename}:{record.lineno}"
            }
            # Use a short timeout and ignore errors to not block the agent
            requests.post(f"{self.server_url}/system/logs/", json=log_data, timeout=1)
        except Exception:
            pass # Fail silently if backend is down

# We will attach this handler later in main() once we read the config
# ---------------------------

import os
from pathlib import Path

# Add shared directory to path
sys.path.append(str(Path(__file__).resolve().parents[1] / "shared"))
try:
    import hashing
except ImportError:
    # Fallback or error handling if shared not found
    hashing = None
    logger.warning("Shared hashing module not found. Sync might fail.")

# Config Loading
# Config Loading
CONFIG_FILE = "config.json"
# Use environment variables for config over hardcoding
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8000")
AC_CONTENT_DIR = Path(os.getenv("AC_CONTENT_DIR", "ac_content_root"))


if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, 'r') as f:
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

    if hashing is None:
        logger.error("Shared hashing module unavailable; skipping sync.")
        return "error"
    
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


# import telemetry # Disabled in favor of Shared Memory Upload
import telemetry # Habilitado para gestión de resultados y fusión de telemetría

def main():
    logger.info("Iniciando Agente AC Manager...")

    logger.info("Iniciando Agente AC Manager...")
    
    # Attach Network Logger (Only for Warnings/Errors)
    net_handler = NetworkLogHandler(SERVER_URL)
    net_handler.setLevel(logging.WARNING) # Sync only important stuff
    logger.addHandler(net_handler)
    
    ensure_directories()
    
    station_id = None
    
    # Bucle de Registro...
    while station_id is None:
        station_data = register_agent()
        if station_data:
            station_id = station_data['id']
        else:
            time.sleep(5)
    
    # Iniciar Streamer de Telemetría (Buffer + Envio WS tiempo real)
    telemetry_thread = TelemetryThread(station_id, SERVER_URL)
    telemetry_thread.start()

    # Bucle Principal
    while True:
        try:
            # Verificar Sincronización
            status = synchronize_content(station_id)
            
            # Verificar Resultados de Carrera (Basado en Archivo)
            # Esto fusionará la telemetría en buffer con los tiempos oficiales
            telemetry.check_for_new_results(SERVER_URL, station_id)
            
            # Enviar Heartbeat
            send_heartbeat(station_id, status or "online")
            
            time.sleep(10) 
        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Error en bucle principal: {e}")
            time.sleep(5)

class TelemetryThread(threading.Thread):
    def __init__(self, station_id, server_url):
        super().__init__()
        self.station_id = station_id
        self.http_url = server_url
        self.server_url = server_url.replace("http", "ws") + "/ws/telemetry/agent"
        self.ac = ac_telemetry.ACSharedMemory()
        self.running = True
        self.daemon = True
        
        # Buffer de Telemetría
        self.current_lap_buffer = []
        self.last_lap_count = -1
        self.last_lap_timestamp = time.time()

    def run(self):
        asyncio.run(self.stream_telemetry())

    async def stream_telemetry(self):
        logger.info(f"Conectando a WS de Telemetría: {self.server_url}")
        while self.running:
            try:
                # Bucle de reconexión
                async with websockets.connect(self.server_url) as websocket:
                    logger.info("WS Telemetría Conectado")
                    # Handshake / Identificación
                    await websocket.send(json.dumps({
                        "type": "identify",
                        "station_id": self.station_id,
                        "role": "agent"
                    }))

                    # Run send and receive loops concurrently
                    await asyncio.gather(
                        self.send_loop(websocket),
                        self.receive_loop(websocket)
                    )

            except Exception as e:
                logger.error(f"Error WS Telemetría: {e}")
                await asyncio.sleep(5) # Delay reconexión

    async def send_loop(self, websocket):
        while self.running:
            try:
                data = self.ac.read_data()
                if data:
                    # 1. Stream Tiempo Real al Backend (para Live View)
                    data['station_id'] = self.station_id
                    await websocket.send(json.dumps(data))
                    
                    # 2. Lógica de Buffer para Análisis/Comparador
                    current_laps = data.get('laps', 0)
                    
                    # Inicializar contador
                    if self.last_lap_count == -1:
                        self.last_lap_count = current_laps
                    
                    # Añadir muestra al buffer
                    self.current_lap_buffer.append({
                        "t": data.get('lap_time_ms', 0),
                        "s": data.get('speed_kmh', 0),
                        "r": data.get('rpm', 0),
                        "g": data.get('gear', 0),
                        "n": data.get('normalized_pos', 0),
                        "gas": data.get('gas', 0),
                        "brk": data.get('brake', 0),
                        "str": data.get('steer', 0),
                        "gl": data.get('g_lat', 0),
                        "gn": data.get('g_lon', 0),
                        "tt": data.get('tyre_temp', 0)
                    })
                    
                    # 3. Detección de Cambio de Vuelta
                    if current_laps > self.last_lap_count:
                        logger.info(f"¡Vuelta Terminada! {self.last_lap_count} -> {current_laps}")
                        
                        # Guardar la vuelta completada en el módulo de telemetría
                        telemetry.save_lap_telemetry(self.last_lap_count, self.current_lap_buffer)
                        
                        # Resetear para nueva vuelta
                        self.current_lap_buffer = []
                        self.last_lap_count = current_laps
                        self.last_lap_timestamp = time.time()

                # Rate limit 20Hz (0.05s)
                await asyncio.sleep(0.05)
            except websockets.ConnectionClosed:
                break # Exit loop to trigger reconnection
            except Exception as e:
                logger.error(f"Error sending telemetry: {e}")
                break

    async def receive_loop(self, websocket):
        while self.running:
            try:
                msg = await websocket.recv()
                data = json.loads(msg)
                command = data.get("command")
                
                if command == "shutdown":
                    logger.info("Received SHUTDOWN command")
                    if platform.system() == "Windows":
                        os.system("shutdown /s /t 5 /c \"Apagado remoto desde AC Manager\"")
                    else:
                        os.system("shutdown -h now")
                
                elif command == "restart":
                     logger.info("Received RESTART command")
                     if platform.system() == "Windows":
                        os.system("shutdown /r /t 5 /c \"Reinicio remoto desde AC Manager\"")
                     else:
                        os.system("reboot")

                elif command == "panic":
                    logger.info("Received PANIC command: Killing Game Processes")
                    if platform.system() == "Windows":
                        os.system("taskkill /F /IM acs.exe")
                        os.system("taskkill /F /IM acs_pro.exe") # Just in case
                        os.system("taskkill /F /IM \"Content Manager.exe\"")
                    else:
                        os.system("pkill -9 acs")

                        
            except websockets.ConnectionClosed:
                break
            except Exception as e:
                logger.error(f"Error receiving command: {e}")
                break

if __name__ == "__main__":
    main()
