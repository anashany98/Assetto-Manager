import platform
import subprocess
import os
import time
import socket
import uuid
from pathlib import Path
from config import (
    AC_CONTENT_DIR, AC_PATH, STATION_NAME, STEAM_EXE, 
    STEAM_APP_ID, LAUNCH_VIA_STEAM, logger
)

def _is_process_running(process_name: str) -> bool:
    try:
        if platform.system() == "Windows":
            result = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {process_name}"],
                capture_output=True, text=True
            )
            return process_name.lower() in result.stdout.lower()
        result = subprocess.run(["pgrep", "-x", process_name], capture_output=True)
        return result.returncode == 0
    except Exception:
        return False

def _ensure_steam_running() -> bool:
    if platform.system() != "Windows":
        return True
    if _is_process_running("steam.exe"):
        return True
    try:
        if STEAM_EXE and os.path.exists(STEAM_EXE):
            subprocess.Popen([STEAM_EXE], cwd=os.path.dirname(STEAM_EXE) or None)
        else:
            os.startfile("steam://open/main")
    except Exception as e:
        logger.warning(f"Could not start Steam: {e}")
        return False

    for _ in range(20):
        time.sleep(1)
        if _is_process_running("steam.exe"):
            return True
    return False

def launch_ac(ac_path: str) -> bool:
    if not ac_path:
        logger.warning("No ac_path configured for this station. Cannot launch.")
        return False

    if platform.system() == "Windows":
        if not _ensure_steam_running():
            logger.warning("Steam is not running. Launch may fail.")
        if LAUNCH_VIA_STEAM:
            try:
                if STEAM_EXE and os.path.exists(STEAM_EXE):
                    subprocess.Popen(
                        [STEAM_EXE, "-applaunch", STEAM_APP_ID],
                        cwd=os.path.dirname(STEAM_EXE) or None
                    )
                else:
                    os.startfile(f"steam://rungameid/{STEAM_APP_ID}")
                return True
            except Exception as e:
                logger.error(f"Failed to launch via Steam: {e}")

    acs_exe = os.path.join(ac_path, "acs.exe")
    if os.path.exists(acs_exe):
        try:
            subprocess.Popen([acs_exe], cwd=ac_path)
            return True
        except Exception as e:
            logger.error(f"Failed to launch AC: {e}")
            return False
    logger.error(f"acs.exe not found at: {acs_exe}")
    return False

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
    ac_path = AC_PATH
    if not ac_path and AC_CONTENT_DIR:
        try:
            if AC_CONTENT_DIR.name.lower() == "content":
                ac_path = str(AC_CONTENT_DIR.parent)
        except Exception:
            ac_path = AC_PATH
    return {
        "name": STATION_NAME or socket.gethostname(),
        "hostname": socket.gethostname(),
        "mac_address": get_mac_address(),
        "ip_address": get_ip_address(),
        "ac_path": ac_path or None,
    }

def ensure_directories():
    AC_CONTENT_DIR.mkdir(parents=True, exist_ok=True)
