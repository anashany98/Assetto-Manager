@echo off
title Assetto Manager - Install Dependencies
color 0b

echo ===================================================
echo   ASSETTO CORSA MANAGER - INSTALLER
echo ===================================================
echo.

:: 1. Backend Setup
echo [1/2] Installing Backend Dependencies (Python)...
cd backend
if not exist ".venv" (
    echo    Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate
pip install -r requirements.txt
cd ..
echo    Backend dependencies installed.
echo.

:: 2. Frontend Setup
echo [2/2] Installing Frontend Dependencies (Node.js)...
cd frontend
call npm install
cd ..
echo    Frontend dependencies installed.
echo.

echo ===================================================
echo   INSTALLATION COMPLETE!
echo   You can now run 'start_app.bat'
echo ===================================================
pause
