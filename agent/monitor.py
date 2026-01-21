import psutil
import time
import threading
import requests
import logging
import os

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

        # GPU Metrics (NVIDIA)
        gpu_percent = 0
        gpu_temp = 0
        try:
            import subprocess
            # Get GPU load and temp
            cmd = "nvidia-smi --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits"
            result = subprocess.check_output(cmd, shell=True).decode('utf-8').strip()
            if result:
                parts = result.split(',')
                gpu_percent = float(parts[0])
                gpu_temp = float(parts[1])
        except Exception:
            # Fallback for non-NVIDIA or if nvidia-smi fails
            gpu_percent = 0
            gpu_temp = 0

        # Peripheral Detection (Basic check for Joypads/Controllers via PowerShell)
        wheel_connected = False
        pedals_connected = False
        try:
            # Use PowerShell to find HID devices for Gaming Controllers
            cmd_ps = 'powershell "Get-PnpDevice -Class GameControllers -Status OK"'
            out = subprocess.check_output(cmd_ps, shell=True).decode('utf-8')
            if out and "OK" in out:
                # If any device is found, we assume at least a wheel is there
                # Identifying specifically wheel vs pedals requires semi-complex vendor ID parsing
                # For now, if GameControllers are OK, we assume connected
                wheel_connected = True
                pedals_connected = True
        except Exception:
            wheel_connected = False
            pedals_connected = False

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
            "gpu_percent": round(gpu_percent, 1),
            "gpu_temp": round(gpu_temp, 1),
            "ac_running": ac_running,
            "wheel_connected": wheel_connected,
            "pedals_connected": pedals_connected
        }

    def send_report(self, data):
        try:
            agent_token = os.getenv("AGENT_TOKEN", "")
            headers = {"X-Agent-Token": agent_token} if agent_token else {}
            requests.post(self.server_url, json=data, headers=headers, timeout=2)
        except Exception:
            pass # Monitorización no debe bloquear ni spammear logs si falla la red
