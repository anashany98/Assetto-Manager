# License Admin SaaS (Tenants + Licencias Por Modulos)

Este repo incluye un portal **separado** para emitir y administrar licencias offline (JWT RS256) por cliente (tenant) y por modulos.

Ruta: `tools/license-manager/`

## 1) Que Hace

1. Gestiona **tenants** (clientes).
2. Gestiona **usuarios** del portal (roles: `superadmin`, `tenant_admin`, `tenant_user`).
3. Emite **licencias** (JWT RS256) con `modules: [...]` y expiracion.
4. Permite **revocar** licencias (nota: AC-MANAGER valida offline; la revocacion solo afecta al portal a dia de hoy).

## 2) Requisitos

- Python 3.11+
- Dependencias ya presentes en `backend/requirements.txt` (FastAPI, SQLAlchemy, PyJWT, passlib)
- Claves RSA:
  - Privada: solo en el servidor del portal (firma).
  - Publica: en cada despliegue de AC-MANAGER (verificacion).

Por defecto:
- Privada: `certs/private_key.pem`
- Publica: `certs/public_key.pem`

## 3) Variables De Entorno (Portal)

- `LICENSE_ADMIN_BOOTSTRAP_TOKEN`
  - Token para crear el primer `superadmin` via `POST /api/auth/bootstrap`.
- `LICENSE_ADMIN_SECRET_KEY`
  - Secreto para firmar el token de sesion del portal (HS256). En `ENVIRONMENT=production` o `LICENSE_ADMIN_STRICT=true` es obligatorio y debe tener 32+ chars.
- `LICENSE_ADMIN_DATABASE_URL`
  - DB del portal. Default: sqlite `tools/license-manager/license_admin.db`.
  - Ejemplo Postgres: `postgresql+psycopg2://user:pass@host:5432/license_admin`
- `LICENSE_SIGNING_PRIVATE_KEY_PATH`
  - Path a la clave privada RSA para firmar licencias.
- `LICENSE_VERIFY_PUBLIC_KEY_PATH`
  - Path a la clave publica RSA (solo para exponerla via `/api/public-key`).

## 4) Arranque (Local)

1. Inicia el portal:
   - `start_admin.bat`
2. Abre:
   - `http://localhost:8800`
3. Crea el primer superadmin (una sola vez):
   - Usa el `curl` que aparece en la pantalla de login (requiere `LICENSE_ADMIN_BOOTSTRAP_TOKEN`).
4. Login, crea un tenant y emite una licencia seleccionando modulos.

## 5) Arranque En LAN

Uvicorn por defecto escucha en `127.0.0.1`. Para que sea accesible desde otras maquinas en la LAN:

```powershell
cd tools\license-manager
$env:LICENSE_ADMIN_BOOTSTRAP_TOKEN="cambia-esto"
$env:LICENSE_ADMIN_SECRET_KEY="pon-un-secreto-largo-de-32-chars-min"
py -m uvicorn backend:app --host 0.0.0.0 --port 8800
```

Tambien necesitas abrir el puerto 8800 en el firewall del servidor.

## 6) Activar Licencia En AC-MANAGER (Cliente)

1. Emite una licencia en el portal y copia el JWT.
2. En el AC-MANAGER del cliente:
   - UI: `Ajustes -> Licencia`
   - API: `POST /license` (requiere admin) con body `{ "key": "<JWT>" }`
3. El backend valida el token con la **public key** (RS256, `iss="VRacing Sim Center"`).

### Public Key (Cliente)

AC-MANAGER busca la public key en este orden:
1. `LICENSE_PUBLIC_KEY` (PEM como string)
2. `LICENSE_PUBLIC_KEY_PATH`
3. `certs/public_key.pem` (por defecto)

## 7) Modulos (Keys)

Las licencias guardan `modules: [...]`. Ejemplos de keys actuales:

- `dashboard`, `settings`, `users`, `stations`
- `mods`, `events`, `kiosk`
- `bookings`, `tables`, `analytics`, `online_reservations`
- `history`, `drivers`, `championships`
- `passport`, `lap_comparison`
- `leaderboard`, `hall_of_fame`, `tv`, `tv_remote`, `tv_spectator`, `live_map`, `battle`
- `*` (MASTER: habilita todo)

## 8) Notas Importantes (Seguridad)

1. No compartas la **clave privada** con clientes.
2. En produccion del portal, usa:
   - `ENVIRONMENT=production`
   - `LICENSE_ADMIN_SECRET_KEY` (32+ chars)
3. La revocacion es administrativa (portal). Si necesitas revocacion efectiva en clientes, hay que implementar validacion online (call-home) o licencias de corta duracion.

