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


# --- CONTENT SCANNER ---
def scan_ac_content(ac_path: str, station_ip: str = None) -> dict:
    """
    Scan the Assetto Corsa content folder for installed cars and tracks.
    Returns a dict with 'cars' and 'tracks' lists, including proxy image URLs.
    """
    result = {"cars": [], "tracks": []}
    
    if not ac_path or not os.path.exists(ac_path):
        logger.warning(f"AC path not found or not configured: {ac_path}")
        return result
    
    content_path = os.path.join(ac_path, "content")
    
    # Use station IP for image proxy URL, fallback to localhost
    proxy_base = f"http://{station_ip or 'localhost'}:8081"
    
    # Helper to find first existing image and return proxy URL
    def find_image_url(base_path, content_path_root, *filenames):
        for fname in filenames:
            full_path = os.path.join(base_path, fname)
            if os.path.exists(full_path):
                # Convert to relative path from content folder
                rel_path = os.path.relpath(full_path, content_path_root).replace("\\", "/")
                return f"{proxy_base}/{rel_path}"
        return None
    
    # Scan Cars
    cars_path = os.path.join(content_path, "cars")
    if os.path.exists(cars_path):
        for car_folder in os.listdir(cars_path):
            car_dir = os.path.join(cars_path, car_folder)
            if os.path.isdir(car_dir):
                ui_dir = os.path.join(car_dir, "ui")
                ui_json = os.path.join(ui_dir, "ui_car.json")
                name = car_folder
                brand = ""
                
                if os.path.exists(ui_json):
                    try:
                        with open(ui_json, 'r', encoding='utf-8', errors='ignore') as f:
                            ui_data = json.load(f)
                            name = ui_data.get("name", car_folder)
                            brand = ui_data.get("brand", "")
                    except Exception:
                        pass
                
                # Find preview image and generate proxy URL
                image_url = (
                    find_image_url(ui_dir, content_path, "badge.png", "preview.png") or
                    find_image_url(car_dir, content_path, "logo.png")
                )
                
                result["cars"].append({
                    "id": car_folder,
                    "name": name,
                    "brand": brand,
                    "image_url": image_url
                })
    
    # Scan Tracks
    tracks_path = os.path.join(content_path, "tracks")
    if os.path.exists(tracks_path):
        for track_folder in os.listdir(tracks_path):
            track_dir = os.path.join(tracks_path, track_folder)
            if os.path.isdir(track_dir):
                ui_dir = os.path.join(track_dir, "ui")
                ui_json = os.path.join(ui_dir, "ui_track.json")
                name = track_folder
                layout = ""
                
                if os.path.exists(ui_json):
                    try:
                        with open(ui_json, 'r', encoding='utf-8', errors='ignore') as f:
                            ui_data = json.load(f)
                            name = ui_data.get("name", track_folder)
                            layout = ui_data.get("description", "")
                    except Exception:
                        pass
                
                # Find preview image and generate proxy URL
                image_url = find_image_url(ui_dir, content_path, "preview.png", "outline.png")
                
                result["tracks"].append({
                    "id": track_folder,
                    "name": name,
                    "layout": layout,
                    "image_url": image_url
                })
    
    logger.info(f"Scanned AC content: {len(result['cars'])} cars, {len(result['tracks'])} tracks")
    return result


# --- PROCESS WATCHDOG ---
class ProcessWatchdog:
    """
    Monitors acs.exe and restarts it if it crashes during an active session.
    """
    def __init__(self):
        self.active_session = None  # Dict with car, track, ac_path, etc.
        self.watching = False
        self._thread = None
    
    def start(self, session_config: dict):
        """Start watching for a session"""
        self.active_session = session_config
        self.watching = True
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()
        logger.info("Watchdog started for session")
    
    def stop(self):
        """Stop watching"""
        self.watching = False
        self.active_session = None
        logger.info("Watchdog stopped")
    
    def _is_game_running(self) -> bool:
        """Check if acs.exe is running"""
        try:
            import subprocess
            if platform.system() == "Windows":
                result = subprocess.run(
                    ["tasklist", "/FI", "IMAGENAME eq acs.exe"],
                    capture_output=True, text=True
                )
                return "acs.exe" in result.stdout
            else:
                result = subprocess.run(["pgrep", "-x", "acs"], capture_output=True)
                return result.returncode == 0
        except Exception:
            return False
    
    def _restart_game(self):
        """Restart the game using stored session config"""
        if not self.active_session:
            return
        
        ac_path = self.active_session.get("ac_path")
        if not ac_path:
            logger.error("Watchdog: No ac_path in session config, cannot restart")
            return
        
        acs_exe = os.path.join(ac_path, "acs.exe")
        if os.path.exists(acs_exe):
            logger.info("Watchdog: Restarting crashed game...")
            try:
                import subprocess
                subprocess.Popen([acs_exe], cwd=ac_path)
                logger.info("Watchdog: Game restarted successfully")
            except Exception as e:
                logger.error(f"Watchdog: Failed to restart game: {e}")
        else:
            logger.error(f"Watchdog: acs.exe not found at {acs_exe}")
    
    def _watch_loop(self):
        """Main watchdog loop"""
        # Wait a bit for game to start
        time.sleep(10)
        
        while self.watching:
            if not self._is_game_running():
                logger.warning("Watchdog: Game not running, attempting restart...")
                self._restart_game()
                time.sleep(15)  # Wait for game to start before checking again
            time.sleep(5)  # Check every 5 seconds


