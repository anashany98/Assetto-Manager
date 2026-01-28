@echo off
title Assetto Manager - Lanzador Maestro
echo ==========================================
echo    Assetto Manager - V1.0 GOLD EDITION
echo ==========================================
echo.

:: Detectar Directorio Raiz
set REPO_ROOT=%~dp0
cd /d %REPO_ROOT%

:: 1. Iniciar Base de Datos (SQLite)
echo [1/3] Verificando Base de Datos...
if not exist "backend\ac_manager.db" (
    echo Iniciando primera migracion...
)

:: 2. Lanzar Backend (Python/Uvicorn)
echo [2/3] Iniciando Servidor Backend (Puerto 8000)...
start /min "AM_BACKEND" cmd /c "cd backend && python -m uvicorn app.main:app --reload --port 8000"

:: 3. Lanzar Frontend (Vite)
echo [3/3] Iniciando Interfaz Frontend (Puerto 3010)...
start /min "AM_FRONTEND" cmd /c "cd frontend && npm run dev -- --port 3010"

echo.
echo ==========================================
echo   SISTEMA INICIADO CORRECTAMENTE
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3010
echo ==========================================
echo.
echo Presiona cualquier tecla para cerrar el lanzador (los servicios seguiran activos en segundo plano).
pause > nul
exit
