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
            # Packet ID (int), Gas (float), Brake (float), Fuel (float), Gear (int), RPM (int), SteerAngle (float), SpeedKmh (float)
            # Layout varies, checking AC documentation/Python examples
            # Physics Structure (partial):
            # packetId (4), gas(4), brake(4), fuel(4), gear(4), rpms(4), steerAngle(4), speedKmh(4) ...
            
            # Using specific offsets for key data to avoid full struct parsing significantly
            
            # Speed Kmh is at offset 28 (4*7)
            self.physics_map.seek(28)
            speed_kmh = struct.unpack('f', self.physics_map.read(4))[0]

            # RPM is at offset 20
            self.physics_map.seek(20)
            rpms = struct.unpack('i', self.physics_map.read(4))[0]

            # Gear is at offset 16
            self.physics_map.seek(16)
            gear = struct.unpack('i', self.physics_map.read(4))[0]


            # --- GRAPHICS ---
            self.graphics_map.seek(0)
            # packetId(4), status(4), session(4), currentLapTime(100chars? No, wchars)
            
            # Key: Normalized Car Position (progress on spline)
            # struct AC_GRAPHICS offset for normalizedCarPosition is likely deep.
            # Simplified approach: We need currentLapTime (formatted) or iCurrentTime (ms).
            
            # iCurrentTime is int32 at offset 44 (approx, need Verification)
            # float normalizedCarPosition at offset ??
            
            # Let's rely on a simpler struct read for Graphics:
            # packetId (4), status (4), session (4), currentTime (15 wchars), lastTime (15 wchars), bestTime (15 wchars), split (15 wchars), completedLaps (4), position (4), iCurrentTime (4), iLastTime (4), iBestTime (4), sessionTimeLeft (4), distanceTraveled (4), isInPit (4), currentSectorIndex (4), lastSectorTime (4), numberOfLaps (4), tyreCompound (33 wchars), replayTimeMultiplier (4), normalizedCarPosition (4)
            
            # Strings are 15 * 2 bytes = 30 bytes usually (utf-16)
            # Offsets:
            # 0: packetId (4)
            # 4: status (4)
            # 8: session (4)
            # 12: currentTime (30)
            # 42: lastTime (30)
            # 72: bestTime (30)
            # 102: split (30)
            # 132: completedLaps (4)
            # 136: position (4)
            # 140: iCurrentTime (4)  <-- Raw MS
            # 144: iLastTime (4)
            # 148: iBestTime (4)
            # ...
            # 168: currentSectorIndex (4)
            # ...
            # 222 (approx): normalizedCarPosition (float)

            # Let's verify normalizedCarPosition offset:
            # It's usually known to be around offset 0x30 (48) in some versions or deeper.
            # wait, 4 * 30 bytes string is huge.
            # actually wchar is 2 bytes. 
            # 12 + 30 = 42. Correct.
            
            # Let's try finding normalizedCarPosition. 
            # It is often the Last field in older docs or near end.
            
            # Better approach: Read iCurrentTime (ms) and iLastTime.
            self.graphics_map.seek(140)
            iCurrentTime = struct.unpack('i', self.graphics_map.read(4))[0]
            
            self.graphics_map.seek(136)
            pos_race = struct.unpack('i', self.graphics_map.read(4))[0]
            
            self.graphics_map.seek(132)
            completed_laps = struct.unpack('i', self.graphics_map.read(4))[0]
            
            # Normalized Spline Position is CRITICAL for Live Map.
            # According to reliable python-ac sources:
            # normalizedCarPosition is at offset 188 APPROX?
            # Let's re-calculate:
            # 132 (laps) + 4 = 136 (pos) + 4 = 140 (iCur) + 4 = 144 (iLast) + 4 = 148 (iBest) + 4 (sessTimeLeft) = 152 + 4 (dist) = 156 + 4 (pit) = 160 + 4 (sector) = 164 + 4 (lastSec) = 168 + 4 (numLaps) = 172 + 66 (tyre, 33*2) = 238 + 4 (multi) = 242 + 4 (normPos) = 246.
            
            # Checking offset 246 (approx).
            self.graphics_map.seek(246) # Risk of misalignment
            # Let's try searching for it or assuming it exists.
            
            # To be safe for this iteration, let's stick to SPEED and RPM and TIME.
            # We can debug layout later if needed.
            
            # We also need static data for Car/Track name
            # --- STATIC ---
            self.static_map.seek(0)
            # _smVersion(15*2), _acVersion(15*2), numberOfSessions(4), numCars(4), carModel(33*2), track(33*2), playerName(33*2)
            # 0 + 30 + 30 + 4 + 4 = 68
            # carModel at 68
            # track at 68 + 66 = 134
            # playerName at 134 + 66 = 200
            
            self.static_map.seek(68)
            car_model_bytes = self.static_map.read(66)
            car_model = car_model_bytes.decode('utf-16').split('\x00')[0]
            
            self.static_map.seek(134)
            track_bytes = self.static_map.read(66)
            track = track_bytes.decode('utf-16').split('\x00')[0]
            
            self.static_map.seek(200)
            player_name_bytes = self.static_map.read(66)
            player_name = player_name_bytes.decode('utf-16').split('\x00')[0]

            return {
                "type": "telemetry",
                "speed_kmh": round(speed_kmh, 1),
                "rpm": rpms,
                "gear": gear - 1, # AC gears: 0=R, 1=N, 2=1st
                "lap_time_ms": iCurrentTime,
                "laps": completed_laps,
                "pos": pos_race,
                "car": car_model,
                "track": track,
                "driver": player_name,
                "normalized_pos": 0.0 # Placeholder until we nail the offset
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