# Global watchdog instance
watchdog = ProcessWatchdog()


# --- IMAGE PROXY SERVER ---
class ImageProxyServer:
    """
    Simple HTTP server to serve local AC content images to the frontend.
    Runs on port 8081 by default.
    """
    def __init__(self, port=8081):
        self.port = port
        self.server = None
        self._thread = None
        self.ac_path = None  # Will be set when station registers
    
    def start(self, ac_path: str):
        """Start the image proxy server"""
        self.ac_path = ac_path
        if not ac_path:
            logger.warning("ImageProxy: No ac_path provided, not starting")
            return
        
        self._thread = threading.Thread(target=self._run_server, daemon=True)
        self._thread.start()
        logger.info(f"Image proxy server started on port {self.port}")
    
    def _run_server(self):
        """Run the HTTP server"""
        from http.server import HTTPServer, SimpleHTTPRequestHandler
        import urllib.parse
        
        ac_path = self.ac_path
        
        class ImageHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                # Don't call super().__init__ here, we override directory
                self.ac_content_path = os.path.join(ac_path, "content") if ac_path else ""
                super().__init__(*args, directory=self.ac_content_path, **kwargs)
            
            def do_GET(self):
                # Parse the path and serve images from AC content folder
                # URL: /cars/ferrari_458/ui/badge.png -> content/cars/ferrari_458/ui/badge.png
                try:
                    # Clean path
                    path = urllib.parse.unquote(self.path)
                    if path.startswith('/'):
                        path = path[1:]
                    
                    full_path = os.path.join(self.ac_content_path, path)
                    
                    # Security: ensure we stay within content folder
                    if not os.path.realpath(full_path).startswith(os.path.realpath(self.ac_content_path)):
                        self.send_error(403, "Forbidden")
                        return
                    
                    if os.path.exists(full_path) and os.path.isfile(full_path):
                        # Determine content type
                        ext = os.path.splitext(full_path)[1].lower()
                        content_type = {
                            '.png': 'image/png',
                            '.jpg': 'image/jpeg',
                            '.jpeg': 'image/jpeg',
                            '.gif': 'image/gif',
                            '.webp': 'image/webp',
                        }.get(ext, 'application/octet-stream')
                        
                        # Serve the file
                        self.send_response(200)
                        self.send_header('Content-Type', content_type)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Cache-Control', 'max-age=86400')  # Cache for 1 day
                        self.end_headers()
                        
                        with open(full_path, 'rb') as f:
                            self.wfile.write(f.read())
                    else:
                        self.send_error(404, "File not found")
                except Exception as e:
                    logger.error(f"ImageProxy error: {e}")
                    self.send_error(500, str(e))
            
            def log_message(self, format, *args):
                # Suppress default logging
                pass
        
        try:
            self.server = HTTPServer(('0.0.0.0', self.port), ImageHandler)
            self.server.serve_forever()
        except Exception as e:
            logger.error(f"ImageProxy server error: {e}")


