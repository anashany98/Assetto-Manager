
import asyncio
import websockets
import json
import random
import math
import time

# Simulation Parameters
TRACK_RADIUS_X = 300
TRACK_RADIUS_Z = 150
DRIVERS = [
    {"name": "Max Verstappen", "station_id": "ST_01", "color": "Blue", "speed": 1.2},
    {"name": "Lewis Hamilton", "station_id": "ST_02", "color": "Cyan", "speed": 1.1},
    {"name": "Charles Leclerc", "station_id": "ST_03", "color": "Red", "speed": 1.15},
    {"name": "Fernando Alonso", "station_id": "ST_04", "color": "Green", "speed": 1.05},
]

async def simulate_race():
    uri = "ws://localhost:8000/ws/telemetry/agent"
    
    # Initial random positions
    for d in DRIVERS:
        d["angle"] = random.uniform(0, 2 * math.pi)

    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Broadcasting telemetry...")
            
            while True:
                for d in DRIVERS:
                    # Update physics
                    d["angle"] += 0.05 * d["speed"]
                    if d["angle"] > 2 * math.pi:
                        d["angle"] -= 2 * math.pi
                        
                    # Calculate coord (Ellipse)
                    x = TRACK_RADIUS_X * math.cos(d["angle"])
                    z = TRACK_RADIUS_Z * math.sin(d["angle"])
                    
                    # Add noise
                    x += random.uniform(-2, 2)
                    z += random.uniform(-2, 2)
                    
                    packet = {
                        "type": "telemetry",
                        "station_id": d["station_id"],
                        "driver": d["name"],
                        "car": "Formula Hybrid 2023",
                        "track": "monza",
                        "speed_kmh": random.randint(280, 320),
                        "rpm": random.randint(10000, 12000),
                        "gear": 8,
                        "gas": random.uniform(0.8, 1.0),
                        "brake": 0,
                        "lap_time_ms": 85000 + random.randint(0, 500),
                        "pos": 1,
                        "x": x,
                        "z": z
                    }
                    
                    await websocket.send(json.dumps(packet))
                
                await asyncio.sleep(0.05) # 20Hz update (approx)
                
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(simulate_race())
    except KeyboardInterrupt:
        print("Simulation stopped.")
