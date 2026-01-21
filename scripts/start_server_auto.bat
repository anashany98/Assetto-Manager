@echo off
TITLE Assetto Corsa Manager - SERVER

cd /d "%~dp0.."

echo Starting Backend...
start "AC Backend" cmd /k "cd backend && call .venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo Starting Frontend...
start "AC Frontend" cmd /k "cd frontend && npm run dev"

echo Waiting for services to start...
timeout /t 5

echo Opening Web Interface...
start http://localhost:5959

echo SERVER STARTED.
pause