# Global image proxy instance
image_proxy = ImageProxyServer()

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

    # Iniciar Monitor de Hardware (CPU/RAM/Temp)
    try:
        from monitor import HardwareMonitor
        monitor_thread = HardwareMonitor(station_id, SERVER_URL)
        monitor_thread.start()
    except ImportError:
        logger.error("No se pudo cargar monitor.py. Monitorización de HW desactivada.")
    except Exception as e:
        logger.error(f"Error iniciando monitor de hardware: {e}")


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

                elif command == "create_lobby":
                    logger.info(f"Comando recibido: Crear Lobby {data.get('lobby_id')}")
                    threading.Thread(target=create_lobby_server, args=(data,)).start()

                elif command == "join_lobby":
                    logger.info(f"Comando recibido: Unirse a Lobby {data.get('lobby_id')}")
                    threading.Thread(target=join_lobby_client, args=(data,)).start()

                elif command == "stop_lobby":
                    logger.info("Comando recibido: Parar Lobby")
                    threading.Thread(target=stop_lobby_server).start()

                elif command == "install_mod":
                    logger.info(f"Comando recibido: Instalar Mod {data.get('mod_name')}")
                    threading.Thread(target=install_mod_logic, args=(data,)).start()

                elif command == "set_weather":
                     weather = data.get("value")
                     logger.info(f"Received SET_WEATHER command: {weather}")
                     # TODO: Inject simulated keypresses if running in foreground
                     # E.g. /admin weather {weather}
                     # For now, we just acknowledge receipt

                elif command == "launch_session":
                    car = data.get("car")
                    track = data.get("track")
                    assists = data.get("assists", {})
                    driver_name = data.get("driver_name", "Guest")
                    ac_path = data.get("ac_path")  # Path to AC installation
                    duration_minutes = data.get("duration_minutes", 15)
                    logger.info(f"Received LAUNCH_SESSION command: {driver_name} -> {car} @ {track} ({duration_minutes}min)")
                    
                    # 1. Kill any running game instance first
                    if platform.system() == "Windows":
                        os.system("taskkill /F /IM acs.exe 2>nul")
                    else:
                        os.system("pkill -9 acs 2>/dev/null")
                    
                    # Find AC Documents folder (Steam version)
                    ac_docs_path = os.path.join(os.path.expanduser("~"), "Documents", "Assetto Corsa", "cfg")
                    
                    # 2. Write assist.ini based on difficulty settings
                    assist_ini_path = os.path.join(ac_docs_path, "assist.ini")
                    try:
                        assist_content = f"""[ASSISTS]
ABS={assists.get('abs', 1)}
AUTOCLUTCH=1
AUTOSHIFT={assists.get('auto_shifter', 0)}
STABILITY_CONTROL={assists.get('stability_aid', 0)}
TRACTION_CONTROL={assists.get('tc', 1)}
VISUAL_DAMAGE=0
DAMAGE=0
FUEL_RATE=100
TYRE_BLANKETS=1
SLIPSTREAM_EFFECT=100
"""
                        with open(assist_ini_path, 'w') as f:
                            f.write(assist_content)
                        logger.info(f"Wrote assist.ini to {assist_ini_path}")
                    except Exception as e:
                        logger.error(f"Failed to write assist.ini: {e}")
                    
                    # 3. Write race.ini with selected car and track
                    race_ini_path = os.path.join(ac_docs_path, "race.ini")
                    try:
                        race_content = f"""[RACE]
MODEL={car}
MODEL_CONFIG=
SKIN=
TRACK={track}
CONFIG_TRACK=
AI_LEVEL=95

[CAR_0]
MODEL={car}
SKIN=
DRIVER_NAME={driver_name}
NATION=

[GROOVE]
PRESET=0

[SESSION_0]
NAME=Practice
TIME={duration_minutes}
SPAWN_SET=PIT

[SESSION_1]
NAME=Qualify
TIME=0

[SESSION_2]
NAME=Race
LAPS=0
"""
                        with open(race_ini_path, 'w') as f:
                            f.write(race_content)
                        logger.info(f"Wrote race.ini to {race_ini_path} (Car: {car}, Track: {track})")
                    except Exception as e:
                        logger.error(f"Failed to write race.ini: {e}")
                    
                    # 4. Launch Assetto Corsa
                    if ac_path:
                        acs_exe = os.path.join(ac_path, "acs.exe")
                        if os.path.exists(acs_exe):
                            logger.info(f"Launching AC from: {acs_exe}")
                            try:
                                import subprocess
                                
                                # Launch AC
                                subprocess.Popen([acs_exe], cwd=ac_path)
                                logger.info(f"AC launched successfully: {car} @ {track}")
                                
                                # 5. Start Watchdog to monitor for crashes
                                session_config = {
                                    "car": car,
                                    "track": track,
                                    "ac_path": ac_path,
                                    "driver_name": driver_name
                                }
                                watchdog.start(session_config)
                                
                                # 6. Session Timer - Kill game after duration_minutes
                                def session_timer():
                                    logger.info(f"Session timer started: {duration_minutes} minutes")
                                    time.sleep(duration_minutes * 60)
                                    logger.info("Session time expired! Closing game...")
                                    watchdog.stop()  # Stop watchdog so it doesn't restart
                                    if platform.system() == "Windows":
                                        os.system("taskkill /F /IM acs.exe 2>nul")
                                    else:
                                        os.system("pkill -9 acs 2>/dev/null")
                                
                                timer_thread = threading.Thread(target=session_timer, daemon=True)
                                timer_thread.start()
                                
                            except Exception as e:
                                logger.error(f"Failed to launch AC: {e}")
                        else:
                            logger.error(f"acs.exe not found at: {acs_exe}")
                    else:
                        logger.warning("No ac_path configured for this station. Cannot launch.")

                elif command == "scan_content":
                    # Scan the AC content folder and return via WebSocket
                    ac_path = data.get("ac_path")
                    logger.info(f"Received SCAN_CONTENT command for: {ac_path}")
                    content = scan_ac_content(ac_path)
                    # Send response back
                    await websocket.send(json.dumps({
                        "type": "content_scan_result",
                        "data": content
                    }))
                    logger.info(f"Sent content scan result: {len(content.get('cars', []))} cars, {len(content.get('tracks', []))} tracks")

                elif command == "stop_session":
                    # Manual stop command from backend
                    logger.info("Received STOP_SESSION command")
                    watchdog.stop()
                    if platform.system() == "Windows":
                        os.system("taskkill /F /IM acs.exe 2>nul")
                    else:
                        os.system("pkill -9 acs 2>/dev/null")

            except websockets.ConnectionClosed:
                break
            except Exception as e:
                logger.error(f"Error procesando mensaje WS: {e}")
                break

