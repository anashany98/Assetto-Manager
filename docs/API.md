# API de Desarrollo

El Backend expone una API RESTful documentada automáticamente con Swagger/OpenAPI.

## Acceso a la Documentación

Una vez iniciado el servidor backend, visite:
👉 **http://localhost:8000/docs**

Ahí encontrará la lista interactiva de todos los endpoints.

---

## Autenticación

El sistema usa JWT (JSON Web Tokens) para autenticación.

### Login

```bash
curl -X POST "http://localhost:8000/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"
```

**Respuesta:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
  "expires_in": 30
}
```

### Refresh Token

```bash
curl -X POST "http://localhost:8000/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."}'
```

### Logout

```bash
curl -X POST "http://localhost:8000/auth/logout" \
  -H "Authorization: Bearer <access_token>"
```

### Registro

```bash
curl -X POST "http://localhost:8000/register" \
  -H "Content-Type: application/json" \
  -d '{"username": "newuser", "password": "securepassword123"}'
```

---

## Códigos de Error

| Código | Descripción |
|--------|-------------|
| 200 | OK - Solicitud exitosa |
| 201 | Created - Recurso creado |
| 400 | Bad Request - Solicitud inválida |
| 401 | Unauthorized - Token inválido o expirado |
| 403 | Forbidden - Sin permisos |
| 404 | Not Found - Recurso no encontrado |
| 422 | Unprocessable Entity - Validación fallida |
| 429 | Too Many Requests - Rate limit excedido |
| 500 | Internal Server Error - Error del servidor |

---

## Endpoints Principales

### Sesiones (`/sessions`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/sessions/start` | Inicia una nueva sesión |
| GET | `/sessions/active` | Lista sesiones en curso |
| POST | `/sessions/{id}/stop` | Detiene una sesión activa |
| POST | `/sessions/{id}/add-time` | Agrega tiempo a una sesión |
| GET | `/sessions/{id}` | Obtiene detalles de una sesión |

#### Iniciar Sesión

```bash
curl -X POST "http://localhost:8000/sessions/start" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "driver_name": "Juan Pérez",
    "duration_minutes": 30,
    "is_vr": false
  }'
```

**Respuesta:**
```json
{
  "id": 1,
  "station_id": 1,
  "driver_name": "Juan Pérez",
  "duration_minutes": 30,
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T10:30:00Z",
  "status": "active",
  "price": 15.00,
  "remaining_minutes": 30.0
}
```

---

### Estaciones (`/stations`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/stations/` | Lista todas las estaciones |
| GET | `/stations/{id}` | Obtiene una estación por ID |
| POST | `/stations/` | Crea una nueva estación |
| PUT | `/stations/{id}` | Actualiza una estación |
| DELETE | `/stations/{id}` | Elimina una estación |
| POST | `/stations/{id}/command` | Envía comando al agente |
| POST | `/stations/{id}/kiosk-code` | Genera código de kiosk |

#### Listar Estaciones

```bash
curl -X GET "http://localhost:8000/stations/" \
  -H "Authorization: Bearer <token>"
```

---

### Lobby (`/lobby`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/lobby/create` | Crea un nuevo lobby |
| GET | `/lobby/{id}` | Obtiene detalles del lobby |
| POST | `/lobby/{id}/join` | Unirse a un lobby |
| POST | `/lobby/{id}/leave` | Abandonar un lobby |
| POST | `/lobby/{id}/ready` | Marcar como listo |
| POST | `/lobby/{id}/start` | Iniciar carrera |
| DELETE | `/lobby/{id}` | Cancelar lobby |

#### Crear Lobby

```bash
curl -X POST "http://localhost:8000/lobby/create" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Carrera Rápida",
    "track": "orion_speedway",
    "car": "ks_ferrari_fxx_k",
    "station_id": 1,
    "driver_name": "Piloto 1",
    "duration": 10,
    "max_players": 8,
    "laps": 5
  }'
```

---

### Pagos (`/payments`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/payments/checkout` | Crea un pago |
| GET | `/payments/{id}` | Obtiene estado del pago |
| POST | `/payments/{id}/webhook` | Webhook de confirmación |
| POST | `/payments/{id}/cancel` | Cancela un pago |
| POST | `/payments/{id}/refund` | Reembolsa un pago |

#### Crear Pago (Bizum)

```bash
curl -X POST "http://localhost:8000/payments/checkout" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "bizum",
    "station_id": 1,
    "duration_minutes": 30,
    "driver_name": "Juan Pérez",
    "is_vr": false
  }'
```

