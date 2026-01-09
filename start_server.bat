@echo off
title AC Manager - CENTRAL SERVER
color 0A

echo ===================================================
echo    ASSETTO MANAGER - CENTRAL SERVER
echo ===================================================
echo.
echo Starting Backend on 0.0.0.0:8000...
echo (Keep this window open)
echo.

cd /d "%~dp0"
call .venv\Scripts\activate.bat || echo Venv not found, trying system python...

start "AC Backend" python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000

echo.
echo Starting Frontend...
cd frontend
start "AC Frontend" npm run dev -- --host

echo.
echo SYSTEM RUNNING.
echo Access web panel at: http://localhost:5173
echo.
pause
