@echo off
color 0A
echo ===================================================
echo   ASSETTO MANAGER - SISTEMA DE ACTUALIZACION
echo ===================================================
echo.
echo [1/3] Descargando ultimos cambios de la nube...
git pull origin master
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] No se pudieron descargar los cambios.
    echo Verifica tu conexion a internet.
    pause
    exit /b
)

echo.
echo [2/3] Actualizando Backend (Servidor)...
cd backend
.venv\Scripts\python -m pip install -r requirements.txt
cd ..

echo.
echo [3/3] Actualizando Frontend (Pantallas)...
cd frontend
call npm install
cd ..

echo.
echo ===================================================
echo   ACTUALIZACION COMPLETADA
echo ===================================================
echo.
echo Ya puedes cerrar esta ventana y ejecutar start_system.bat
echo.
pause
