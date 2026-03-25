import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone

# --- LOGGING INIT ---
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

# --- CONFIG VARIABLES ---
AGENT_VERSION = "1.0.0"
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8000")
AC_CONTENT_DIR = Path(os.getenv("AC_CONTENT_DIR", "ac_content_root"))
AC_PATH = os.getenv("AC_PATH", "")
STATION_NAME = os.getenv("STATION_NAME", "")
MAC_ADDRESS = os.getenv("MAC_ADDRESS", "")
AGENT_TOKEN = os.getenv("AGENT_TOKEN", "")
STEAM_EXE = os.getenv("STEAM_EXE", "")
STEAM_APP_ID = os.getenv("STEAM_APP_ID", "244210")
LAUNCH_VIA_STEAM = os.getenv("AC_LAUNCH_VIA_STEAM", "false").lower() in {"1", "true", "yes"}
LOBBY_ADMIN_PASSWORD = os.getenv("LOBBY_ADMIN_PASSWORD", "")
UPDATE_SIGNING_KEY = os.getenv("UPDATE_SIGNING_KEY", "")
OBS_HOST = os.getenv("OBS_HOST", "localhost")
try:
    OBS_PORT = int(os.getenv("OBS_PORT", "4455"))
except ValueError:
    OBS_PORT = 4455
OBS_PASSWORD = os.getenv("OBS_PASSWORD", "")
STREAM_URL = os.getenv("STREAM_URL", "")
IDLE_DISPLAY_ENABLED = os.getenv("IDLE_DISPLAY_ENABLED", "true").lower() in {"1", "true", "yes"}
IDLE_DISPLAY_URL = os.getenv("IDLE_DISPLAY_URL", "")
IDLE_DISPLAY_BROWSER_PATH = os.getenv("IDLE_DISPLAY_BROWSER_PATH", "")
IDLE_DISPLAY_BROWSER_ARGS = os.getenv("IDLE_DISPLAY_BROWSER_ARGS", "")

def _is_truthy(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in {"1", "true", "yes", "on"}

# Load config.json
config_paths = []
env_config_path = os.getenv("AGENT_CONFIG_PATH")
if env_config_path:
    config_paths.append(Path(env_config_path))
config_paths.extend([
    Path(__file__).resolve().parent / "config.json",
    Path.cwd() / "config.json",
])

for config_path in config_paths:
    if not config_path.exists():
        continue
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
            SERVER_URL = config.get("server_url", SERVER_URL)
            if config.get("ac_content_dir"):
                AC_CONTENT_DIR = Path(config["ac_content_dir"])
            if config.get("ac_path"):
                AC_PATH = config.get("ac_path", AC_PATH)
            if config.get("station_name"):
                STATION_NAME = config.get("station_name", STATION_NAME)
            if config.get("mac_address"):
                MAC_ADDRESS = config.get("mac_address", MAC_ADDRESS)
            if config.get("agent_token"):
                AGENT_TOKEN = config.get("agent_token", AGENT_TOKEN)
            if config.get("steam_exe"):
                STEAM_EXE = config.get("steam_exe", STEAM_EXE)
            if config.get("steam_app_id"):
                STEAM_APP_ID = str(config.get("steam_app_id"))
            if "launch_via_steam" in config:
                LAUNCH_VIA_STEAM = _is_truthy(config.get("launch_via_steam"))
            if config.get("lobby_admin_password"):
                LOBBY_ADMIN_PASSWORD = config.get("lobby_admin_password", LOBBY_ADMIN_PASSWORD)
            if config.get("update_signing_key"):
                UPDATE_SIGNING_KEY = config.get("update_signing_key", UPDATE_SIGNING_KEY)
            if config.get("obs_host"):
                OBS_HOST = config.get("obs_host", OBS_HOST)
            if "obs_port" in config and config.get("obs_port") is not None:
                try:
                    OBS_PORT = int(config.get("obs_port"))
                except (TypeError, ValueError):
                    OBS_PORT = OBS_PORT
            if "obs_password" in config:
                OBS_PASSWORD = str(config.get("obs_password") or "")
            if "stream_url" in config:
                STREAM_URL = str(config.get("stream_url") or "")
            if "idle_display_enabled" in config:
                IDLE_DISPLAY_ENABLED = _is_truthy(config.get("idle_display_enabled"))
            if "idle_display_url" in config:
                IDLE_DISPLAY_URL = str(config.get("idle_display_url") or "")
            if "idle_display_browser_path" in config:
                IDLE_DISPLAY_BROWSER_PATH = str(config.get("idle_display_browser_path") or "")
            if "idle_display_browser_args" in config:
                raw_args = config.get("idle_display_browser_args")
                if isinstance(raw_args, list):
                    IDLE_DISPLAY_BROWSER_ARGS = " ".join(str(a) for a in raw_args if str(a).strip())
                else:
                    IDLE_DISPLAY_BROWSER_ARGS = str(raw_args or "")
            logger.info(f"Loaded config from {config_path}. Server URL: {SERVER_URL}")
        break
    except Exception as e:
        logger.error(f"Failed to load config file {config_path}: {e}")
        continue

# Ensure variables are available to child modules that read env vars
if AGENT_TOKEN:
    os.environ["AGENT_TOKEN"] = AGENT_TOKEN
if MAC_ADDRESS:
    os.environ["MAC_ADDRESS"] = MAC_ADDRESS
if STATION_NAME:
    os.environ["STATION_NAME"] = STATION_NAME

# Global Timeout for stability
REQUEST_TIMEOUT = 10
