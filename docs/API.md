# API de Desarrollo

El Backend expone una API RESTful documentada automáticamente con Swagger/OpenAPI.

## Acceso a la Documentación
Una vez iniciado el servidor backend, visite:
👉 **http://localhost:8000/docs**

Ahí encontrará la lista interactiva de todos los endpoints.

## Endpoints Principales

### Sesiones (`/sessions`)
*   `POST /sessions/start`: Inicia una nueva sesión. Requiere `station_id`, `car`, `track`, `duration`.
*   `POST /sessions/{id}/stop`: Detiene una sesión activa.
*   `GET /sessions/active`: Lista sesiones en curso (para el Dashboard).

### Estaciones (`/stations`)
*   `GET /stations/`: Lista de simuladores registrados.
*   `POST /stations/{id}/command`: Enviar comando arbitrario (JSON) vía WebSocket al agente.

### Torneos (`/tournaments`)
*   `POST /tournaments/`: Crear torneo.
*   `POST /tournaments/{id}/generate_bracket`: Generar cruces automáticamente.

---

## WebSockets
El sistema usa WebSockets para comunicación en tiempo real.
*   URL Agente: `ws://localhost:8000/ws/agent/{station_id}`
*   URL Cliente (Frontend): `ws://localhost:8000/ws/client/{client_id}`

### Protocolo de Comandos (Agente)
El servidor envía JSONs con `command`:
*   `launch_session`: Iniciar juego.
*   `stop_session`: Matar proceso.
*   `set_weather`: Cambiar clima.
*   `set_controls`: Sobrescribir `controls.ini`.