# --- MOD INSTALLER METHODS ---
def install_mod_logic(data):
    """
    Downloads and installs a mod (Car/Track) from the Manager Backend.
    """
    try:
        mod_name = data.get("mod_name")
        mod_type = data.get("mod_type") # 'car' or 'track'
        download_path = data.get("download_url") # e.g. /static/mods/ferrari.zip
        file_name = data.get("file_name")
        
        # 1. Construct Full Download URL
        # download_path typically starts with /, so we join carefully.
        if download_path.startswith("/"):
            url = f"{SERVER_URL}{download_path}"
        else:
            url = f"{SERVER_URL}/{download_path}"
            
        logger.info(f"Downloading mod '{mod_name}' from {url}...")
        
        # 2. Download to Temp
        temp_dir = os.path.join(os.getenv("TEMP", "/tmp"), "ac_manager_downloads")
        os.makedirs(temp_dir, exist_ok=True)
        local_zip_path = os.path.join(temp_dir, file_name)
        
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(local_zip_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192): 
                    f.write(chunk)
                    
        logger.info(f"Download complete: {local_zip_path}")
        
        # 3. Determine Target Directory
        # AC_CONTENT_DIR is usually root game folder.
        # We need to extract to content/cars or content/tracks.
        if "content" not in str(AC_CONTENT_DIR).lower():
             # Assume AC_CONTENT_DIR is root
             target_base = os.path.join(AC_CONTENT_DIR, "content", "cars" if mod_type == "car" else "tracks")
        else:
             # Just in case AC_CONTENT_DIR points to 'content'
             target_base = os.path.join(AC_CONTENT_DIR, "cars" if mod_type == "car" else "tracks")
             
        os.makedirs(target_base, exist_ok=True)
        
        # 4. Extract
        import zipfile
        import patoolib
        
        logger.info(f"Extracting to {target_base}...")
        
        try:
            if file_name.lower().endswith(".zip"):
                with zipfile.ZipFile(local_zip_path, 'r') as zip_ref:
                    zip_ref.extractall(target_base)
            else:
                patoolib.extract_archive(local_zip_path, outdir=target_base)
                
            logger.info(f"Mod '{mod_name}' installed successfully!")
            
            # Optional: Clean up zip
            os.remove(local_zip_path)
            
            # Trigger a rescan locally?
            # scan_ac_content(AC_CONTENT_DIR, get_ip_address())
            
        except Exception as e:
            logger.error(f"Extraction failed: {e}")

    except Exception as e:
        logger.error(f"Install Mod failed: {e}")

# --- LOBBY HELPER METHODS ---

