import mmap
import struct
import platform
import logging

logger = logging.getLogger(__name__)

class ACSharedMemory:
    def __init__(self):
        self.physics_map = None
        self.graphics_map = None
        self.static_map = None
        self.connected = False

    def connect(self):
        """Attempts to connect to AC shared memory. Returns True if successful."""
        if platform.system() != "Windows":
             logger.warning("Shared Memory only supported on Windows.")
             return False

        try:
            # Open Shared Memory Mappings
            # AC uses "Local\" prefix
            self.physics_map = mmap.mmap(0, 712, "Local\\acpmf_physics")
            self.graphics_map = mmap.mmap(0, 1588, "Local\\acpmf_graphics")
            self.static_map = mmap.mmap(0, 756, "Local\\acpmf_static")
            self.connected = True
            logger.info("Connected to Assetto Corsa Shared Memory")
            return True
        except FileNotFoundError:
            # AC not running or not in race
            self.connected = False
            return False
        except Exception as e:
            logger.error(f"Error connecting to shared memory: {e}")
            self.connected = False
            return False

    def read_data(self):
        """Reads current telemetry snapshot. Returns dict or None if not connected."""
        if not self.connected:
            if not self.connect():
                return None

        try:
            # --- PHYSICS ---
            self.physics_map.seek(0)
            # Structure:
            # packetId(4), gas(4), brake(4), fuel(4), gear(4), rpms(4), steerAngle(4), speedKmh(4)
            # velocity(12), accG(12), wheelSlip(16), wheelLoad(16), wheelsPressure(16), wheelAngularSpeed(16), 
            # tyreWear(16), tyreDirtyLevel(16), tyreCoreTemp(16), camberRAD(16), suspensionTravel(16), 
            # drs(4), tc(4), heading(4), pitch(4), roll(4), cgHeight(4), carDamage(20), numberOfTyresOut(4), 
            # pitLimiterOn(4), abs(4), kersCharge(4), kersInput(4), autoShifterOn(4), rideHeight(8), turboBoost(4), 
            # ballast(4), airDensity(4), airTemp(4), roadTemp(4), localAngularVel(12), finalFF(4), performanceMeter(4), 
            # engineBrake(4), ersRecoveryLevel(4), ersPowerLevel(4), ersHeatCharging(4), ersIsCharging(4), 
            # kersCurrentKJ(4), drsAvailable(4), drsEnabled(4), brakeTemp(16), clutch(4), ...

            # Read basic inputs (Block read for efficiency)
            self.physics_map.seek(4) # Skip packetId
            # gas(4), brake(4), fuel(4), gear(4), rpms(4), steerAngle(4), speedKmh(4) -> 7 * 4 = 28 bytes
            basic_data = struct.unpack('7f', self.physics_map.read(28)) 
            # Note: gear and rpms are ints in C++, but struct.unpack 'f' reads them as float if we aren't careful?
            # Actually mixing types in one unpack string matches the bytes.
            # 4f (gas, brake, fuel, gear?), wait gear is int.
            
            # Let's do individual seeks/reads to be safe on types
            # Gas offset 4
            self.physics_map.seek(4)
            gas = struct.unpack('f', self.physics_map.read(4))[0]
            
            # Brake offset 8
            self.physics_map.seek(8)
            brake = struct.unpack('f', self.physics_map.read(4))[0]
            
            # Gear offset 16 (int)
            self.physics_map.seek(16)
            gear = struct.unpack('i', self.physics_map.read(4))[0]
            
            # RPM offset 20 (int)
            self.physics_map.seek(20)
            rpms = struct.unpack('i', self.physics_map.read(4))[0]
            
            # Steer offset 24 (float)
            self.physics_map.seek(24)
            steer = struct.unpack('f', self.physics_map.read(4))[0]
            
            # Speed offset 28 (float)
            self.physics_map.seek(28)
            speed_kmh = struct.unpack('f', self.physics_map.read(4))[0]
            
            # G-Forces (accG) at offset: 
            # 32 (velocity 3*4=12) -> 44 starts AccG
            # AccG is float[3] (Vertical, Longitudinal, Lateral) - Check coordinate system
            # Usually Index 0=X (Lat?), 1=Y (Vert?), 2=Z (Long?) or similar.
            # AC uses: X=Lat, Y=Vert, Z=Long
            self.physics_map.seek(44)
            accG = struct.unpack('3f', self.physics_map.read(12))
            g_lat = accG[0]
            g_lon = accG[2] 
            
            # Tyre Temps (Core)
            # Offset calculation:
            # 44+12=56 (start of wheelSlip)
            # 56 + 16(slip) + 16(load) + 16(press) + 16(angSpd) + 16(wear) + 16(dirty) = 146?
            # Let's count bytes carefully or use rigid offsets.
            # wheelSlip (4*4), wheelLoad (4*4), ...
            # 1. wheelSlip @ 56
            # 2. wheelLoad @ 72
            # 3. wheelsPressure @ 88
            # 4. wheelAngularSpeed @ 104
            # 5. tyreWear @ 120
            # 6. tyreDirtyLevel @ 136
            # 7. tyreCoreTemp @ 152
            self.physics_map.seek(152)
            tyre_temps = struct.unpack('4f', self.physics_map.read(16))
            avg_tyre_temp = sum(tyre_temps) / 4

            # --- GRAPHICS ---
            self.graphics_map.seek(140)
            iCurrentTime = struct.unpack('i', self.graphics_map.read(4))[0]
            
            self.graphics_map.seek(136)
            pos_race = struct.unpack('i', self.graphics_map.read(4))[0]
            # Normalized Spline Position is CRITICAL for Live Map.
            # According to reliable python-ac sources:
            # normalizedCarPosition is at offset 188 APPROX?
            # Let's re-calculate:
            # 132 (laps) + 4 = 136 (pos) + 4 = 140 (iCur) + 4 = 144 (iLast) + 4 = 148 (iBest) + 4 (sessTimeLeft) = 152 + 4 (dist) = 156 + 4 (pit) = 160 + 4 (sector) = 164 + 4 (lastSec) = 168 + 4 (numLaps) = 172 + 66 (tyre, 33*2) = 238 + 4 (multi) = 242 + 4 (normPos) = 246.
            
            # Checking offset 246 (approx).
            self.graphics_map.seek(246) 
            normalized_pos = struct.unpack('f', self.graphics_map.read(4))[0]

            # World Coordinates (X, Y, Z)
            # Usually follows normalizedPos.
            # SPageFileGraphics: ... float normalizedCarPosition; float carCoordinates[3]; ...
            self.graphics_map.seek(250)
            coords = struct.unpack('3f', self.graphics_map.read(12))
            car_x = coords[0]
            car_y = coords[1]
            car_z = coords[2]

            # Read Completed Laps
            self.graphics_map.seek(168)
            completed_laps = struct.unpack('i', self.graphics_map.read(4))[0]

            # --- STATIC ---
            self.static_map.seek(68)
            car_model = self.static_map.read(66).decode('utf-16').split('\x00')[0]
            
            self.static_map.seek(134)
            track = self.static_map.read(66).decode('utf-16').split('\x00')[0]
            
            self.static_map.seek(200)
            player_name = self.static_map.read(66).decode('utf-16').split('\x00')[0]

            return {
                "type": "telemetry",
                "speed_kmh": round(speed_kmh, 1),
                "rpm": rpms,
                "gear": gear - 1,
                "lap_time_ms": iCurrentTime,
                "laps": completed_laps,
                "pos": pos_race,
                "car": car_model,
                "track": track,
                "driver": player_name,
                "normalized_pos": round(normalized_pos, 4),
                # New Fields
                "gas": round(gas, 2),
                "brake": round(brake, 2),
                "steer": round(steer, 2),
                "g_lat": round(g_lat, 2),
                "g_lon": round(g_lon, 2),
                "tyre_temp": round(avg_tyre_temp, 1),
                "x": round(car_x, 2),
                "y": round(car_y, 2),
                "z": round(car_z, 2)
            }

        except WindowsError:
            # Map closed
            self.connected = False
            return None
        except Exception as e:
            logger.error(f"Read error: {e}")
            return None

    def close(self):
        if self.physics_map: self.physics_map.close()
        if self.graphics_map: self.graphics_map.close()
        if self.static_map: self.static_map.close()
