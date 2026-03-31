@echo off
setlocal

echo ============================================
echo   AC-MANAGER - Detener Servicios
echo ============================================
echo.

docker compose -f docker-compose.prod.yml down

echo.
echo Servicios detenidos.
echo.
echo   - Los volumenes de datos se mantienen.
echo   - Para eliminar datos: docker compose -f docker-compose.prod.yml down -v
echo.
pause
endlocal