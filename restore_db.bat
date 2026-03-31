@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   AC-MANAGER - Restaurar Base de Datos
echo ============================================
echo.

REM Verificar que el contenedor DB esté corriendo
docker compose -f docker-compose.prod.yml ps db | findstr "Up" >nul
if errorlevel 1 (
    echo ERROR: El contenedor de PostgreSQL no está corriendo.
    echo Ejecuta start_local.bat primero.
    pause
    exit /b 1
)

REM Listar backups disponibles
echo Backups disponibles:
echo.
dir /b ac_manager_backup_*.sql 2>nul
echo.

set /p BACKUP_FILE="Introduce el nombre del archivo de backup: "

if not exist "%BACKUP_FILE%" (
    echo ERROR: El archivo "%BACKUP_FILE%" no existe.
    pause
    exit /b 1
)

echo.
echo ADVERTENCIA: Esto sobrescribirá todos los datos actuales.
set /p CONFIRM="¿Continuar? (S/N): "

if /i not "%CONFIRM%"=="S" (
    echo Restauracion cancelada.
    pause
    exit /b 0
)

echo.
echo Restaurando base de datos...
docker compose -f docker-compose.prod.yml exec -T db psql -U ac_manager -d ac_manager < "%BACKUP_FILE%"

if errorlevel 1 (
    echo ERROR: La restauracion fallo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ¡Restauracion completada!
echo ============================================
echo.
pause
endlocal