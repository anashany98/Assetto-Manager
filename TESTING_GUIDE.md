# Guía de Pruebas en Entorno Real (Multi-PC)

Esta guía explica cómo desplegar y probar **Assetto Manager** en un entorno real con un **Servidor Central** y múltiples **Simuladores (Clientes)**.

## 1. Preparación del Servidor Central (Tu PC actual)

Este PC gestionará la base de datos, la web y coordinará a los simuladores.

1.  Asegúrate de que el servidor está corriendo:
    ```cmd
    start_server.bat
    ```
2.  Obtén tu dirección IP local:
    -   Abre CMD y escribe `ipconfig`.
    -   Anota la dirección IPv4 (ej. `192.168.1.50`).

## 2. Preparación del Simulador (Cliente)

Para cada simulador que quieras conectar:

### Requisitos
-   Python 3.10+ instalado.
-   Assetto Corsa instalado.
-   Acceso a la red local del Servidor Central.

### Instalación del Agente
1.  Copia la carpeta `agent` y `shared` (si existe) del proyecto a una carpeta en el Simulador (ej. `C:\AC-Agent`).
2.  Crea un entorno virtual e instala dependencias:
    ```cmd
    cd C:\AC-Agent
    python -m venv venv
    venv\Scripts\activate
    pip install requests websockets psutil
    ```
    *(Nota: Revisa `requirements.txt` si hay dependencias adicionales específicas del agente)*

### Configuración
Crea un archivo `config.json` dentro de la carpeta del agente (`C:\AC-Agent\agent\config.json`):

```json
{
  "server_url": "http://192.168.1.108:8000",
  "ac_content_dir": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa"
}
```
*Reemplaza `192.168.1.108` con la IP de tu Servidor Central y la ruta de AC si es diferente.*

### Ejecución
Lanza el agente:
```cmd
python agent/main.py
```
Verás logs indicando que se ha registrado con éxito en el servidor.

## 3. Probando el Modo Kiosk

Una vez el Agente esté corriendo en el Simulador:

1.  En el **Simulador**, abre un navegador (Chrome/Edge/Firefox).
2.  Entra en la URL del Kiosk apuntando al Servidor Central:
    ```
    http://192.168.1.108:5173/kiosk
    ```
3.  Deberías ver la pantalla "BIENVENIDO PILOTO".
4.  Si te identificas y pulsas "COMENZAR", el sistema enviará la orden al Agente local para configurar y lanzar Assetto Corsa.

## Solución de Problemas

-   **Firewall**: Si no conecta, asegúrate de permitir el tráfico en los puertos `8000` (Backend) y `5173` (Frontend) en el firewall de Windows del Servidor Central.
-   **CORS/Red**: Si el navegador muestra errores de conexión, verifica que ambos PCs estén en la misma red y se vean (haz `ping` entre ellos).
