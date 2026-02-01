import time
import sys
import logging
import threading
from pathlib import Path

# Add shared directory to path for hashing
sys.path.append(str(Path(__file__).resolve().parents[1] / "shared"))
try:
    import hashing
except ImportError:
    hashing = None

from config import (
    SERVER_URL, AC_CONTENT_DIR, STATION_NAME, AGENT_TOKEN,
    logger, AGENT_VERSION
)
from utils import get_system_info, ensure_directories
from networking import NetworkLogHandler
from watchdog import watchdog
from proxy import image_proxy
from sync import synchronize_content, send_heartbeat, register_agent
from ws_client import AgentWSClient
from updater import check_for_updates

# Enable telemetry results handling
import telemetry 
telemetry.set_agent_token(AGENT_TOKEN)

def main():
    logger.info(f"Iniciando Agente AC Manager v{AGENT_VERSION} (Refactored)...")
    
    # Check for updates first
    check_for_updates()
    
    # Attach Network Logger (Only for Warnings/Errors)
    net_handler = NetworkLogHandler(SERVER_URL)
    net_handler.setLevel(logging.WARNING) 
    logger.addHandler(net_handler)
    
    ensure_directories()
    
    station_id = None
    station_data = None
    
    # Bucle de Registro...
    while station_id is None:
        station_data = register_agent()
        if station_data:
            station_id = station_data["id"]
        else:
            time.sleep(5)

    # Configurar rutas y proxy
    station_ac_path = None
    if isinstance(station_data, dict):
        station_ac_path = station_data.get("ac_path")
    if not station_ac_path:
        station_ac_path = get_system_info().get("ac_path")
    
    if station_ac_path:
        image_proxy.start(station_ac_path)
    
    # Iniciar Cliente WebSocket (TelemetrÃ­a + Comandos)
    ws_client = AgentWSClient(station_id, SERVER_URL)
    ws_client.start()

    # Iniciar Monitor de Hardware (CPU/RAM/Temp)
    try:
        from monitor import HardwareMonitor
        monitor_thread = HardwareMonitor(station_id, SERVER_URL)
        monitor_thread.start()
    except ImportError:
        logger.error("No se pudo cargar monitor.py. MonitorizaciÃ³n de HW desactivada.")
    except Exception as e:
        logger.error(f"Error iniciando monitor de hardware: {e}")

    # Bucle Principal de Mantenimiento
    while True:
        try:
            # Verificar SincronizaciÃ³n y TelemetrÃ­a (Resultados)
            status = synchronize_content(station_id)
            
            telemetry.check_for_new_results(SERVER_URL, station_id)
            
            send_heartbeat(station_id, status or "online")
            
            time.sleep(10) 
        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Error en bucle principal: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
