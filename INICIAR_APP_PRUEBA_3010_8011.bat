@echo off
setlocal
title AC Manager - Prueba Local (3010/8011)
color 0A

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ==========================================
echo   AC Manager - Modo Prueba Local
echo ==========================================
echo.

set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"

echo Iniciando Backend en puerto 8011...
start "" /min cmd /c "cd /d \"%ROOT%\" && %PY_EXE% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8011"

echo Iniciando Frontend en puerto 3010...
start "" /min cmd /c "cd /d \"%ROOT%frontend\" && set VITE_API_URL=http://127.0.0.1:8011 && npm run dev -- --host 0.0.0.0 --port 3010"

echo.
echo Frontend: http://localhost:3010
echo Backend : http://127.0.0.1:8011
echo.
echo Si ya habia procesos en esos puertos, cierra con:
echo   DETENER_APP_PRUEBA_3010_8011.bat
echo.
pause