---

### Kiosk

El sistema soporta modo kiosk para estaciones de pago automático.

#### Acceso con Código de Kiosk

```bash
curl -X GET "http://localhost:8000/sessions/active" \
  -H "X-Kiosk-Code: KIOSK123"
```

#### Generación de Código

```bash
curl -X POST "http://localhost:8000/stations/1/kiosk-code" \
  -H "Authorization: Bearer <token>"
```

**Respuesta:**
```json
{
  "kiosk_code": "ABC123",
  "expires_at": "2024-01-16T10:00:00Z"
}
```

**Nota:** Los códigos de kiosk expiran después de 24 horas por defecto. Este tiempo es configurable mediante `KIOSK_CODE_TTL_HOURS`.

---

### Torneos (`/tournaments`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/tournaments/` | Crear torneo |
| GET | `/tournaments/` | Listar torneos |
| POST | `/tournaments/{id}/generate_bracket` | Generar cruces |

---

## WebSockets

El sistema usa WebSockets para comunicación en tiempo real.

### Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `/ws/telemetry/client` | Cliente/Frontend |
| `/ws/telemetry/agent` | Agente en simulador |

### Autenticación

```javascript
// Identificación del cliente
{
  "type": "identify",
  "token": "wstest"
}
```

### Protocolo de Comandos (Agente)

El servidor envía JSONs con `command`:

| Comando | Descripción |
|---------|-------------|
| `launch_session` | Iniciar juego |
| `stop_session` | Matar proceso |
| `set_weather` | Cambiar clima |
| `set_controls` | Sobrescribir controls.ini |
| `create_lobby` | Crear lobby multiplayer |
| `join_lobby` | Unirse a lobby |
| `stop_lobby` | Abandonar lobby |

### Ejemplo de Envío de Comando

```bash
# Enviar comando a estación
curl -X POST "http://localhost:8000/stations/1/command" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "launch_session",
    "ac_path": "D:\\AssettoCorsa",
    "car": "ks_ferrari_fxx_k",
    "track": "orion_speedway"
  }'
```

---

## Rate Limiting

El sistema implementa rate limiting para proteger la API.

| Endpoint | Límite |
|----------|--------|
| `/token` | 5 requests/minuto |
| `/auth/refresh` | 10 requests/minuto |
| General | 60 requests/minuto |

Si se excede el límite, se retorna:

```json
{
  "detail": "Rate limit exceeded: 5 per 1 minute"
}
```

---

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión a la base de datos | sqlite:///ac_manager.db |
| `SECRET_KEY` | Clave para JWT | - |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Expiración del token | 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Expiración del refresh token | 7 |
| `REDIS_URL` | URL de Redis | redis://localhost:6379 |
| `KIOSK_IDLE_TIMEOUT_SECONDS` | Timeout de inactividad del kiosk | 90 |
| `KIOSK_CODE_TTL_HOURS` | Expiración del código kiosk | 24 |
| `PUBLIC_API_TOKEN` | Token público sin autenticación | - |
| `BIZUM_RECEIVER` | Número de teléfono para Bizum | - |

---

## Ejemplos Completos

### Flujo de Pago Completo

```bash
# 1. Login
TOKEN=$(curl -s -X POST "http://localhost:8000/token" \
  -d "username=admin&password=admin123" | jq -r '.access_token')

# 2. Crear pago
PAYMENT=$(curl -s -X POST "http://localhost:8000/payments/checkout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "bizum",
    "station_id": 1,
    "duration_minutes": 30,
    "driver_name": "Juan Pérez",
    "is_vr": false
  }')

PAYMENT_ID=$(echo $PAYMENT | jq -r '.id')

# 3. Verificar estado
curl -X GET "http://localhost:8000/payments/$PAYMENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Flujo de Sesión

```bash
# 1. Iniciar sesión
SESSION=$(curl -s -X POST "http://localhost:8000/sessions/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "driver_name": "Piloto 1",
    "duration_minutes": 30,
    "is_vr": false
  }')

# 2. Ver sesión activa
curl -X GET "http://localhost:8000/sessions/active" \
  -H "Authorization: Bearer $TOKEN"

# 3. Agregar tiempo
curl -X POST "http://localhost:8000/sessions/1/add-time" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minutes": 15}'

# 4. Detener sesión
curl -X POST "http://localhost:8000/sessions/1/stop" \
  -H "Authorization: Bearer $TOKEN"
```
