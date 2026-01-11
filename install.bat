@echo off
title AC Manager - INSTALLER
color 0B

echo ===================================================
echo    ASSETTO MANAGER - INITIAL SETUP
echo ===================================================
echo.
echo 1. Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ from python.org and tick "Add to PATH".
    pause
    exit /b
)
echo [OK] Python found.

echo.
echo 2. Setting up Virtual Environment...
if not exist .venv (
    echo Creating .venv...
    python -m venv .venv
) else (
    echo .venv already exists.
)

echo.
echo 3. Installing Backend Dependencies...
call .venv\Scripts\activate
pip install -r backend/requirements.txt
echo [OK] Backend dependencies installed.

echo.
echo 4. Check Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js (LTS) from nodejs.org.
    pause
    exit /b
)

echo.
echo 5. Installing Frontend Dependencies...
cd frontend
if not exist node_modules (
    echo Installing npm packages (this may take a while)...
    call npm install
) else (
    echo node_modules exists, skipping install (run 'npm install' manually if needed).
)
cd ..

echo.
echo ===================================================
echo    SETUP COMPLETE!
echo ===================================================
echo You can now run 'start_server.bat'
echo.
pause
