# Manual de Usuario - Assetto Manager

Este documento detalla la instalación, configuración y uso del sistema **Assetto Manager**, diseñado para gestionar centros de simulación de carreras (SimCenters).

## 1. Arquitectura del Sistema

El sistema se compone de dos partes principales:

1.  **Servidor Central (Backend + Frontend)**: Se instala en un PC "Master" (Recepción). Desde aquí se controla todo el negocio, se inician sesiones, se gestionan torneos y se ven las estadísticas.
2.  **Agentes de Estación (Agent)**: Se instala en cada PC simulador. Es un pequeño programa que recibe órdenes del servidor (lanzar juego, cerrar juego, cambiar configuración VR, etc.) y reporta el estado del hardware.

---

## 2. Instalación

### A. Servidor Central (Recepción)
1.  **Requisitos**: Python 3.10+, Node.js 18+, PostgreSQL.
2.  **Instalación**:
    *   Clonar el repositorio.
    *   Ejecutar `install_dependencies.bat` (o instalar `requirements.txt` y `npm install` en frontend).
    *   Configurar base de datos en `backend/.env`.
3.  **Arranque**:
    *   Ejecutar `start_server.bat` para iniciar Backend y Frontend.
    *   El panel de control será accesible en `http://localhost:3000` (o la IP del servidor).

### B. Agentes (Simuladores)
1.  **Ubicación**: Copiar la carpeta `agent` a cada PC simulador.
2.  **Configuración**:
    *   Editar `agent/config.json`:
        ```json
        {
            "server_url": "http://IP_DEL_SERVIDOR:8000",
            "station_name": "Simulador 1",
            "ac_path": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa",
            "steam_app_id": 244210
        }
        ```
    *   **Importante**: `server_url` debe apuntar a la IP del PC de Recepción.
3.  **Arranque**:
    *   Ejecutar `main.py` (o crear un acceso directo al `.bat` de inicio) en cada simulador.
    *   El agente se conectará automáticamente y aparecerá como "Online" en el Dashboard.

---

## 3. Operación Diaria (Dashboard)

### Panel Principal
El Dashboard muestra el estado de todos los simuladores en tiempo real:
*   **Estado**: Online (Verde), Offline (Gris), En Sesión (Azul).
*   **Hardware**: Monitorización de CPU, GPU, y **periféricos conectados** (Volante/Pedales detectados).

### Iniciar una Sesión
1.  Pulsar en **"Lanzamiento"** (cohete) para despliegue masivo, o hacer clic en una estación individual.
2.  **Seleccionar Piloto y Coche/Circuito**: Elegir de la lista de contenido disponible.
3.  **Configuración de Modo**:
    *   **Pantalla**: El sistema usará la configuración gráfica optimizada para monitor/TV (`SINGLE_SCREEN`). **No modifica** tus ajustes de calidad gráficos manuales.
    *   **VR (Realidad Virtual)**: El sistema cambiará a modo `OCULUS`.
        *   *Nota*: La calidad gráfica en VR se lee del archivo `agent/vr_settings.json`. Puedes editar este archivo para ajustar sombras, reflejos, etc. a tu gusto.
4.  **Pago**: Seleccionar duración y método de pago (Efectivo, Tarjeta, Bizum).
5.  **Iniciar**: El comando se envía al simulador y el juego arranca automáticamente.

### Finalizar Sesión
*   La sesión termina automáticamente por tiempo.
*   Se puede forzar el cierre pulsando el botón de **Stop** en la tarjeta del simulador.

---

## 4. Gestión de Contenido y Hardware

### Mods (Coches y Circuitos)
Desde la sección **Gestión de Contenido**:
*   Arrastrar archivos `.zip` o `.rar` de mods a la zona de carga.
*   El servidor procesa, instala y **sincroniza** automáticamente el contenido con todos los simuladores conectados.

### Perfiles de Volante (FFB)
Desde **Perfiles de Volante**:
*   Crear perfiles presets (ej. "GT3 Fanatec", "F1 Logitech").
*   Define el contenido del archivo `controls.ini`.
*   Aplicar un perfil a uno o todos los simuladores con un clic.

### Modo Kiosko
*   Desde los ajustes de estación, se puede activar el **Bloqueo Kiosko**.
*   Esto cierra el Explorador de Windows en el simulador para evitar que los clientes toquen el sistema operativo.

---

## 5. Torneos y Competición

### Gestión de Torneos
1.  Crear un Torneo (ej. "Copa Mensual GT3").
2.  Definir Fases (Clasificatoria, Cuartos, Final).
3.  Asignar Pilotos a las sesiones.
4.  El sistema genera automáticamente los **Brackets** (Cuadros de enfrentamiento).

### Pantallas de TV (Broadcast)
El sistema ofrece varias vistas para pantallas externas en el local:
*   `/tv/leaderboard`: Tiempos en vivo y clasificación del torneo actual.
*   `/tv/ads`: Carrusel de publicidad a pantalla completa (imágenes/videos promocionales).
*   `/tv/hall-of-fame`: Récords históricos del circuito, rotando automáticamente por categorías (GT3, F1, Street).

---

## 6. Reportes y Telemetría

*   **Historial**: Ver todas las sesiones pasadas, ingresos y actividad.
*   **Telemetría**: Si está activo, el sistema recolecta tiempos de vuelta y consistencia. Se pueden exportar reportes PDF profesionales para los clientes con sus gráficas de rendimiento.
