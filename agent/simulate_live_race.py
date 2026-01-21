import asyncio
import json
import math
import random
import time
import websockets

# Configuration
WS_URL = "ws://localhost:8000/ws/telemetry/agent"

# Mock Track: "Sim Circuit"
# Simple oval/circle
CENTER_X = 0
CENTER_Z = 0
RADIUS = 200 # meters

class SimCar:
    def __init__(self, station_id, driver, car_model, start_angle, speed_variance):
        self.station_id = station_id
        self.driver = driver
        self.car_model = car_model
        self.angle = start_angle
        self.speed_variance = speed_variance
        
        self.lap = 1
        self.lap_time_start = time.time()
        self.best_lap = 9999999

    def update(self, dt):
        # Update Physics
        # Speed varies with position (faster on straights, slower on curves if non-circle)
        # For circle, constant speed is fine, but let's vary it properly
        
        # Speed calc (roughly 200kmh base)
        target_speed = 200 + self.speed_variance
        distance_per_sec = (target_speed * 1000) / 3600
        
        # Update angle (angular velocity = v / r)
        # Circumference = 2 * pi * r
        angular_velocity = distance_per_sec / RADIUS
        self.angle += angular_velocity * dt
        
        # Wrap angle
        if self.angle > 2 * math.pi:
            self.angle -= 2 * math.pi
            self.lap += 1
            self.lap_time_start = time.time() # Reset lap time
            
        # Calc Position
        self.x = CENTER_X + math.cos(self.angle) * RADIUS
        self.z = CENTER_Z + math.sin(self.angle) * RADIUS
        self.y = 0 # Flat track
        
        # Telemetry
        self.speed_kmh = target_speed + random.uniform(-2, 2)
        self.rpm = 6000 + (self.speed_kmh * 10) # Fake RPM
        self.gear = 4
        
        # Inputs & G-Force
        # On a constant circle, constant lateral G
        # Centripetal acc = v^2 / r
        v_ms = self.speed_kmh / 3.6
        acc = (v_ms ** 2) / RADIUS
        self.g_lat = acc / 9.81
        self.g_lon = 0
        
        self.steer = 0.2 # Constant steering for circle
        self.gas = 0.8
        self.brake = 0
        
        # Temps
        self.tyre_temp = 80 + math.sin(time.time() * 0.5) * 10

    def to_json(self):
        current_lap_time = (time.time() - self.lap_time_start) * 1000
        
        return {
            "type": "telemetry",
            "station_id": self.station_id,
            "driver": self.driver,
            "car": self.car_model,
            "track": "Sim Circuit",
            "speed_kmh": round(self.speed_kmh, 1),
            "rpm": int(self.rpm),
            "gear": self.gear,
            "lap_time_ms": int(current_lap_time),
            "laps": self.lap,
            "pos": 1, # TODO: Calc real pos
            "normalized_pos": self.angle / (2 * math.pi),
            
            # Live Data
            "gas": self.gas,
            "brake": self.brake,
            "steer": self.steer,
            "g_lat": round(self.g_lat, 2),
            "g_lon": round(self.g_lon, 2),
            "tyre_temp": round(self.tyre_temp, 1),
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "z": round(self.z, 2)
        }

async def run_simulation():
    cars = [
        SimCar("sim_1", "Max Verstappen", "Red Bull RB19", 0, 10),
        SimCar("sim_2", "Lewis Hamilton", "Mercedes W14", 0.5, 5), 
        # Car 3 on a different track
        SimCar("sim_3", "Fernando Alonso", "Aston Martin AMR23", 2.0, -5)
    ]
    # Hack to force different track for car 3
    cars[2].to_json = lambda: {**SimCar.to_json(cars[2]), "track": "monza"} # Default is "Sim Circuit"

    
    print(f"Connecting to {WS_URL}...")
    try:
        async with websockets.connect(WS_URL) as websocket:
            print("Connected! Simulating race... (Press Ctrl+C to stop)")
            
            last_time = time.time()
            while True:
                now = time.time()
                dt = now - last_time
                last_time = now
                
                for car in cars:
                    car.update(dt)
                    data = car.to_json()
                    await websocket.send(json.dumps(data))
                
                # Update frequency 20Hz
                await asyncio.sleep(0.05)
                
    except Exception as e:
        print(f"Simulation Error: {e}")
        print("Make sure the backend is running and 'websockets' is installed (pip install websockets)")

if __name__ == "__main__":
    try:
        asyncio.run(run_simulation())
    except KeyboardInterrupt:
        print("\nSimulation stopped.")
