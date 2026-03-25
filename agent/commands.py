import os
import threading
import subprocess
import platform
import logging
import json
import requests
import re
from pathlib import Path
from typing import Optional, Tuple
from config import SERVER_URL, AGENT_TOKEN, LOBBY_ADMIN_PASSWORD, logger
from networking import get_agent_headers
from utils import launch_ac, get_system_info, wait_for_process_start
from watchdog import watchdog
from idle_display import start_idle_display

# Use a global stop event for session timer
session_stop_event = threading.Event()

SESSION_TYPE_CONFIG = {
    "practice": ("Practice", "PRACTICE"),
    "qualify": ("Qualifying", "QUALIFY"),
    "race": ("Race", "RACE"),
    "hotlap": ("Hotlap", "HOTLAP"),
    "drift": ("Drift", "DRIFT"),
}

WEATHER_PRESETS = {
    "sun": "3_clear",
    "clear": "3_clear",
    "windy": "5_light_clouds",
    "rain": "7_heavy_clouds",
    "rainy": "7_heavy_clouds",
    "storm": "8_thunderstorm",
    "fog": "6_mid_clear",
}

TIME_OF_DAY_SUN_ANGLE = {
    "dawn": 10,
    "morning": 25,
    "noon": 48,
    "afternoon": 70,
    "sunset": 90,
    "night": 120,
}


