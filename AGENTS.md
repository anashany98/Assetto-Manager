# AC-MANAGER - Agent Coding Guidelines

## Project Overview

AC-MANAGER is a central server system for managing Assetto Corsa simulators in arcade/bar environments. It consists of:
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (in Docker)
- **Frontend**: React 19 + TypeScript + Vite + Tailwind
- **Agent**: Python client for simulators

---

## Build/Lint/Test Commands

### Frontend (React + TypeScript)

```bash
cd frontend

# Development
npm run dev                    # Start dev server at localhost:3010
npm run build                  # Production build
npm run build:check            # TypeScript check + build

# Linting
npm run lint                   # Run ESLint
npx eslint src/file.tsx        # Lint specific file
npx eslint --fix src/file.tsx # Fix auto-fixable issues

# Testing
npm test                       # Run vitest (watch mode)
npm test -- --run             # Run once (CI mode)
npm test -- --run src/__tests__/auth.test.ts     # Single test file
npm test -- --run -t "test name"                 # Single test by name

# E2E Testing
npm run test:e2e               # Playwright tests
```

### Backend (FastAPI + Python)

```bash
cd backend

# Run server (requires PostgreSQL in Docker)
python -m uvicorn app.main:app --reload --port 8000

# Testing
pytest                         # Run all tests
pytest tests/test_auth_flow.py            # Single test file
pytest tests/test_auth_flow.py::test_login -v  # Single test function
pytest -k "test_login" -v                  # Tests matching pattern
pytest --cov=app --cov-report=html         # With coverage

# Linting (if Ruff installed)
ruff check app/
ruff check --fix app/
```

### Docker (Production)

```bash
# Start all services (PostgreSQL + Backend + Frontend)
docker compose -f docker-compose.prod.yml up -d

# Stop services (preserves data)
docker compose -f docker-compose.prod.yml down

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## Code Style Guidelines

### Frontend (TypeScript + React)

#### Imports
- Use absolute imports from `@/` (configured in tsconfig)
- Group imports: React/std-lib → external libs → internal components → utils
- Prefer named exports

```typescript
// Good
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';

// Avoid
import * as React from 'react';
import '../components/Button';
```

#### Naming
- **Components**: PascalCase (`Dashboard.tsx`, `StationCard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useTelemetry.ts`, `useAuth.ts`)
- **Types/Interfaces**: PascalCase, suffix with `Type` or `Props` if needed
- **Constants**: UPPER_SNAKE_CASE for configs, camelCase for others

#### Types
- Use explicit types for props, function returns
- Use `interface` for object shapes, `type` for unions/intersections
- Avoid `any`, use `unknown` when type is truly unknown

```typescript
// Good
interface StationProps {
  id: number;
  name: string;
  status: 'online' | 'offline' | 'racing';
}

type StationStatus = 'online' | 'offline' | 'racing';

// Avoid
interface Props { ... }  // Too vague
const data: any = ...    // No type safety
```

#### Error Handling
- Use try/catch with proper error boundaries
- Display user-friendly errors via toast/sonner
- Log errors to console in development

```typescript
try {
  await api.getStation(id);
} catch (error) {
  console.error('Failed to load station:', error);
  toast.error('Error loading station details');
}
```

#### React Patterns
- Use functional components with hooks
- Prefer composition over inheritance
- Memoize expensive computations with `useMemo`/`useCallback`
- Keep components focused (single responsibility)

---

### Backend (Python + FastAPI)

#### Imports
- Standard library → third-party → local application
- Use absolute imports (`from app.routers import stations`)

```python
# Good
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

# Avoid
from ...routers import stations  # Relative import
import sys
sys.path.insert(0, '...')
```

#### Naming
- **Functions**: snake_case (`def get_station_by_id`)
- **Classes**: PascalCase (`class StationService`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_SESSION_DURATION`)
- **Database Models**: PascalCase singular (`class Station(Base)`)

#### Types (Pydantic)
- Use Pydantic models for request/response validation
- Use `Optional[X]` instead of `X | None`
- Add docstrings for complex functions

```python
# Good
class StationResponse(BaseModel):
    id: int
    name: str
    status: Literal["online", "offline", "racing"]
    ip_address: Optional[str] = None

# Avoid
class StationResponse(BaseModel):  # Missing field types
    pass
```

#### Error Handling
- Raise HTTPException with appropriate status codes
- Use custom exception handlers in `main.py`
- Log errors with proper log levels

```python
# Good
from fastapi import HTTPException

async def get_station(station_id: int):
    station = await db.get(Station, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station

# Avoid
if not station:
    return {"error": "not found"}  # Inconsistent response format
```

#### Database
- Use SQLAlchemy ORM with async where possible
- Always use dependency injection for `get_db`
- Add indexes on frequently queried columns

---

## Docker Environment

The project uses Docker Compose for production. Key services:
- **db**: PostgreSQL 16 (ports not exposed externally)
- **backend**: FastAPI on port 8000
- **frontend**: Nginx on port 80
- **redis**: Caching and pub/sub

To run locally:
```bash
start_local.bat   # Windows: starts all services
stop_local.bat    # Windows: stops services
backup_db.bat     # Windows: creates SQL backup
```

---

## Key Files and Locations

| Path | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app entry point |
| `backend/app/models.py` | SQLAlchemy ORM models |
| `backend/app/routers/` | API endpoints (40+ routers) |
| `frontend/src/pages/` | React page components |
| `frontend/src/components/` | Reusable UI components |
| `frontend/src/api/` | API client functions |
| `docker-compose.prod.yml` | Production Docker config |
| `.env` | Environment variables |

---

## Common Development Tasks

### Add new API endpoint
1. Create/edit router in `backend/app/routers/`
2. Add Pydantic schemas in `app/schemas.py` if needed
3. Register router in `app/main.py`
4. Add tests in `tests/`

### Add new Frontend page
1. Create component in `src/pages/`
2. Add route in `src/App.tsx`
3. Create API client in `src/api/`
4. Add tests in `src/__tests__/`

### Database migration
```bash
cd backend
alembic revision --autogenerate -m "migration_name"
alembic upgrade head
```