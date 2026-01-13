import os
import json
import logging
import requests
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("AC-Agent.Telemetry")

# Almacén de telemetría en memoria: { lap_index (int): [puntos_telemetria] }
# Se rellena desde main.py usando memoria compartida
_telemetry_buffer = {}

def save_lap_telemetry(lap_idx, data):
    """
    Guarda la traza de telemetría de una vuelta completada.
    Llamado desde main.py cuando Shared Memory detecta fin de vuelta.
    """
    _telemetry_buffer[lap_idx] = data
    # Limpieza básica: mantener solo ultimas 20 vueltas para evitar fugas de memoria
    if len(_telemetry_buffer) > 20:
        oldest = min(_telemetry_buffer.keys())
        del _telemetry_buffer[oldest]
    logger.info(f"Telemetría guardada para vuelta {lap_idx} ({len(data)} puntos)")

def find_race_out_file():
    """
    Localiza race_out.json en la carpeta de documentos de Assetto Corsa.
    """
    # Ruta estándar: Documents/Assetto Corsa/out/race_out.json
    
    docs_path = Path.home() / "Documents" / "Assetto Corsa" / "out"
    game_file = docs_path / "race_out.json"
    
    if game_file.exists():
        return game_file
        
    # Fallback para desarrollo/testing local
    mock_file = Path(__file__).parent / "mock_race_out.json"
    if mock_file.exists():
        return mock_file
        
    return None

def parse_and_send_telemetry(file_path, server_url, station_id):
    """
    Lee race_out.json, lo procesa y envía al servidor.
    Intenta fusionar con datos de telemetría en buffer.
    """
    try:
        # 1. Leer Archivo
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
            
        # 2. Extraer Información de Sesión
        # Mapeo de campos JSON de AC a nuestro Schema
        
        # Asumimos un solo jugador para la estación
        player = data.get("players", [{}])[0]
        player_laps = player.get("laps", [])
        
        session_type_raw = data.get("sessionType", "P")
        session_type_map = {
            "P": "practice",
            "Q": "qualify",
            "R": "race",
            "H": "hotlap"
        }
        session_type = session_type_map.get(str(session_type_raw).upper(), str(session_type_raw).lower())

        payload = {
            "station_id": station_id,
            "track_name": data.get("track", "unknown"),
            "track_config": data.get("track_config", None),
            "car_model": data.get("car", player.get("car", "unknown")),
            "driver_name": player.get("name", "Unknown Driver"),
            "session_type": session_type,
            "date": datetime.now().isoformat(),
            "best_lap": player.get("bestLap", 0),
            "laps": []
        }
        
        for idx, lap in enumerate(player_laps):
            # Intentar buscar telemetría en el buffer
            # El índice en race_out debería coincidir con el contador de vueltas secuencial
            # Pero race_out a veces limpia vueltas inválidas? Depende de la config.
            # Asumiremos coincidencia por índice 0-based.
            
            tele_data = _telemetry_buffer.get(idx, [])
            
            # Si no hay datos por indice, quizás por coincidencia de tiempo? (Más complejo, v2)
            # Para esta versión, confiamos en el orden secuencial.
            
            payload["laps"].append({
                "driver_name": payload["driver_name"],
                "car_model": payload["car_model"],
                "track_name": payload["track_name"],
                "lap_time": lap.get("time", 0),
                "sectors": lap.get("sectors", []), # Array de tiempos de sector
                "is_valid": lap.get("isValid", True),
                "timestamp": datetime.now().isoformat(), # Aproximado
                "telemetry_data": tele_data if tele_data else None
            })
            
        # 3. Enviar al Servidor
        logger.info(f"Subiendo sesión de {payload['driver_name']} en {payload['track_name']}...")
        response = requests.post(f"{server_url}/telemetry/session", json=payload, timeout=10)
        response.raise_for_status()
        logger.info("¡Subida de telemetría exitosa!")
        
        return True

    except Exception as e:
        logger.error(f"Error procesando telemetría: {e}")
        return False

# Función para verificar actualizaciones
_last_mtime = 0

def check_for_new_results(server_url, station_id):
    global _last_mtime
    
    file_path = find_race_out_file()
    if not file_path:
        return
        
    try:
        mtime = os.path.getmtime(file_path)
        if mtime > _last_mtime:
            # Archivo modificado o nuevo
            logger.info("¡Nuevo resultado de carrera detectado!")
            
            # Pequeña espera para asegurar escritura completa
            import time
            time.sleep(1) 
            
            if parse_and_send_telemetry(file_path, server_url, station_id):
                _last_mtime = mtime
                
    except Exception as e:
        logger.error(f"Error verificando archivo de resultados: {e}")

