@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   AC-MANAGER - Backup de Base de Datos
echo ============================================
echo.

REM Obtener fecha para el nombre del archivo
set DATE_STR=%date:~-4%%date:~3,2%%date:~0,2%
set TIME_STR=%time:~0,2%%time:~3,2%%time:~6,2%
set TIME_STR=!TIME_STR: =0!
set BACKUP_NAME=ac_manager_backup_%DATE_STR%_%TIME_STR%.sql

echo Generando backup: %BACKUP_NAME%
echo.

REM Verificar que el contenedor DB esté corriendo
docker compose -f docker-compose.prod.yml ps db | findstr "Up" >nul
if errorlevel 1 (
    echo ERROR: El contenedor de PostgreSQL no está corriendo.
    echo Ejecuta start_local.bat primero.
    pause
    exit /b 1
)

REM Crear backup
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U ac_manager ac_manager > "%BACKUP_NAME%"

if errorlevel 1 (
    echo ERROR: El backup falló.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ¡Backup completado!
echo   Archivo: %BACKUP_NAME%
echo   Tamaño:  
for %%A in ("%BACKUP_NAME%") do echo     ^(%%~zA bytes^)
echo ============================================
echo.
pause
endlocal