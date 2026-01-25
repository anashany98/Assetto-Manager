color 0a

echo ===================================================
echo   STARTING ASSETTO CORSA MANAGER
echo ===================================================
echo.

:: 1. Start Backend (Background)
echo [1/2] Starting Backend Server (Port 8000, 0.0.0.0)...
start "🔴 BACKEND SERVER" /D "%~dp0" cmd /k "title 🔴 BACKEND SERVER && color 0C && call .venv\Scripts\activate.bat && python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8001"

:: 2. Start Frontend
echo [2/2] Starting Frontend Interface...
start "🔵 FRONTEND WEB" /D "%~dp0" cmd /k "title 🔵 FRONTEND WEB && color 09 && cd frontend && npm run dev -- --host"

echo.
echo   System is running!
echo   > LOCAL ACCESS:   http://localhost:3010
echo   > NETWORK ACCESS: http://YOUR_PC_IP:3010 (Look for "Network" in Frontend window)
echo.
echo   > Access TV Mode: /tv?screen=1
echo   > Access Mobile:  /mobile
echo.
echo   (Don't close the black windows)
pause
