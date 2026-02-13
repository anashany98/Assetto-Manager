@echo off
TITLE Assetto Manager - PRODUCCION (Puerto 8000)

cd /d "%~dp0.."

echo ===================================================
echo   ASSETTO MANAGER - MODO PRODUCCION NO DESATENDIDO
echo ===================================================
echo.

IF NOT EXIST "frontend\dist" (
    echo [ERROR] No se encuentra la carpeta 'frontend\dist'.
    echo Ejecutando 'npm run build' primero...
    echo.
    cd frontend
    if not exist node_modules (
        call npm install
    )
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo [FATAL] Error compilando el frontend.
        pause
        exit /b 1
    )
    cd ..
)

echo Iniciando servidor en http://localhost:8000 ...
echo (Usa Ctrl+C para detener)
echo.

cd /d "%~dp0.."
call .venv\Scripts\activate.bat

set ENVIRONMENT=production
set REQUIRE_SECRETS=true
if "%UVICORN_WORKERS%"=="" set UVICORN_WORKERS=1
if "%ENABLE_SCHEDULER%"=="" set ENABLE_SCHEDULER=true

set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"

echo.
echo Validando configuracion de produccion...
%PY_EXE% -c "from backend.app.main import _validate_runtime_config; _validate_runtime_config()" || exit /b 1


:: Abrir navegador tras 3 segundos (en paralelo)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8000"

:: Ejecutar Uvicorn optimizado para produccion
:: - Workers: usa UVICORN_WORKERS (por defecto 1; multi-worker requiere Redis WS pubsub)
:: - Host: 0.0.0.0 (para aceptar conexiones externas)
:: - Port: 8000 (puerto estandar de esta app)
%PY_EXE% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers %UVICORN_WORKERS%

pause
