# Protocolo WebSocket

Este documento describe el protocolo de comunicación WebSocket usado en AC-Manager para la comunicación en tiempo real entre el servidor backend y los clientes (frontend y agentes).

## Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `ws://localhost:8000/ws/telemetry/client` | Cliente (Frontend) |
| `ws://localhost:8000/ws/telemetry/agent` | Agente (Simulador) |

## Autenticación

### Opción 1: Token en Query String

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/telemetry/client?token=wstest');
```

### Opción 2: Frame de Identificación

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/telemetry/client');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'identify',
    token: 'wstest'
  }));
};
```

**Nota:** Esta opción solo funciona si `ALLOW_WS_TOKEN_QUERY=false`.

## Protocolo de Mensajes

### Tipos de Mensajes

#### Cliente → Servidor

| Tipo | Descripción |
|------|-------------|
| `identify` | Identificación inicial |
| `ping` | Keep-alive |
| `telemetry` | Datos de telemetría del cliente |

#### Servidor → Cliente

| Tipo | Descripción |
|------|-------------|
| `identify_ack` | Acknowledgment de identificación |
| `pong` | Respuesta a ping |
| `lobby_update` | Actualización del lobby |
| `session_update` | Actualización de sesión |
| `command` | Comando a ejecutar |

---

## Comandos (Servidor → Agente)

El servidor envía comandos al agente para controlar el simulador.

### Estructura del Comando

```json
{
  "command": "launch_session",
  "command_id": "uuid-v4",
  "station_id": 1,
  "ac_path": "D:\\AssettoCorsa",
  "car": "ks_ferrari_fxx_k",
  "track": "orion_speedway",
  "track_layout": "free_practice",
  "driver_name": "Piloto 1",
  "weather": "sunny",
  "timestamp": 1705312800
}
```

### Comandos Disponibles

| Comando | Descripción | Parámetros |
|---------|-------------|------------|
| `launch_session` | Iniciar Assetto Corsa | `ac_path`, `car`, `track`, `driver_name` |
| `stop_session` | Detener Assetto Corsa | - |
| `create_lobby` | Crear lobby multiplayer | `port`, `car`, `track`, `max_players` |
| `join_lobby` | Unirse a lobby | `host_ip`, `port`, `car`, `driver_name` |
| `stop_lobby` | Abandonar lobby | - |
| `set_weather` | Cambiar clima | `weather` |
| `set_controls` | Sobrescribir controls.ini | `content` |
| `lock` | Bloquear estación | - |
| `unlock` | Desbloquear estación | - |
| `redirect` | Redireccionar a contenido | `target` |

### Acknowledgment del Agente

El agente debe confirmar la recepción del comando:

```json
{
  "command_id": "uuid-v4",
  "command": "launch_session",
  "status": "accepted",
  "station_id": 1
}
```

**Estados posibles:**
- `accepted`: Comando aceptado
- `completed`: Comando ejecutado exitosamente
- `error`: Error al ejecutar el comando

---

## Telemetría

### Envío de Telemetría (Agente → Servidor)

```json
{
  "type": "telemetry",
  "station_id": 1,
  "data": {
    "speed": 245.5,
    "rpm": 8500,
    "gear": 5,
    " throttle": 0.8,
    "brake": 0.0,
    "lap": 3,
    "lap_time": 95432,
    "best_lap": 95123,
    "position": 2
  }
}
```

### Recepción de Telemetría (Servidor → Cliente)

```json
{
  "type": "session_telemetry",
  "station_id": 1,
  "driver_name": "Piloto 1",
  "track": "orion_speedway",
  "speed": 245.5,
  "lap": 3,
  "position": 2
}
```

---

## Manejo de Conexión

### Heartbeat

El cliente debe enviar ping periódicamente:

```javascript
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

### Reconexión

En caso de desconexión:

1. Esperar 5 segundos
2. Reconectar con el mismo token
3. Volver a enviar identificación
4. Solicitar resincronización de estado

### Cola de Comandos Pendientes

Si el agente se desconecta durante la ejecución de un comando, el servidor guarda el comando en una cola:

```json
{
  "command_id": "uuid-v4",
  "command": "launch_session",
  "station_id": 1,
  "status": "pending",
  "timestamp": 1705312800
}
```

Al reconectarse, el agente puede consultar comandos pendientes:

```bash
GET /ws/commands/pending?station_id=1
```

---

## Ejemplos de Uso

### Conexión del Cliente (JavaScript)

```javascript
class TelemetryClient {
  constructor(url, token) {
    this.url = `${url}?token=${token}`;
    this.ws = null;
    this.reconnectDelay = 5000;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('Connected to telemetry server');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      console.log('Disconnected, reconnecting...');
      setTimeout(() => this.connect(), this.reconnectDelay);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'identify_ack':
        console.log('Authenticated');
        break;
      case 'session_update':
        this.updateSession(data);
        break;
      case 'lobby_update':
        this.updateLobby(data);
        break;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

// Uso
const client = new TelemetryClient(
  'ws://localhost:8000/ws/telemetry/client',
  'your_token_here'
);
client.connect();
```

### Conexión del Agente (Python)

```python
import asyncio
import websockets
import json

class AgentClient:
    def __init__(self, station_id: int, token: str):
        self.station_id = station_id
        self.token = token
        self.ws = None
        self.command_acks = {}

    async def connect(self):
        uri = f"ws://localhost:8000/ws/telemetry/agent?token={self.token}"
        async with websockets.connect(uri) as websocket:
            self.ws = websocket
            
            await websocket.send(json.dumps({
                "type": "identify",
                "station_id": self.station_id
            }))
            
            await self.receive_loop()

    async def receive_loop(self):
        async for message in self.ws:
            data = json.loads(message)
            
            if data.get("type") == "command":
                await self.handle_command(data)
            elif data.get("type") == "ping":
                await self.ws.send(json.dumps({"type": "pong"}))

    async def handle_command(self, command):
        command_id = command.get("command_id")
        
        try:
            if command["command"] == "launch_session":
                # Ejecutar comando
                await self.execute_launch(command)
                status = "completed"
            else:
                status = "completed"
                
            await self.ws.send(json.dumps({
                "command_id": command_id,
                "command": command["command"],
                "status": status,
                "station_id": self.station_id
            }))
        except Exception as e:
            await self.ws.send(json.dumps({
                "command_id": command_id,
                "command": command["command"],
                "status": "error",
                "detail": str(e),
                "station_id": self.station_id
            }))

    async def execute_launch(self, command):
        # Implementar lógica de lanzamiento
        pass

# Uso
agent = AgentClient(station_id=1, token="agent_token")
asyncio.run(agent.connect())
```

---

## Configuración

### Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `WS_COMMAND_ACK_TIMEOUT_SECONDS` | Timeout para ACK de comando | 10 |
| `WS_COMMAND_LAUNCH_ACK_TIMEOUT_SECONDS` | Timeout para ACK de lanzamiento | 30 |
| `PUBLIC_WS_TOKEN` | Token público para WebSocket | - |
| `ALLOW_WS_TOKEN_QUERY` | Permitir token en query string | true |
| `WS_PUBSUB` | Backend para pubsub (redis/memory) | memory |

---

## Códigos de Cierre

| Código | Descripción |
|--------|-------------|
| 1000 | Conexión normal |
| 1001 | Cliente se fue |
| 1008 | Error de protocolo |
| 1011 | Error interno del servidor |