def create_lobby_server(data):
    """
    Configures and starts acServer.exe for a multiplayer lobby.
    """
    try:
        # Get active session path (or default)
        ac_path = watchdog.active_session.get("ac_path") if watchdog.active_session else os.environ.get("AC_PATH", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa")
        server_dir = os.path.join(ac_path, "server")
        cfg_dir = os.path.join(server_dir, "cfg")
        
        if not os.path.exists(server_dir):
            logger.error("acServer.exe not found (server folder missing)")
            return

        # Ensure cfg directory exists
        os.makedirs(cfg_dir, exist_ok=True)
        
        # 1. Generate server_cfg.ini
        server_cfg = f"""[SERVER]
NAME=AC Manager Lobby {data.get('lobby_id')}
CARS={data.get('car')};
TRACK={data.get('track')}
SUN_ANGLE=48
MAX_CLIENTS={data.get('max_players')}
UDP_PORT={data.get('port')}
TCP_PORT={data.get('port')}
HTTP_PORT={data.get('port') + 1}
REGISTER_TO_LOBBY=0
LOOP_MODE=1
PASSWORD=
ADMIN_PASSWORD=admin
Rating=100
RatingTurbolence=100

[PRACTICE]
NAME=Practice
TIME=0
IS_OPEN=1

[QUALIFY]
NAME=Qualifying
TIME=0
IS_OPEN=1

[RACE]
NAME=Race
LAPS={data.get('laps')}
WAIT_TIME=60
IS_OPEN=1
"""
        with open(os.path.join(cfg_dir, "server_cfg.ini"), "w") as f:
            f.write(server_cfg)
            
        # 2. Generate entry_list.ini
        entry_list = "[CAR_0]\nMODEL={}\nSKIN=\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\nRESTRICTOR=0\n\n".format(data.get('car'))
        # Generate N entries
        full_entry_list = ""
        for i in range(data.get('max_players')):
            full_entry_list += entry_list.replace("CAR_0", f"CAR_{i}")

        with open(os.path.join(cfg_dir, "entry_list.ini"), "w") as f:
            f.write(full_entry_list)
            
        # 3. Start acServer.exe
        exe_path = os.path.join(server_dir, "acServer.exe")
        if os.path.exists(exe_path):
            logger.info("Starting acServer.exe...")
            # Kill existing
            subprocess.run(["taskkill", "/F", "/IM", "acServer.exe"], capture_output=True)
            # Start new
            subprocess.Popen([exe_path], cwd=server_dir)
        else:
            logger.error("acServer.exe executable not found")

    except Exception as e:
        logger.error(f"Failed to create lobby server: {e}")

def join_lobby_client(data):
    """
    Launches AC client to join a specific lobby server.
    """
    try:
        ac_path = watchdog.active_session.get("ac_path") if watchdog.active_session else os.environ.get("AC_PATH", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa")
        acs_exe = os.path.join(ac_path, "acs.exe")
        
        # We need to construct a race.ini that points to the remote server
        # Standard AC launcher creates 'race.ini' with [REMOTE] section configuration
        
        race_ini = f"""[RACE]
MODEL={data.get('car')}
MODEL_CONFIG=
TRACK={data.get('track')}
CONFIG_TRACK=
CARS={data.get('car')}
AI_LEVEL=98
FIXED_SETUP=0
PENALTIES=1

[REMOTE]
ACTIVE=1
SERVER_IP={data.get('server_ip')}
SERVER_PORT={data.get('port')}
NAME=Driver
TEAM=
GUID=
REQUEST_CAR={data.get('car')}
password=
"""
        cfg_dir = os.path.join(os.path.expanduser("~"), "Documents", "Assetto Corsa", "cfg")
        os.makedirs(cfg_dir, exist_ok=True)
        
        with open(os.path.join(cfg_dir, "race.ini"), "w") as f:
            f.write(race_ini)
            
        logger.info(f"Joining lobby at {data.get('server_ip')}:{data.get('port')}")
        
        # Kill existing
        subprocess.run(["taskkill", "/F", "/IM", "acs.exe"], capture_output=True)
        
        # Launch
        subprocess.Popen([acs_exe], cwd=ac_path)
        
        # Update watchdog
        watchdog.start_watching({"ac_path": ac_path}, duration_minutes=60) # Watch for 1h default
        
    except Exception as e:
        logger.error(f"Failed to join lobby: {e}")

def stop_lobby_server():
    try:
        subprocess.run(["taskkill", "/F", "/IM", "acServer.exe"], capture_output=True)
        logger.info("Stopped acServer.exe")
    except Exception as e:
        logger.error(f"Failed to stop lobby server: {e}")


if __name__ == "__main__":
    main()
