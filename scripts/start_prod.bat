@echo off
TITLE Assetto Manager - PRODUCCION (Puerto 8000)

cd /d "%~dp0.."

echo ===================================================
echo   ASSETTO MANAGER - MODO PRODUCCION NO DESATENDIDO
echo ===================================================
echo.

IF NOT EXIST "frontend\dist" (
    echo [ERROR] No se encuentra la carpeta 'frontend\dist'.
    echo Ejecutando 'npm run build' primero...
    echo.
    cd frontend
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo [FATAL] Error compilando el frontend.
        pause
        exit /b 1
    )
    cd ..
)

echo Iniciando servidor en http://localhost:8000 ...
echo (Usa Ctrl+C para detener)
echo.

cd backend
call .venv\Scripts\activate

:: Abrir navegador tras 3 segundos (en paralelo)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8000"

:: Ejecutar Uvicorn optimizado para produccion
:: - Workers: 4 (para manejar mas peticiones simultaneas)
:: - Host: 0.0.0.0 (para aceptar conexiones externas)
:: - Port: 8000 (puerto estandar de esta app)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

pause
