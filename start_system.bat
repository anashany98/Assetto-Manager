@echo off
title Assetto Manager - Launcher
color 0a

echo ===================================================
echo   STARTING ASSETTO CORSA MANAGER
echo ===================================================
echo.

:: 1. Start Backend (Background)
echo [1/2] Starting Backend Server (Port 8000, 0.0.0.0)...
start "AC Manager Backend" /min cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: 2. Start Frontend
echo [2/2] Starting Frontend Interface...
start "AC Manager Frontend" /min cmd /k "cd frontend && npm run dev -- --host"

echo.
echo   System is running!
echo   > LOCAL ACCESS:   http://localhost:5173
echo   > NETWORK ACCESS: http://YOUR_PC_IP:5173 (Look for "Network" in Frontend window)
echo.
echo   > Access TV Mode: /tv?screen=1
echo   > Access Mobile:  /mobile
echo.
echo   (Don't close the black windows)
pause
