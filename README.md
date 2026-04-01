# AC-MANAGER

Sistema de gestión centralizada para simuladores de Assetto Corsa en entornos Arcade/Bar. Permite controlar múltiples estaciones de simulación, gestionar sesiones de juego, organizar torneos, y analizar métricas de negocio desde un panel web unificado.

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-20232A?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql)](https://www.postgresql.org/)
[![Tests](https://img.shields.io/badge/Tests-86%20passing-brightgreen)](./backend/tests/)

---

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                       │
│  Dashboard · Kiosk · Analytics · Bookings · TV Mode          │
│  Admin Panel · Leaderboards · Events · Mods                  │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP REST + WebSocket
┌───────────────────────▼──────────────────────────────────────┐
│                   Backend (FastAPI)                          │
│  API REST (40+ endpoints) · WebSocket · Auth JWT             │
│  Sessions · Analytics · Loyalty · Payments · Hardware        │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│              PostgreSQL + Redis (Docker)                     │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│              Agent (Python) - Por Estación                   │
│  Hardware Monitor · Content Sync · Telemetry · Launcher      │
└──────────────────────────────────────────────────────────────┘
```

## 📂 Estructura del Proyecto

```
AC-MANAGER/
├── backend/                 # FastAPI + SQLAlchemy + PostgreSQL
│   ├── app/
│   │   ├── main.py          # Entry point FastAPI
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── auth.py          # JWT authentication
│   │   ├── routers/         # API endpoints (40+ routers)
│   │   ├── services/        # Business logic
│   │   ├── security/        # Permissions, API keys, licenses
│   │   └── utils/           # Caching, hashing helpers
│   ├── alembic/             # Database migrations
│   └── tests/               # Pytest tests (49 passing)
│
├── frontend/                # React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable UI components
│   │   ├── api/             # API client functions
│   │   ├── hooks/           # Custom React hooks
│   │   ├── contexts/        # React contexts (auth, theme)
│   │   └── utils/           # Helper utilities
│   ├── e2e/                 # Playwright E2E tests (10 specs)
│   └── src/__tests__/       # Vitest unit tests (37 passing)
│
├── agent/                   # Python client per simulator station
│   ├── main.py              # Entry point
│   ├── monitor.py           # Hardware monitoring
│   ├── sync.py              # Content synchronization
│   ├── telemetry.py         # Real-time telemetry
│   └── launcher.py          # Assetto Corsa launcher
│
├── docker-compose.prod.yml  # Production Docker config
├── docker-compose.yml       # Development Docker config
└── scripts/                 # Deployment and utility scripts
```

---

## 🚀 Inicio Rápido

### Requisitos

- **Python 3.11+**
- **Node.js 20+**
- **Docker + Docker Compose** (para PostgreSQL + Redis)

### 1. Backend

```bash
cd backend

# Crear entorno virtual
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Linux/Mac

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tu DATABASE_URL

# Ejecutar migraciones
alembic upgrade head

# Iniciar servidor
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
# Abre http://localhost:3010
```

### 3. Docker (Producción)

```bash
# Iniciar todos los servicios
docker compose -f docker-compose.prod.yml up -d

# Ver logs
docker compose -f docker-compose.prod.yml logs -f

# Detener servicios
docker compose -f docker-compose.prod.yml down
```

### 4. Agent (Por Estación)

```bash
cd agent

# Configurar
cp config.example.json config.json
# Editar config.json con la IP del servidor

# Ejecutar
python main.py
```

---

## 🧪 Testing

### Backend

```bash
cd backend

# Todos los tests
pytest

# Tests específicos
pytest tests/test_analytics.py -v
pytest tests/test_loyalty.py -v
pytest tests/test_auth_flow.py -v

# Con cobertura
pytest --cov=app --cov-report=html
```

### Frontend

```bash
cd frontend

# Unit tests
npm test

# Tests una vez
npm test -- --run

# E2E tests
npm run test:e2e
```

---

## 📊 Características

| Módulo | Descripción |
|--------|-------------|
| **Dashboard** | Vista general de estaciones, sesiones activas, estadísticas en tiempo real |
| **Kiosk Mode** | Interfaz táctil para clientes: selección de escenario, perfil, pago |
| **Analytics** | Métricas de negocio: ingresos, ocupación, horas pico, métodos de pago |
| **Sessions** | Gestión de sesiones: inicio, parada, ampliación de tiempo, historial |
| **Events** | Torneos y competiciones: brackets, eliminación, TV mode |
| **Bookings** | Sistema de reservas online para simuladores y mesas |
| **Loyalty** | Programa de fidelidad: puntos, tiers, canje de recompensas |
| **Leaderboard** | Clasificaciones: mejores vueltas, ranking ELO, Hall of Fame |
| **Mods** | Biblioteca de mods: coches, tracks, skins, despliegue a estaciones |
| **Hardware** | Monitor de hardware: uso de volante, pedales, VR, PC |
| **Profiles** | Perfiles de volante: FFB, settings, despliegue masivo |
| **Payments** | Integración de pagos: Stripe, Bizum, TPV Nayax, efectivo |

---

## ⌨️ Atajos de Teclado (Dashboard)

| Tecla | Acción |
|-------|--------|
| `1` | Vista General |
| `2` | Analíticas |
| `L` | Lanzamiento Masivo |
| `Ctrl+R` | Actualizar datos |
| `?` | Mostrar atajos |
| `Esc` | Cerrar modales |

---

## 🔐 Seguridad

- **Autenticación JWT** con tokens por rol (admin, agent, public)
- **Rate limiting** en login y endpoints públicos
- **Token blacklist** para revocación
- **WebSocket auth** requerido por defecto
- **CORS** configurable por origen

---

## 📖 Documentación

| Documento | Descripción |
|-----------|-------------|
| [Production Deployment](docs/DEPLOYMENT_PROD.md) | Guía de despliegue en producción |
| [Agent Deploy](docs/AGENT_DEPLOY.md) | Instalación del agente en estaciones |
| [Reverse Proxy](docs/REVERSE_PROXY.md) | Configuración HTTPS con Caddy |
| [LAN Streaming](docs/LAN_LOW_LATENCY_STREAMING.md) | Streaming de baja latencia para LAN |
| [Manual de Operación](docs/MANUAL_OPERACION.md) | Guía completa de instalación |
| [Manual HTML](docs/MANUAL_COMPLETO.html) | Guía integral del sistema |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Recharts, React Query |
| **Backend** | FastAPI, SQLAlchemy, Pydantic, Alembic |
| **Base de Datos** | PostgreSQL 16, Redis |
| **Real-time** | WebSocket con pub/sub (Redis) |
| **Autenticación** | JWT con bcrypt |
| **Testing** | Pytest (backend), Vitest (frontend), Playwright (E2E) |
| **Deployment** | Docker Compose, Nginx |

---

## 📈 Métricas del Proyecto

| Métrica | Valor |
|---------|-------|
| Endpoints API | 40+ |
| Tests Backend | 49 |
| Tests Frontend | 37 |
| Tests E2E | 10 specs |
| Componentes React | 50+ |
| Modelos DB | 20+ |

---

## 🤝 Contribuir

1. Crea una rama feature (`git checkout -b feature/nueva-funcionalidad`)
2. Haz commit de tus cambios (`git commit -m 'feat: descripción'`)
3. Push a la rama (`git push origin feature/nueva-funcionalidad`)
4. Abre un Pull Request

### Estándares de Código

- **Frontend**: TypeScript estricto, componentes funcionales, Tailwind CSS
- **Backend**: Pydantic para validación, SQLAlchemy ORM, docstrings en funciones complejas
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `docs:`)
- **Tests**: Cobertura mínima del 80% para nuevas funcionalidades

---

## 📄 Licencia

Propietario - VRacing Bar

---

Desarrollado para **VRacing Bar** · [GitHub](https://github.com/anashany98/Assetto-Manager)
