import threading
import time
import subprocess
import platform
import logging
from config import logger
from utils import launch_ac

class ProcessWatchdog:
    """
    Monitors acs.exe and restarts it if it crashes during an active session.
    """
    def __init__(self):
        self.active_session = None  # Dict with car, track, ac_path, etc.
        self.watching = False
        self._thread = None
    
    def start(self, session_config: dict):
        """Start watching for a session"""
        self.active_session = session_config
        self.watching = True
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()
        logger.info("Watchdog started for session")
    
    def stop(self):
        """Stop watching"""
        self.watching = False
        self.active_session = None
        logger.info("Watchdog stopped")
    
    def _is_game_running(self) -> bool:
        """Check if acs.exe is running"""
        try:
            if platform.system() == "Windows":
                result = subprocess.run(
                    ["tasklist", "/FI", "IMAGENAME eq acs.exe"],
                    capture_output=True, text=True
                )
                return "acs.exe" in result.stdout
            else:
                result = subprocess.run(["pgrep", "-x", "acs"], capture_output=True)
                return result.returncode == 0
        except Exception:
            return False
    
    def _restart_game(self):
        """Restart the game using stored session config"""
        if not self.active_session:
            return
        
        ac_path = self.active_session.get("ac_path")
        if not ac_path:
            logger.error("Watchdog: No ac_path in session config, cannot restart")
            return
        
        logger.info("Watchdog: Restarting crashed game...")
        if launch_ac(ac_path):
            logger.info("Watchdog: Game restarted successfully")
        else:
            logger.error("Watchdog: Failed to restart game")
    
    def _watch_loop(self):
        """Main watchdog loop"""
        # Wait a bit for game to start
        time.sleep(10)
        
        restarts = 0
        MAX_RESTARTS = 3
        
        # Track time since last restart for stability check
        last_restart_time = time.time()
        
        while self.watching:
            now = time.time()
            if self._is_game_running():
                 # Track stable uptime since last restart (not since last check)
                 if restarts > 0 and (now - last_restart_time) > 300:
                     logger.info("Watchdog: Process stable for 5m after restart. Resetting restart counter.")
                     restarts = 0
            else:
                if restarts >= MAX_RESTARTS:
                    logger.error("Watchdog: Max restarts exceeded (3 crashes in <5 mins). Stopping watchdog.")
                    self.watching = False
                    break
                
                logger.warning(f"Watchdog: Game not running. Attempting restart ({restarts + 1}/{MAX_RESTARTS})...")
                self._restart_game()
                restarts += 1
                
                # Reset healthy timer after restart
                last_restart_time = time.time()
                
                time.sleep(20)  # Wait longer for game to start
                 
            time.sleep(5)  # Check every 5 seconds

# Global watchdog instance
watchdog = ProcessWatchdog()
