
import asyncio
import websockets
import json
import requests
import time
import sys
import logging
from datetime import datetime, timezone

# Helper to print colored status
def print_status(component, status, message):
    if status == "OK":
        print(f"\033[92m[{component}] OK: {message}\033[0m")
    else:
        print(f"\033[91m[{component}] FAIL: {message}\033[0m")


# Global station ID
STATION_ID = None

def register_station():
    global STATION_ID
    url = "http://localhost:8000/stations/"
    payload = {
        "name": "VERIFY_TEST_STATION",
        "ip_address": "127.0.0.1",
        "mac_address": "00:00:00:00:00:00",
        "hostname": "verify_host"
    }
    
    # Try to find existing first to avoid unique constraint if run multiple times
    # Actually, main.py uses MAC to find existing? Check backend.
    # We will just try to register. Backend typically handles "get or create" or we handle 400.
    
    print(f"Registering Station at {url}...")
    try:
        resp = requests.post(url, json=payload)
        if resp.status_code in [200, 201]:
            data = resp.json()
            STATION_ID = data['id']
            print_status("Registration", "OK", f"Registered Station ID: {STATION_ID}")
            return True
        elif resp.status_code == 400 and "already exists" in resp.text:
             # Try to fetch it? Or likely it returns the obj on 400? No.
             # Let's assume we can get it or fail.
             print_status("Registration", "FAIL", f"Station already exists but we can't retrieve ID easily here without extra logic. {resp.text}")
             return False
        else:
            print_status("Registration", "FAIL", f"Failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print_status("Registration", "FAIL", f"Error: {e}")
        return False

async def verify_websocket():
    if not STATION_ID:
        print("Skipping WS test (No Station ID)")
        return False
        
    uri = "ws://localhost:8000/ws/telemetry/agent"
    print(f"Testing WS Connection to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            # 1. Identify
            await websocket.send(json.dumps({
                "type": "identify",
                "station_id": STATION_ID,
                "role": "agent"
            }))
            
            # 2. Send Telemetry
            val = 250
            data = {
                "type": "telemetry",
                "station_id": STATION_ID,
                "speed_kmh": val,
                "rpm": 10000,
                "gear": 6,
                "lap_time_ms": 12345,
                "laps": 1,
                "pos": 1,
                "normalized_pos": 0.5
            }
            await websocket.send(json.dumps(data))
            print_status("WebSocket", "OK", "Connected and sent telemetry packet")
            
            # 3. Wait a bit
            await asyncio.sleep(1)
            return True
    except Exception as e:
        print_status("WebSocket", "FAIL", f"Connection error: {e}")
        return False

def verify_data_extraction():
    if not STATION_ID:
        print("Skipping HTTP test (No Station ID)")
        return False
        
    url = "http://localhost:8000/telemetry/session"
    print(f"Testing HTTP Upload to {url}...")
    
    # 1. Create unique driver to verify persistence
    driver_name = f"TestDriver_{int(time.time())}"
    
    payload = {
        "station_id": STATION_ID,
        "track_name": "monza_test",
        "car_model": "test_car",
        "driver_name": driver_name,
        "session_type": "practice",
        "date": datetime.now(timezone.utc).isoformat(),
        "best_lap": 90000,
        "laps": [
            {
                "driver_name": driver_name,
                "car_model": "test_car",
                "track_name": "monza_test",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "lap_time": 90000,
                "sectors": [30000, 30000, 30000],
                "is_valid": True,
                "telemetry_data": [{"t": 0, "s": 100}, {"t": 100, "s": 105}]
            }
        ]
    }
    
    try:
        # 1. Upload
        resp = requests.post(url, json=payload)
        if resp.status_code in [200, 201]:
             print_status("Data Extraction", "OK", "Session upload successful (HTTP 200/201)")
        else:
             print_status("Data Extraction", "FAIL", f"Upload failed: {resp.status_code} {resp.text}")
             return False

        # 2. Verify Persistence (Leaderboard)
        time.sleep(1) # Give DB a moment
        lb_url = f"http://localhost:8000/telemetry/leaderboard?track_name=monza_test&limit=1"
        resp = requests.get(lb_url)
        data = resp.json()
        
        found = False
        if isinstance(data, list):
            for entry in data:
                if entry['driver_name'] == driver_name:
                    found = True
                    break
        
        if found:
            print_status("Persistence", "OK", f"Found record for {driver_name} in leaderboard")
            return True
        else:
            print_status("Persistence", "FAIL", f"Record for {driver_name} NOT found in leaderboard")
            return False

    except Exception as e:
        print_status("Data Extraction", "FAIL", f"Error: {e}")
        return False

async def main():
    print("=== STARTING CONNECTION VERIFICATION ===\n")
    
    if not register_station():
        print("Aborting due to registration failure.")
        return

    ws_ok = await verify_websocket()
    print("-" * 30)
    http_ok = verify_data_extraction()
    
    print("\n=== VERIFICATION SUMMARY ===")
    if ws_ok and http_ok:
        print("\033[92mALL CHECKS PASSED. Connection and Data Extraction are CORRECT.\033[0m")
    else:
        print("\033[91mSOME CHECKS FAILED. Please review logs.\033[0m")

if __name__ == "__main__":
    asyncio.run(main())
