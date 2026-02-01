@echo off
title AC Manager - CENTRAL SERVER (PROD)
color 0A

echo ===================================================
echo    ASSETTO MANAGER - CENTRAL SERVER (PROD)
echo ===================================================
echo.

cd /d "%~dp0"

set ENVIRONMENT=production

REM Auto-Install Check
if not exist .venv (
    echo First run detected! launching installer...
    call install.bat
)

call .venv\Scripts\activate.bat || echo Venv not found, trying system python...

echo.
echo Building Frontend...
cd frontend
if not exist node_modules (
    echo Installing npm packages (this may take a while)...
    call npm install
)
call npm run build
cd ..

echo Starting Backend (production)...
start "AC Backend" cmd /k "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 2"

echo.
echo SYSTEM RUNNING.
echo Access web panel at: http://localhost:8000
echo.
pause
