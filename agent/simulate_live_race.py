import asyncio
import json
import math
import random
import time
import websockets
import requests
from datetime import datetime, timezone

# Configuration
STATION_ID = 19
AGENT_TOKEN = "test-token-123"
WS_URL = "ws://localhost:8000/ws/telemetry/agent"
HTTP_URL = "http://localhost:8000"

# Mock Track: "Monza" (Simplified)
CENTER_X = 0
CENTER_Z = 0
RADIUS = 200 # meters (approx 1.25km circumference)

class SimCar:
    def __init__(self, driver, car_model, start_angle, speed_variance):
        self.station_id = STATION_ID
        self.driver = driver
        self.car_model = car_model
        self.angle = start_angle
        self.speed_variance = speed_variance
        
        self.lap = 1
        self.lap_time_start = time.time()
        self.telemetry_history = [] 

    def update(self, dt):
        target_speed = 200 + self.speed_variance
        distance_per_sec = (target_speed * 1000) / 3600
        angular_velocity = distance_per_sec / RADIUS
        self.angle += angular_velocity * dt
        
        is_lap_completed = False
        if self.angle > 2 * math.pi:
            self.angle -= 2 * math.pi
            self.lap += 1
            self.lap_time_start = time.time()
            is_lap_completed = True
            
        self.x = CENTER_X + math.cos(self.angle) * RADIUS
        self.z = CENTER_Z + math.sin(self.angle) * RADIUS
        self.y = 0
        self.speed_kmh = target_speed + random.uniform(-2, 2)
        self.rpm = 6000 + (self.speed_kmh * 10)
        self.gear = 4
        
        v_ms = self.speed_kmh / 3.6
        acc = (v_ms ** 2) / RADIUS
        self.g_lat = acc / 9.81
        self.g_lon = 0
        
        self.steer = 0.2
        self.gas = 0.8
        self.brake = 0
        self.tyre_temp = 80 + math.sin(time.time() * 0.5) * 10
        return is_lap_completed

    def to_json(self, position: int = 1):
        current_lap_time = (time.time() - self.lap_time_start) * 1000
        data = {
            "type": "telemetry",
            "station_id": self.station_id,
            "driver": self.driver,
            "car": self.car_model,
            "track": "Monza",
            "speed_kmh": round(self.speed_kmh, 1),
            "rpm": int(self.rpm),
            "gear": self.gear,
            "lap_time_ms": int(current_lap_time),
            "laps": self.lap,
            "pos": position,
            "n": self.angle / (2 * math.pi),
            "gas": self.gas,
            "brake": self.brake,
            "steer": self.steer,
            "g_lat": round(self.g_lat, 2),
            "g_lon": round(self.g_lon, 2),
            "x": round(self.x, 2),
            "z": round(self.z, 2)
        }
        self.telemetry_history.append({
            "t": int(data["lap_time_ms"]),
            "s": data["speed_kmh"],
            "n": data["n"],
            "g": data["gear"],
            "r": data["rpm"],
            "x": data["x"],
            "z": data["z"]
        })
        return data

async def run_simulation():
    car = SimCar("Sim Pilot", "Ferrari 488 GT3", 0, 10)
    
    print(f"Connecting to {WS_URL}...")
    try:
        async with websockets.connect(WS_URL) as websocket:
            print("Identifying...")
            await websocket.send(json.dumps({
                "type": "identify",
                "station_id": STATION_ID,
                "role": "agent",
                "token": AGENT_TOKEN
            }))
            
            print("Connected! Simulating 2 laps...")
            last_time = time.time()
            while car.lap <= 2:
                now = time.time()
                dt = now - last_time
                last_time = now
                
                completed = car.update(dt)
                data = car.to_json(position=1)
                await websocket.send(json.dumps(data))
                
                if completed:
                    print(f"Lap {car.lap-1} completed!")
                
                await asyncio.sleep(0.05)

            print("Simulating Session Upload...")
            session_payload = {
                "station_id": STATION_ID,
                "track_name": "Monza",
                "car_model": car.car_model,
                "driver_name": car.driver,
                "session_type": "practice",
                "date": datetime.now(timezone.utc).isoformat(),
                "best_lap": 85000, 
                "laps": [
                    {
                        "driver_name": car.driver,
                        "car_model": car.car_model,
                        "track_name": "Monza",
                        "lap_time": 85000,
                        "sectors": [25000, 30000, 30000],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "is_valid": True,
                        "telemetry_data": car.telemetry_history
                    }
                ]
            }
            res = requests.post(
                f"{HTTP_URL}/telemetry/session", 
                json=session_payload, 
                headers={"X-Agent-Token": AGENT_TOKEN},
                timeout=10
            )
            if res.status_code in [200, 201]:
                print("¡Session uploaded successfully! Check AI Coach now.")
            else:
                print(f"Failed to upload session (Status {res.status_code}): {res.text}")

    except Exception as e:
        print(f"Simulation Error: {e}")

if __name__ == "__main__":
    asyncio.run(run_simulation())
