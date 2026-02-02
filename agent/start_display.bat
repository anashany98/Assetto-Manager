@echo off
REM ============================================================
REM  AUTO-START SCRIPT FOR SIMULATOR PC DISPLAY
REM  This script opens Chrome in kiosk mode (fullscreen) 
REM  pointing to the video display page.
REM ============================================================

REM Set the URL of your central server's station display page
SET SERVER_URL=http://YOUR_SERVER_IP:3010/station-display

REM Wait a few seconds for network to be ready
timeout /t 5 /nobreak

REM Launch Chrome in kiosk mode (fullscreen, no address bar)
REM Adjust the path if Chrome is installed elsewhere
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state "%SERVER_URL%"

REM ============================================================
REM  INSTALLATION INSTRUCTIONS:
REM  1. Edit SERVER_URL above to point to your central server
REM  2. Copy this file to the Simulator PC
REM  3. Press Win+R, type: shell:startup
REM  4. Create a shortcut to this .bat file in that folder
REM  5. Restart the PC to test
REM ============================================================
