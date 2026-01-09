import os
import json
import logging
import requests
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("AC-Agent.Telemetry")

def find_race_out_file():
    """
    Locate race_out.json in standard Assetto Corsa documents folder.
    """
    # Standard path: Documents/Assetto Corsa/out/race_out.json
    # We will use a mock path for this local agent if not found
    
    docs_path = Path.home() / "Documents" / "Assetto Corsa" / "out"
    game_file = docs_path / "race_out.json"
    
    if game_file.exists():
        return game_file
        
    # Fallback to local 'mock' file for development/testing
    # Look in the same directory as this script (agent/)
    mock_file = Path(__file__).parent / "mock_race_out.json"
    if mock_file.exists():
        return mock_file
        
    return None

def parse_and_send_telemetry(file_path, server_url, station_id):
    """
    Read race_out.json, parse it, and send to server if it's new.
    """
    try:
        # 1. Read File
        # Use 'utf-8-sig' to handle potential BOM from game files
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
            
        # 2. Extract Session Info
        # Mapping AC JSON fields to our Schema
        # Note: AC JSON structure varies, this is a best-effort standard mapping
        
        # Example AC Structure (simplified):
        # {
        #   "track": "monza",
        #   "car": "ferrari_488_gt3",
        #   "players": [
        #       { "name": "Player", "bestLap": 105000, "laps": [ { "time": 105000, "sectors": [30000, 40000, 35000], "isValid": true } ] }
        #   ],
        #   "sessionType": "Q"
        # }
        
        # We assume single player for the bar station
        player = data.get("players", [{}])[0]
        
        payload = {
            "station_id": station_id,
            "track_name": data.get("track", "unknown"),
            "track_config": data.get("track_config", None),
            "car_model": data.get("car", player.get("car", "unknown")),
            "driver_name": player.get("name", "Unknown Driver"),
            "session_type": data.get("sessionType", "P"), # P, Q, R
            "date": datetime.now().isoformat(), # Use current upload time as session time
            "best_lap": player.get("bestLap", 0),
            "laps": []
        }
        
        for lap in player.get("laps", []):
            payload["laps"].append({
                "driver_name": payload["driver_name"],
                "car_model": payload["car_model"],
                "track_name": payload["track_name"],
                "lap_time": lap.get("time", 0),
                "sectors": lap.get("sectors", []),
                "is_valid": lap.get("isValid", True), # Assume valid if missing
                "timestamp": datetime.now().isoformat() # Approx
            })
            
        # 3. Send to Server
        logger.info(f"Uploading session for {payload['driver_name']} at {payload['track_name']}...")
        response = requests.post(f"{server_url}/telemetry/session", json=payload, timeout=10)
        response.raise_for_status()
        logger.info("Telemetry upload successful!")
        
        return True

    except Exception as e:
        logger.error(f"Failed to process telemetry: {e}")
        return False

# Function to check for updates
_last_mtime = 0

def check_for_new_results(server_url, station_id):
    global _last_mtime
    
    file_path = find_race_out_file()
    if not file_path:
        return
        
    try:
        mtime = os.path.getmtime(file_path)
        if mtime > _last_mtime:
            # File has changed/is new
            logger.info("New race result detected!")
            
            # small delay to ensure write complete
            import time
            time.sleep(1) 
            
            if parse_and_send_telemetry(file_path, server_url, station_id):
                _last_mtime = mtime
                
    except Exception as e:
        logger.error(f"Error checking file results: {e}")
