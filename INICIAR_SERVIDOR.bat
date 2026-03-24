@echo off
title AC Manager - Servidor
color 0A
chcp 65001 >nul 2>&1

set "REPO_ROOT=%~dp0"
cd /d "%REPO_ROOT%"

if not exist ".installed" (
    echo  [AVISO] El sistema no ha sido instalado todavia.
    echo  Ejecuta primero: SETUP_CLIENTE.bat
    echo.
    pause
    exit /b 1
)

:: Detectar Python del venv
set "PY_EXE=.venv\Scripts\python.exe"
if not exist "%PY_EXE%" set "PY_EXE=python"

:: Leer workers del .env
for /f "tokens=2 delims==" %%v in ('findstr /i "UVICORN_WORKERS" backend\.env 2^>nul') do set "WORKERS=%%v"
if "!WORKERS!"=="" set "WORKERS=1"

echo.
echo  Iniciando AC Manager...
echo  Panel admin: http://localhost:8000
echo.

start /min "ACManager-Backend" cmd /c ^
  "cd /d %REPO_ROOT% && call .venv\Scripts\activate && python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul
start "" "http://localhost:8000"

echo  Servidor iniciado. Puedes cerrar esta ventana.
echo  Para detener el servidor cierra la ventana "ACManager-Backend".
echo.
pause
