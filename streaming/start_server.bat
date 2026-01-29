@echo off
echo Instalando servidor de streaming...
call npm install node-media-server
cls
echo.
echo ========================================
echo   INICIANDO SERVIDOR DE STREAMING
echo ========================================
echo.
node server.js
pause
