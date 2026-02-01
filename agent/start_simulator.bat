@echo off
REM ============================================================
REM  FULL SIMULATOR STARTUP SCRIPT
REM  Launches both the Visual Display (Chrome Kiosk)
REM  and the Agent Software (Background Service)
REM ============================================================

REM 1. Start the Visual Display (Chrome Kiosk)
echo Starting Station Display...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state "http://YOUR_SERVER_IP:3010/station-display"

REM 2. Start the Agent (in a new minimized window)
echo Starting Agent Service...
cd /d "%~dp0"
start /min "AC Agent Service" cmd /c "python main.py"

REM ============================================================
REM  INSTALLATION:
REM  1. Copy this file to Windows Startup Folder (Win+R -> shell:startup)
REM  2. Edit YOUR_SERVER_IP to the real server IP.
REM ============================================================
