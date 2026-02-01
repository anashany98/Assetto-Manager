import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone

# --- LOGGING INIT ---
# We initialize logger here so it's available globally with consistent formatting

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
AGENT_TOKEN = os.getenv("AGENT_TOKEN", "")
STEAM_EXE = os.getenv("STEAM_EXE", "")
STEAM_APP_ID = os.getenv("STEAM_APP_ID", "244210")
LAUNCH_VIA_STEAM = os.getenv("AC_LAUNCH_VIA_STEAM", "false").lower() in {"1", "true", "yes"}

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
            if config.get("agent_token"):
                AGENT_TOKEN = config.get("agent_token", AGENT_TOKEN)
            if config.get("steam_exe"):
                STEAM_EXE = config.get("steam_exe", STEAM_EXE)
            if config.get("steam_app_id"):
                STEAM_APP_ID = str(config.get("steam_app_id"))
            if "launch_via_steam" in config:
                LAUNCH_VIA_STEAM = _is_truthy(config.get("launch_via_steam"))
            logger.info(f"Loaded config from {config_path}. Server URL: {SERVER_URL}")
        break
    except Exception as e:
        logger.error(f"Failed to load config file {config_path}: {e}")
        break

# Ensure token is available to child modules that read env vars
if AGENT_TOKEN:
    os.environ["AGENT_TOKEN"] = AGENT_TOKEN

# Global Timeout for stability
REQUEST_TIMEOUT = 10
