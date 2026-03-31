# Despliegue Local (LAN) - AC Manager

Guía paso a paso para desplegar AC Manager en un local con simuladores.

## Requisitos

| Componente | Versión mínima | Notas |
|------------|----------------|-------|
| Python | 3.10+ | El backend requiere async/await |
| Node.js | 18+ | Para construir el frontend |
| PostgreSQL | 14+ | **Obligatorio** para producción |
| Redis | 6+ | Opcional, mejora WS multi-worker |

## Estructura de red esperada

```
[Servidor]  192.168.1.10  ← Backend + Frontend + PostgreSQL
[Sim 1]     192.168.1.21  ← Agent + Assetto Corsa
[Sim 2]     192.168.1.22  ← Agent + Assetto Corsa
[Sim 3]     192.168.1.23  ← Agent + Assetto Corsa
[Sim 4]     192.168.1.24  ← Agent + Assetto Corsa
```

---

## 1. Instalar PostgreSQL

### Windows
1. Descargar: https://www.postgresql.org/download/windows/
2. Instalar con puerto **5432**
3. Crear usuario y base de datos:

```sql
CREATE USER ac_manager WITH PASSWORD 'TU_PASSWORD_AQUI';
CREATE DATABASE ac_manager OWNER ac_manager;
GRANT ALL PRIVILEGES ON DATABASE ac_manager TO ac_manager;
```

### Verificar conexión
```bash
psql -U ac_manager -d ac_manager -h localhost
```

---

## 2. Configurar el servidor

### 2.1 Copiar y editar `.env`

```bash
cd backend
cp .env.example .env
```

Editar `backend/.env` con los valores mínimos:

```env
# ── Base de datos ──
DATABASE_URL=postgresql://ac_manager:TU_PASSWORD_AQUI@localhost:5432/ac_manager
ENVIRONMENT=production
REQUIRE_SECRETS=true

# ── Generar claves seguras ──
SECRET_KEY=<generar_con: python -c "import secrets; print(secrets.token_urlsafe(48))">
SETUP_TOKEN=<generar_con: python -c "import secrets; print(secrets.token_hex(16))">
AGENT_TOKEN=<generar_con: python -c "import secrets; print(secrets.token_hex(16))">
UPDATE_SIGNING_KEY=<generar_con: python -c "import secrets; print(secrets.token_hex(32))">

# ── CORS (IP del servidor en la LAN) ──
ALLOWED_ORIGINS=http://192.168.1.10:8000

# ── Tokens públicos (para kioscos y TV) ──
PUBLIC_API_TOKEN=<generar_con: python -c "import secrets; print(secrets.token_hex(16))">
PUBLIC_WS_TOKEN=<generar_con: python -c "import secrets; print(secrets.token_hex(16))">

# ── WebSocket ──
ALLOW_WS_TOKEN_QUERY=false

# ── Puerto ──
UVICORN_WORKERS=1
```

### 2.2 Instalar dependencias backend

```bash
cd backend
python -m venv ../.venv
../.venv/Scripts/pip install -r requirements.txt
```

### 2.3 Ejecutar migraciones

```bash
cd backend
../.venv/Scripts/python -m alembic upgrade head
```

### 2.4 Crear usuario admin

```bash
../.venv/Scripts/python -c "
from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash
db = SessionLocal()
db.add(User(username='admin', hashed_password=get_password_hash('TU_PASSWORD_ADMIN'), role='admin', is_active=True))
db.commit()
print('Admin creado')
"
```

### 2.5 Construir frontend

```bash
cd frontend
npm install
npm run build
```

---

## 3. Iniciar el servidor

```bash
cd backend
../.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Abrir navegador: `http://192.168.1.10:8000`

---

## 4. Configurar cada simulador

En cada máquina de simulador:

### 4.1 Copiar y editar `agent/config.json`

```bash
cd agent
cp config.json.example config.json
```

Editar `agent/config.json`:

```json
{
    "server_url": "http://192.168.1.10:8000",
    "ac_content_dir": "D:/SteamLibrary/steamapps/common/assettocorsa/content",
    "ac_path": "D:/SteamLibrary/steamapps/common/assettocorsa",
    "station_name": "SIM-01",
    "mac_address": "XX:XX:XX:XX:XX:XX",
    "agent_token": "EL_AGENT_TOKEN_DEL_ENV"
}
```

| Campo | Valor |
|-------|-------|
| `server_url` | IP del servidor (192.168.1.10:8000) |
| `ac_content_dir` | Ruta al contenido de AC en esta máquina |
| `ac_path` | Ruta al ejecutable de AC |
| `station_name` | Nombre único (SIM-01, SIM-02, etc.) |
| `mac_address` | MAC de la placa de red (ipconfig /all) |
| `agent_token` | El mismo `AGENT_TOKEN` del `.env` del servidor |

### 4.2 Iniciar agente

```bash
cd agent
python main.py
```

---

## 5. Verificar despliegue

Ejecutar el script de validación desde el servidor:

```bash
python scripts/validate_deploy.py http://192.168.1.10:8000
```

O verificar manualmente:

| Check | URL | Esperado |
|-------|-----|----------|
| Backend vivo | `http://IP:8000/health/live` | `{"status":"ok"}` |
| DB conectada | `http://IP:8000/health` | `"db":"ok"` |
| Agents online | Dashboard → Estaciones | 4 estaciones online |
| WS conectado | Dashboard → indicador verde | Conectado |

---

## 6. Troubleshooting

| Problema | Causa probable | Solución |
|----------|---------------|---------|
| "DATABASE_URL is required" | `.env` no cargado | Verificar que `backend/.env` existe |
| Agent no conecta | IP incorrecta en config | Verificar `server_url` en agent |
| CORS error | `ALLOWED_ORIGINS` incorrecto | Añadir IP del cliente a origins |
| WS no conecta | Token inválido | Verificar `PUBLIC_WS_TOKEN` |
| DB connection refused | PostgreSQL no escucha | `pg_hba.conf` permite conexiones LAN |

### PostgreSQL acceso LAN
Editar `pg_hba.conf` (ubicación: `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`):

```
# Añadir al final:
host    ac_manager    ac_manager    192.168.1.0/24    scram-sha-256
```

Reiniciar PostgreSQL después del cambio.
