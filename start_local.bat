@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   AC-MANAGER - Iniciar Servicios Local
echo ============================================
echo.

REM Verificar que Docker esté corriendo
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker no está corriendo. Por favor inicia Docker Desktop.
    pause
    exit /b 1
)

echo [1/4] Iniciando servicios con Docker Compose...
docker compose -f docker-compose.prod.yml up -d

echo.
echo [2/4] Esperando a que PostgreSQL esté listo...
timeout /t 20 /nobreak >nul

REM Verificar que PostgreSQL esté healthy
for /f "tokens=*" %%i in ('docker compose -f docker-compose.prod.yml ps db --format json ^| findstr "healthy"') do set PG_READY=1

if not defined PG_READY (
    echo ADVERTENCIA: PostgreSQL puede no estar completamente listo. Continuando...
)

echo.
echo [3/4] Verificando/Aplicando migraciones de base de datos...
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head 2>nul
if errorlevel 1 (
    echo      - Migraciones ya aplicadas o primera vez
)

echo.
echo [4/4] Verificando estado de servicios...
docker compose -f docker-compose.prod.yml ps

echo.
echo ============================================
echo   ¡Listo! 
echo.
echo   Frontend:   http://localhost
echo   Backend:    http://localhost:8000
echo   Swagger:    http://localhost:8000/docs
echo ============================================
echo.
pause
endlocal