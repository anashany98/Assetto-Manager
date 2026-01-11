@echo off
title Assetto Manager - Launcher
color 0a

echo ===================================================
echo   STARTING ASSETTO CORSA MANAGER
echo ===================================================
echo.

:: 1. Start Backend (Background)
echo [1/2] Starting Backend Server (Port 8000)...
start "AC Manager Backend" /min cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

:: 2. Start Frontend
echo [2/2] Starting Frontend Interface...
start "AC Manager Frontend" /min cmd /k "cd frontend && npm run dev"

echo.
echo   System is running!
echo   > Access Manager: http://localhost:5173
echo   > Access TV Mode: http://localhost:5173/tv
echo   > Access Mobile:  http://localhost:5173/mobile
echo.
echo   (Don't close the black windows)
pause
