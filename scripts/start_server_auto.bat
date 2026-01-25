@echo off
TITLE Assetto Corsa Manager - SERVER

cd /d "%~dp0.."

echo Starting Backend...
start "AC Backend" cmd /k "cd /d \"%~dp0..\" && call .venv\Scripts\activate.bat && python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"

echo Starting Frontend...
start "AC Frontend" cmd /k "cd frontend && npm run dev"

echo Waiting for services to start...
timeout /t 5

echo Opening Web Interface...
start http://localhost:3010

echo SERVER STARTED.
pause
