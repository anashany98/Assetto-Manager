@echo off
title Assetto Manager - Lanzador Maestro (PROD)
echo ==========================================
echo    Assetto Manager - PRODUCTION
echo ==========================================
echo.

:: Detectar Directorio Raiz
set REPO_ROOT=%~dp0
cd /d %REPO_ROOT%

set ENVIRONMENT=production
set REQUIRE_SECRETS=true
if "%UVICORN_WORKERS%"=="" set UVICORN_WORKERS=1
if "%ENABLE_SCHEDULER%"=="" set ENABLE_SCHEDULER=true

set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"


:: Validar configuración crítica antes de arrancar
%PY_EXE% -c "from backend.app.main import _validate_runtime_config; _validate_runtime_config()" || exit /b 1

:: 1. Build Frontend
echo [1/2] Compilando Frontend...
cd frontend
if not exist node_modules (
    call npm install
)
call npm run build
cd ..

:: 2. Lanzar Backend (Python/Uvicorn)
echo [2/2] Iniciando Servidor Backend (Puerto 8000)...
start /min "AM_BACKEND" cmd /c "%PY_EXE% -m uvicorn backend.app.main:app --port 8000 --host 0.0.0.0 --workers %UVICORN_WORKERS%"

echo.
echo ==========================================
echo   SISTEMA INICIADO CORRECTAMENTE (PROD)
echo   Backend:  http://localhost:8000
echo ==========================================
echo.
echo Presiona cualquier tecla para cerrar el lanzador (el backend seguira activo en segundo plano).
pause > nul
exit
