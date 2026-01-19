@echo off
title AC Agent Setup
color 0e

echo ===================================================
echo   ASSETTO CORSA SIMULATOR - AGENT SETUP
echo ===================================================
echo.

:: 1. Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ from python.org and try again.
    pause
    exit
)

:: 2. Create Venv
if not exist ".venv" (
    echo [1/3] Creating Virtual Environment...
    python -m venv .venv
)

:: 3. Install Deps
echo [2/3] Installing Dependencies...
call .venv\Scripts\activate
pip install requests websockets psutil
:: psutil might be needed for process management later

:: 4. Configuration
echo.
echo [3/3] Configuration
if not exist "config.json" (
    set /p SERVER_IP="Enter the IP address of the SERVER (e.g. 192.168.1.50): "
    
    echo Creating config.json...
    (
        echo {
        echo     "server_url": "http://%SERVER_IP%:8000",
        echo     "ac_content_dir": "C:/Program Files (x86)/Steam/steamapps/common/assettocorsa/content"
        echo }
    ) > config.json
    echo Config saved!
) else (
    echo Config file already exists. Skipping...
)

echo.
echo ===================================================
echo   SETUP COMPLETE!
echo.
echo   [TIP] To make this agent 100%% autonomous:
echo   1. Press Win + R, type 'shell:startup'
echo   2. Create a shortcut to this .bat file there.
echo   3. The agent will now start automatically with Windows.
echo ===================================================
echo.
echo Starting Agent...
:run
call .venv\Scripts\activate
python main.py
echo.
echo [WARNING] Agent stopped or crashed. Restarting in 5 seconds...
timeout /t 5
goto run
