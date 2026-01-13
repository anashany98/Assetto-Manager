@echo off
TITLE Instalador de Accesos Directos
cd /d "%~dp0"

echo Instalando accesos directos...
powershell -ExecutionPolicy Bypass -File "setup_shortcuts.ps1"

pause
