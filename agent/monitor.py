import psutil
import time
import threading
import requests
import logging

logger = logging.getLogger("AC-Agent-Monitor")

class HardwareMonitor(threading.Thread):
    def __init__(self, station_id, server_url):
        super().__init__()
        self.station_id = station_id
        self.server_url = f"{server_url}/hardware/report"
        self.running = True
        self.daemon = True

    def run(self):
        logger.info("Iniciando Monitor de Hardware...")
        while self.running:
            try:
                report = self.collect_metrics()
                self.send_report(report)
            except Exception as e:
                logger.error(f"Error en monitorización: {e}")
            
            # Esperar 5 segundos antes de la siguiente lectura
            # Restamos 1 porque cpu_percent(interval=1) ya duerme 1 segundo
            time.sleep(4) 

    def collect_metrics(self):
        # CPU (Bloquea 1 segundo para medir promedio)
        cpu = psutil.cpu_percent(interval=1)
        
        # RAM
        ram = psutil.virtual_memory().percent
        
        # Disk (C:)
        try:
            disk = psutil.disk_usage('C:\\').percent
        except:
            disk = 0

        # AC Running Check
        ac_running = False
        try:
            # Iterar procesos es algo costoso, pero aceptable cada 5s
            for proc in psutil.process_iter(['name']):
                try:
                    if proc.info['name'] in ['acs.exe', 'acs_pro.exe', 'AssettoCorsa.exe']:
                        ac_running = True
                        break
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        except Exception:
            pass

        return {
            "station_id": self.station_id,
            "cpu_percent": round(cpu, 1),
            "ram_percent": round(ram, 1),
            "disk_percent": round(disk, 1),
            "gpu_temp": 0, # Requiere librerías dependientes de vendor (NVML), pospuesto para V2
            "ac_running": ac_running,
            "wheel_connected": True, # Placeholder
            "pedals_connected": True
        }

    def send_report(self, data):
        try:
            requests.post(self.server_url, json=data, timeout=2)
        except Exception:
            pass # Monitorización no debe bloquear ni spammear logs si falla la red
