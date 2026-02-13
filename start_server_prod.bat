@echo off
title AC Manager - CENTRAL SERVER (PROD)
color 0A

echo ===================================================
echo    ASSETTO MANAGER - CENTRAL SERVER (PROD)
echo ===================================================
echo.

cd /d "%~dp0"

set ENVIRONMENT=production
set REQUIRE_SECRETS=true
if "%UVICORN_WORKERS%"=="" set UVICORN_WORKERS=1
if "%ENABLE_SCHEDULER%"=="" set ENABLE_SCHEDULER=true

REM Auto-Install Check
if not exist .venv (
    echo First run detected! launching installer...
    call install.bat
)

call .venv\Scripts\activate.bat || echo Venv not found, trying system python...

set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"


echo.
echo Validating production environment...
%PY_EXE% -c "from backend.app.main import _validate_runtime_config; _validate_runtime_config()" || exit /b 1

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
start "AC Backend" cmd /k "%PY_EXE% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers %UVICORN_WORKERS%"

echo.
echo SYSTEM RUNNING.
echo Access web panel at: http://localhost:8000
echo.
pause
