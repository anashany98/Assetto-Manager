# Solución de Problemas (Troubleshooting)

## Problemas Comunes

### 1. El Simulador aparece "Offline" en el Dashboard
*   **Causa**: El Agente no está corriendo o no alcanza al servidor.
*   **Solución**:
    1.  Verifique que `python main.py` esté corriendo en el simulador (ventana negra de consola).
    2.  Compruebe `agent/config.json`: ¿La `server_url` es correcta? (No use `localhost` si están en PCs distintos, use la IP real `192.168.x.x`).
    3.  Firewall: Asegúrese de que el puerto 8000 en el Servidor está abierto en el Firewall de Windows.

### 2. El juego no se inicia ("Lanzando..." y nada pasa)
*   **Causa 1**: Steam no está abierto. Assetto Corsa requiere Steam corriendo.
*   **Causa 2**: Ruta de `ac_path` incorrecta en `config.json`.
*   **Causa 3**: Falta el contenido (Coche/Pista no instalados en ese PC).
*   **Solución**:
    *   Abra `agent/logs` para ver el error exacto.
    *   Intente lanzar el juego manualmente desde Steam para verificar que funciona fuera del sistema.

### 3. VR se ve en el monitor, no en las gafas
*   **Causa**: `video.ini` no se actualizó o SteamVR no arrancó.
*   **Solución**:
    *   Asegúrese de seleccionar "VR" en el modal de lanzamiento.
    *   Verifique que las gafas (Oculus/Vive) estén conectadas y su software (Oculus Link / SteamVR) esté listo antes de lanzar.

### 4. Los tiempos no se registran en el Leaderboard
*   **Causa**: El plugin de telemetría no está enviando datos.
*   **Solución**:
    *   Verifique que el Agente esté corriendo. El agente lee la memoria compartida ("Shared Memory") de AC.
    *   Asegúrese de que el "Shared Memory" no esté deshabilitado en los ajustes de AC (aunque suele estar activo por defecto).

---

## Logs y Soporte
*   **Logs del Servidor**: Ver consola del Backend.
*   **Logs del Agente**: Ver consola del Agente o archivo `agent.log`.
