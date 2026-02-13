@echo off
TITLE Assetto Corsa Manager - SERVER

cd /d "%~dp0.."

set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"


echo Starting Backend...
start "AC Backend" cmd /k "cd /d \"%~dp0..\" && call .venv\Scripts\activate.bat && %PY_EXE% -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"

echo Starting Frontend...
start "AC Frontend" cmd /k "cd frontend && if not exist node_modules (call npm install) && npm run dev"

echo Waiting for services to start...
timeout /t 5

echo Opening Web Interface...
start http://localhost:3010

echo SERVER STARTED.
pause
