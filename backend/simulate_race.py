import asyncio
import json
import random
import time
import requests
import websockets
import math
from datetime import datetime

# CONFIGURATION
SERVER_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws/telemetry/agent"
STATION_NAME = f"Simulador Virtual ({random.randint(100,999)})"

def register():
    """Register the simulator with the backend"""
    print(f"Registering {STATION_NAME}...")
    try:
        resp = requests.post(f"{SERVER_URL}/stations/", json={
            "name": STATION_NAME,
            "hostname": f"virtual-pc-{random.randint(1000,9999)}",
            "ip_address": "127.0.0.1",
            "mac_address": f"00:00:00:00:00:{random.randint(10,99)}"
        })
        resp.raise_for_status()
        data = resp.json()
        print(f" -> Success! ID: {data['id']}")
        return data['id']
    except Exception as e:
        print(f"FAILED to register: {e}")
        return None

def generate_telemetry_point(t):
    """Generate fake physics data based on time t"""
    return {
        "speed_kmh": 100 + (50 * math.sin(t)),
        "rpm": 5000 + (2000 * math.sin(t)),
        "gear": 4,
        "normalized_pos": (t % 10) / 10.0,
        "gas": 1.0,
        "brake": 0.0,
        "steer": 0.0,
        "lap_time_ms": int((t % 10) * 1000),
        "laps": int(t / 10)
    }

async def run_simulation(station_id):
    """Main loop: streams WS data and uploads laps"""
    print("Connecting to WebSocket...")
    
    async with websockets.connect(WS_URL) as ws:
        # Handshake
        await ws.send(json.dumps({
            "type": "identify",
            "station_id": station_id,
            "role": "agent"
        }))
        print(" -> WebSocket Connected! Streaming live data...")

        start_time = time.time()
        lap_count = 0
        
        # Buffer for the "current lap" to upload later
        current_lap_telemetry = []

        while True:
            now = time.time()
            elapsed = now - start_time
            
            # 1. Generate Fake Data
            # Simple physics simulation
            speed = 100 + (50 * math.sin(elapsed * 0.5))
            rpm = 5000 + (2000 * math.sin(elapsed * 0.5))
            
            # Fake a lap every 480 seconds (8 mins for Nordschleife)
            current_lap_num = int(elapsed / 480)
            lap_progress = (elapsed % 480) / 480.0
            
            data = {
                "type": "telemetry",
                "station_id": station_id,
                "speed_kmh": speed,
                "rpm": rpm,
                "gear": 4,
                "normalized_pos": lap_progress,
                "lap_time_ms": int((elapsed % 480) * 1000),
                "laps": current_lap_num,
                "status": "In Pit" if lap_progress > 0.98 else "Racing",
                "car": "Porsche 911 GT3 R",
                "driver": f"Driver {station_id}",
                "track": "Nürburgring Nordschleife",
                "gas": max(0, math.sin(elapsed * 0.5)),
                "brake": max(0, -math.sin(elapsed * 0.5)),
                "clutch": 0,
                "steer": math.sin(elapsed),
                "g_lat": math.cos(elapsed * 2) * 2,
                "g_lon": math.sin(elapsed * 2) * 2,
                "tyre_temp": [80 + math.sin(elapsed) * 10] * 4,
                "tyre_press": [30.5] * 4,
                "brake_temp": [200 + math.sin(elapsed) * 100] * 4,
                "engine_temp": 90 + math.sin(elapsed * 0.1) * 5,
                "fuel": 40 - (elapsed * 0.01),
                "max_fuel": 100,
                "damage": [0, 0, 0, 0, 0],
                "abs": False,
                "tc": True,
                "drs_avail": True,
                "drs_on": False,
                "x": 150 * math.cos(lap_progress * math.pi * 2),
                "y": 0,
                "z": 80 * math.sin(lap_progress * math.pi * 2)
            }
            # Add a bit of "D-shape" flat straights
            if abs(data["x"]) < 100:
                data["z"] = 80 if math.sin(lap_progress * math.pi * 2) > 0 else -80

            # 2. Send via WebSocket (updates UI Gauge)
            await ws.send(json.dumps(data))

            # 3. Store for "trace"
            current_lap_telemetry.append({
                "t": int((elapsed % 15) * 1000),
                "s": speed,
                "r": rpm,
                "g": 4, 
                "n": lap_progress,
                "gas": data["gas"],
                "brk": data["brake"],
                "clutch": data["clutch"],
                "str": data["steer"],
                "gl": data["g_lat"],
                "gn": data["g_lon"],
                "tt": data["tyre_temp"],
                "tp": data["tyre_press"],
                "bt": data["brake_temp"],
                "et": data["engine_temp"],
                "f": data["fuel"],
                "dmg": data["damage"],
                "abs": data["abs"],
                "tc": data["tc"],
                "drs": data["drs_on"],
                "x": data["x"],
                "z": data["z"]
            })
            
            # --- HEARTBEAT (New) ---
            # Send heartbeat every ~5 seconds (50 iterations at 0.1s)
            if int(elapsed * 10) % 50 == 0:
                try:
                    requests.put(f"{SERVER_URL}/stations/{station_id}", json={
                        "is_active": True,
                        "status": "online"
                    }, timeout=1)
                    # print("    [Heartbeat] Sent.")
                except:
                    pass

            # 4. Handle Lap Finish (Upload Result)
            if current_lap_num > lap_count:
                print(f" -> LAP {current_lap_num} FINISHED! Uploading result...")
                
                # Mock a random lap time between 1:40 and 1:45
                lap_time_ms = 100000 + random.randint(0, 5000)
                
                # Randomize context for variety
                tracks = ["monza", "spa", "imola", "nurburgring", "silverstone"]
                cars = ["ferrari_sf24", "redbull_rb20", "mclaren_mcl38", "porsche_911_gt3"]
                drivers = ["Verstappen", "Hamilton", "Leclerc", "Norris", "Alonso", "Sainz", "Perez", "Piastri"]
                
                selected_track = random.choice(tracks)
                selected_car = random.choice(cars)
                selected_driver = random.choice(drivers)
                
                # Payload matching /telemetry/session
                payload = {
                    "station_id": station_id,
                    "track_name": selected_track,
                    "car_model": selected_car,
                    "driver_name": selected_driver,
                    "session_type": "qualify",
                    "date": datetime.now().isoformat(),
                    "best_lap": lap_time_ms,
                    "laps": [
                        {
                            "driver_name": selected_driver,
                            "car_model": selected_car,
                            "track_name": selected_track,
                            "lap_time": lap_time_ms,
                            "sectors": [30000, 30000, 40000],
                            "is_valid": True,
                            "timestamp": datetime.now().isoformat(),
                            "telemetry_data": current_lap_telemetry
                        }
                    ]
                }
                
                try:
                    r = requests.post(f"{SERVER_URL}/telemetry/session", json=payload)
                    if r.status_code in [200, 201]:
                        print("    [Upload OK] Leaderboard updated.")
                    else:
                        print(f"    [Upload FAIL] {r.status_code} {r.text}")
                except Exception as ex:
                    print(f"    [Error] {ex}")

                # Reset for next lap
                lap_count = current_lap_num
                current_lap_telemetry = []

            await asyncio.sleep(0.1) # 10Hz

import math

if __name__ == "__main__":
    sid = register()
    if sid:
        try:
            asyncio.run(run_simulation(sid))
        except KeyboardInterrupt:
            print("\nSimulation stopped.")
