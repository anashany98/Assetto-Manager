@echo off
TITLE Assetto Corsa Manager - AGENT

cd /d "%~dp0.."

echo Starting Agent...
:loop
cmd /c "cd agent && python main.py"
echo Agent crashed or stopped. Restarting in 5 seconds...
timeout /t 5
goto loop