def _coerce_int(value, default: int, min_value: Optional[int] = None, max_value: Optional[int] = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if min_value is not None:
        parsed = max(min_value, parsed)
    if max_value is not None:
        parsed = min(max_value, parsed)
    return parsed


def _normalize_text(value, default: str) -> str:
    normalized = str(value or "").strip()
    return normalized or default


def _resolve_session_type(session_type: Optional[str]) -> Tuple[str, str]:
    normalized = _normalize_text(session_type, "practice").lower()
    return SESSION_TYPE_CONFIG.get(normalized, SESSION_TYPE_CONFIG["practice"])


def _resolve_weather_preset(weather: Optional[str]) -> str:
    normalized = _normalize_text(weather, "sun").lower()
    return WEATHER_PRESETS.get(normalized, normalized)


def _resolve_sun_angle(time_of_day: Optional[str]) -> int:
    normalized = _normalize_text(time_of_day, "noon").lower()
    return TIME_OF_DAY_SUN_ANGLE.get(normalized, TIME_OF_DAY_SUN_ANGLE["noon"])


def _upsert_ini_value(content: str, section: str, key: str, value: str) -> str:
    section_pattern = re.compile(
        rf"(?ims)^\[{re.escape(section)}\]\s*\n(.*?)(?=^\[|\Z)"
    )
    match = section_pattern.search(content)
    if match:
        body = match.group(1)
        key_pattern = re.compile(rf"(?im)^{re.escape(key)}=.*$")
        if key_pattern.search(body):
            body = key_pattern.sub(f"{key}={value}", body, count=1)
        else:
            if body and not body.endswith("\n"):
                body += "\n"
            body += f"{key}={value}\n"
        return content[:match.start(1)] + body + content[match.end(1):]

    if content and not content.endswith("\n"):
        content += "\n"
    return f"{content}\n[{section}]\n{key}={value}\n"


def set_weather_logic(weather_value: Optional[str]):
    try:
        preset = _resolve_weather_preset(weather_value)
        ac_docs_path = os.path.join(os.path.expanduser("~"), "Documents", "Assetto Corsa", "cfg")
        os.makedirs(ac_docs_path, exist_ok=True)
        race_ini_path = os.path.join(ac_docs_path, "race.ini")
        if os.path.exists(race_ini_path):
            with open(race_ini_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        else:
            content = ""
        content = _upsert_ini_value(content, "WEATHER", "NAME", preset)
        with open(race_ini_path, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info(f"Weather preset updated in race.ini: {preset}")
    except Exception as e:
        logger.error(f"Failed to apply weather preset: {e}")

def restart_agent_process():
    try:
        import sys
        logger.info("Restarting agent process")
        python = sys.executable
        args = [python] + sys.argv
        subprocess.Popen(args, cwd=os.getcwd())
    except Exception as e:
        logger.error(f"Failed to restart agent: {e}")
    finally:
        os._exit(0)

def install_mod_logic(data):
    """
    Downloads and installs a mod (Car/Track) from the Manager Backend.
    """
    try:
        mod_name = data.get("mod_name")
        mod_type = data.get("mod_type") # 'car' or 'track'
        download_path = data.get("download_url") # e.g. /static/mods/ferrari.zip
        file_name = data.get("file_name")
        ac_path = data.get("ac_path") or get_system_info().get("ac_path")
        
        # 1. Construct Full Download URL
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
        ac_content_dir = Path(ac_path) if ac_path else Path("ac_content_root")
        
        if "content" not in str(ac_content_dir).lower():
             target_base = ac_content_dir / "content" / ("cars" if mod_type == "car" else "tracks")
        else:
             target_base = ac_content_dir / ("cars" if mod_type == "car" else "tracks")
             
        os.makedirs(target_base, exist_ok=True)
        
        # 4. Extract
        import zipfile
        try:
            import patoolib
        except ImportError:
            patoolib = None
        
        logger.info(f"Extracting to {target_base}...")
        
        try:
            if file_name.lower().endswith(".zip"):
                with zipfile.ZipFile(local_zip_path, 'r') as zip_ref:
                    # Validate all entries before extraction (path traversal prevention)
                    for member in zip_ref.infolist():
                        member_path = (Path(target_base) / member.filename).resolve()
                        try:
                            member_path.relative_to(Path(target_base).resolve())
                        except ValueError:
                            logger.error(f"Path traversal detected in zip: {member.filename}")
                            raise ValueError(f"Unsafe path in archive: {member.filename}")
                    zip_ref.extractall(target_base)
            elif patoolib:
                patoolib.extract_archive(local_zip_path, outdir=str(target_base))
            else:
                 logger.error("Cannot extract non-zip file without patoolib")
                 return
                
            logger.info(f"Mod '{mod_name}' installed successfully!")
            
            # Cleanup
            try:
                os.remove(local_zip_path)
            except OSError as e:
                logger.warning(f"Could not remove temp file {local_zip_path}: {e}")
            
        except Exception as e:
            logger.error(f"Extraction failed: {e}")

    except Exception as e:
        logger.error(f"Install Mod failed: {e}")

def create_lobby_server(data):
    """
    Configures and starts acServer.exe for a multiplayer lobby.
    """
    try:
        ac_path = (
            data.get("ac_path")
            or (watchdog.active_session or {}).get("ac_path")
            or get_system_info().get("ac_path")
            or os.environ.get("AC_PATH", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa")
        )
        server_dir = os.path.join(ac_path, "server")
        cfg_dir = os.path.join(server_dir, "cfg")
        
        if not os.path.exists(server_dir):
            logger.error("acServer.exe not found (server folder missing)")
            return False

        # Ensure cfg directory exists
        os.makedirs(cfg_dir, exist_ok=True)
        
        # Build track path with optional layout (e.g., "monza/without_chiptune")
        track_base = data.get('track', '')
        track_layout = data.get('track_layout')
        track_full = f"{track_base}/{track_layout}" if track_layout else track_base
        
        # 1. Generate server_cfg.ini
        admin_password = LOBBY_ADMIN_PASSWORD or ""
        server_cfg = f"""[SERVER]
NAME=AC Manager Lobby {data.get('lobby_id')}
CARS={data.get('car')};
TRACK={track_full}
SUN_ANGLE=48
MAX_CLIENTS={data.get('max_players')}
UDP_PORT={data.get('port')}
TCP_PORT={data.get('port')}
HTTP_PORT={_coerce_int(data.get('port'), 8080) + 1}
REGISTER_TO_LOBBY=0
LOOP_MODE=1
PASSWORD=
ADMIN_PASSWORD={admin_password}
PICKUP_MODE_ENABLED=1
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
LAPS={data.get('laps')}
WAIT_TIME=60
IS_OPEN=1
"""
        with open(os.path.join(cfg_dir, "server_cfg.ini"), "w") as f:
            f.write(server_cfg)
            
        # 2. Generate entry_list.ini
        players = data.get("players") or []
        entry_list_template = "[CAR_0]\nMODEL={model}\nSKIN=\nSPECTATOR_MODE=0\nDRIVERNAME={driver_name}\nTEAM=\nGUID=\nBALLAST=0\nRESTRICTOR=0\n\n"
        # Generate N entries
        full_entry_list = ""
        for i in range(data.get('max_players')):
            player = players[i] if i < len(players) else {}
            full_entry_list += entry_list_template.format(
                model=data.get("car"),
                driver_name=str(player.get("name") or "").strip(),
            ).replace("CAR_0", f"CAR_{i}")

        with open(os.path.join(cfg_dir, "entry_list.ini"), "w", encoding="utf-8") as f:
            f.write(full_entry_list)
            
        # 3. Start acServer.exe
        exe_path = os.path.join(server_dir, "acServer.exe")
        if os.path.exists(exe_path):
            logger.info("Starting acServer.exe...")
            # Kill existing
            subprocess.run(["taskkill", "/F", "/IM", "acServer.exe"], capture_output=True)
            # Start new
            subprocess.Popen([exe_path], cwd=server_dir)
            if wait_for_process_start(("acServer.exe",), timeout_seconds=12):
                return True
            logger.error("acServer.exe did not start within expected time")
            return False
        else:
            logger.error("acServer.exe executable not found")
            return False

    except Exception as e:
        logger.error(f"Failed to create lobby server: {e}")
        return False

def join_lobby_client(data):
    """
    Launches AC client to join a specific lobby server.
    """
    try:
        ac_path = data.get("ac_path") or os.environ.get("AC_PATH", "")
        if not ac_path:
             logger.error("No AC Path for joining lobby")
             return False
        
        logger.info(f"Joining lobby {data.get('lobby_id')} at {data.get('server_ip')}:{data.get('port')}")
        
        # Kill running instances
        subprocess.run(["taskkill", "/F", "/IM", "acs.exe"], capture_output=True)
        
        ac_docs_path = os.path.join(os.path.expanduser("~"), "Documents", "Assetto Corsa", "cfg")
        os.makedirs(ac_docs_path, exist_ok=True)
        race_ini_path = os.path.join(ac_docs_path, "race.ini")
        
        is_spectator = data.get("is_spectator", False)
        driver_name = _normalize_text(data.get("driver_name"), "Guest").replace("\n", " ").replace("\r", " ")
        
        race_ini = f"""[RACE]
MODEL={data.get('car')}
MODEL_CONFIG=
SKIN=
TRACK={data.get('track')}
CONFIG_TRACK=
CARS=1
AI_LEVEL=90
FIXED_SETUP=0
PENALTIES=0

[REMOTE]
ACTIVE=1
SERVER_IP={data.get('server_ip')}
SERVER_PORT={data.get('port')}
NAME={driver_name if not is_spectator else "TV Broadcast"}
TEAM=
GUID=
REQUESTED_CAR={data.get('car')}
PASSWORD=
"""
        with open(race_ini_path, "w", encoding="utf-8") as f:
            f.write(race_ini)
            
        # Launch
        if launch_ac(ac_path):
             # Start watchdog
             watchdog.start({"ac_path": ac_path})
             return True
        else:
             start_idle_display()
             return False
             
    except Exception as e:
        logger.error(f"Failed to join lobby: {e}")
        start_idle_display()
        return False

def stop_lobby_server():
    try:
        watchdog.stop()
        subprocess.run(["taskkill", "/F", "/IM", "acs.exe"], capture_output=True)
        subprocess.run(["taskkill", "/F", "/IM", "acServer.exe"], capture_output=True)
        start_idle_display()
        logger.info("Stopped multiplayer lobby processes")
    except Exception as e:
        logger.error(f"Failed to stop lobby: {e}")

def launch_session_logic(data, station_id):
    car = _normalize_text(data.get("car"), "")
    track = _normalize_text(data.get("track"), "")
    if not car or not track:
        logger.error("LAUNCH_SESSION rejected: missing car or track")
        return False

    assists = data.get("assists", {}) or {}
    driver_name = _normalize_text(data.get("driver_name"), "Guest").replace("\n", " ").replace("\r", " ")
    ac_path = _normalize_text(data.get("ac_path"), "") or get_system_info().get("ac_path")
    duration_minutes = _coerce_int(data.get("duration_minutes"), 15, min_value=1, max_value=300)
    ai_count = _coerce_int(data.get("ai_count"), 0, min_value=0, max_value=23)
    transmission = _normalize_text(data.get("transmission"), "automatic").lower()
    time_of_day = _normalize_text(data.get("time_of_day"), "noon").lower()
    weather = _normalize_text(data.get("weather"), "sun").lower()
    tyre_compound = _normalize_text(data.get("tyre_compound"), "semislicks")
    session_name, session_type = _resolve_session_type(data.get("session_type"))

    weather_preset = _resolve_weather_preset(weather)
    sun_angle = _resolve_sun_angle(time_of_day)

    logger.info(
        "Received LAUNCH_SESSION command: %s -> %s @ %s (%smin, type=%s, ai=%s, weather=%s, time=%s, tx=%s)",
        driver_name,
        car,
        track,
        duration_minutes,
        session_type,
        ai_count,
        weather_preset,
        time_of_day,
        transmission,
    )

    # 1. Kill any running game instance first
    if platform.system() == "Windows":
        subprocess.run(["taskkill", "/F", "/IM", "acs.exe"], capture_output=True)
    else:
        subprocess.run(["pkill", "-9", "acs"], capture_output=True)

    # Find AC Documents folder
    ac_docs_path = os.path.join(os.path.expanduser("~"), "Documents", "Assetto Corsa", "cfg")
    os.makedirs(ac_docs_path, exist_ok=True)

    # 1.5 Update player.ini
    player_ini_path = os.path.join(ac_docs_path, "player.ini")
    try:
        if os.path.exists(player_ini_path):
            with open(player_ini_path, "r", encoding="utf-8", errors="ignore") as f:
                player_content = f.read()
            player_content = re.sub(r"^NAME=.*$", f"NAME={driver_name}", player_content, flags=re.MULTILINE)
            player_content = re.sub(r"^NICKNAME=.*$", f"NICKNAME={driver_name}", player_content, flags=re.MULTILINE)
        else:
            player_content = f"NAME={driver_name}\nNICKNAME={driver_name}\n"
        with open(player_ini_path, "w", encoding="utf-8") as f:
            f.write(player_content)
    except Exception as e:
        logger.error(f"Failed to update player.ini: {e}")

    # 1.6 Fetch settings
    sim_settings = {}
    try:
        resp = requests.get(f"{SERVER_URL}/settings/", headers=get_agent_headers(), timeout=5)
        if resp.status_code == 200:
            settings_list = resp.json()
            sim_settings = {s["key"]: s["value"] for s in settings_list if s["key"].startswith("sim_")}
    except Exception:
        pass

    def get_sim(key, default):
        val = sim_settings.get(f"sim_{key}")
        if val is None:
            return default
        if isinstance(val, str):
            lowered = val.lower()
            if lowered == "true":
                return 1
            if lowered == "false":
                return 0
        return val

    ai_level = _coerce_int(get_sim("ai_level", 90), 90, min_value=0, max_value=100)
    compound = tyre_compound if tyre_compound else _normalize_text(get_sim("tyre_compound", "semislicks"), "semislicks")

    # 2. Write assist.ini
    assist_ini_path = os.path.join(ac_docs_path, "assist.ini")
    try:
        abs_value = assists.get("abs", 1)
        tc_value = assists.get("tc", 1)
        stability_value = assists.get("stability_aid", 0)
        auto_shift_value = assists.get("auto_shifter", 0)
        auto_clutch_value = 1

        if transmission == "automatic":
            auto_shift_value = 1
            auto_clutch_value = 1
        elif transmission == "manual":
            auto_shift_value = 0
            auto_clutch_value = 0

        assist_content = f"""[ASSISTS]
ABS={abs_value}
AUTOCLUTCH={auto_clutch_value}
AUTOSHIFT={auto_shift_value}
STABILITY_CONTROL={stability_value}
TRACTION_CONTROL={tc_value}
"""
        with open(assist_ini_path, "w", encoding="utf-8") as f:
            f.write(assist_content)

        global session_stop_event
        session_stop_event.set()
        session_stop_event = threading.Event()
    except Exception as e:
        logger.error(f"Failed to update assist.ini: {e}")

    # 3. Write race.ini
    race_ini_path = os.path.join(ac_docs_path, "race.ini")
    try:
        # Support multi-layout tracks: id may be "track_folder/layout_name"
        track_parts = track.split('/', 1)
        track_name = track_parts[0]
        config_track = track_parts[1] if len(track_parts) > 1 else ''

        race_content = f"""[RACE]
MODEL={car}
MODEL_CONFIG=
SKIN=
TRACK={track_name}
CONFIG_TRACK={config_track}
CARS={1 + ai_count}
AI_LEVEL={ai_level}
FIXED_SETUP=0
PENALTIES=0

[CAR_0]
MODEL={car}
DRIVER_NAME={driver_name}
COMPOUND={compound}

[SESSION_0]
NAME={session_name}
TIME={duration_minutes}
TYPE={session_type}

[LIGHTING]
SUN_ANGLE={sun_angle}
TIME_MULT=1

[WEATHER]
NAME={weather_preset}
"""
        with open(race_ini_path, "w", encoding="utf-8") as f:
            f.write(race_content)
    except Exception as e:
        logger.error(f"Failed to write race.ini: {e}")
        return False

    # 4. Launch
    if launch_ac(ac_path):
        watchdog.start({"ac_path": ac_path, "car": car, "track": track})
        return True
    else:
        start_idle_display()
        return False
