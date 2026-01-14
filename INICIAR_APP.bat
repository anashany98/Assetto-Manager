@echo off
setlocal enabledelayedexpansion
title AC Manager Launcher
color 0A

echo ===================================================
echo      ASSETTO MANAGER - LANZADOR AUTOMATICO
echo ===================================================
echo.

:: Guardar directorio raiz
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: =========================================
:: 1. VERIFICAR PYTHON
:: =========================================
echo [1/4] Verificando Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] Python no encontrado.
    echo Por favor, instala Python 3.10 o superior.
    echo IMPORTANTE: Marca "Add Python to PATH" durante la instalacion.
    echo.
    pause
    exit /b 1
)
echo       Python OK

:: =========================================
:: 2. VERIFICAR NODE.JS (para frontend)
:: =========================================
echo [2/4] Verificando Node.js...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    color 0E
    echo.
    echo [AVISO] Node.js no encontrado.
    echo Si es la primera vez que ejecutas la app, necesitas instalarlo.
    echo Descargalo de: https://nodejs.org/
    echo.
    echo Pulsa cualquier tecla para continuar de todos modos...
    pause >nul
)
echo       Node.js OK

:: =========================================
:: 3. PREPARAR BACKEND
:: =========================================
echo [3/4] Preparando Backend...
cd /d "%ROOT_DIR%backend"

:: Crear venv si no existe
if not exist "venv\Scripts\python.exe" (
    echo       - Creando entorno virtual...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)

:: Instalar dependencias usando el python del venv
echo       - Verificando librerias...
"venv\Scripts\pip.exe" install -r requirements.txt --quiet --disable-pip-version-check
if %errorlevel% neq 0 (
    echo [AVISO] Hubo un problema instalando algunas librerias.
    echo         Intentando continuar...
)
echo       Backend OK

:: =========================================
:: 4. VERIFICAR FRONTEND (primer inicio)
:: =========================================
echo [4/4] Verificando Frontend...
cd /d "%ROOT_DIR%frontend"

if not exist "dist\index.html" (
    echo       - Primera ejecucion detectada. Construyendo interfaz...
    where npm >nul 2>&1
    if %errorlevel% equ 0 (
        echo       - Instalando dependencias (esto puede tardar varios minutos)...
        call npm install --silent
        echo       - Compilando interfaz...
        call npm run build
        if %errorlevel% neq 0 (
            color 0C
            echo [ERROR] Fallo al construir el frontend.
            pause
            exit /b 1
        )
    ) else (
        color 0C
        echo [ERROR] No se puede construir el frontend sin Node.js
        echo         Por favor, instala Node.js y ejecuta de nuevo.
        pause
        exit /b 1
    )
)
echo       Frontend OK

:: =========================================
:: 5. INICIAR SERVIDOR
:: =========================================
cd /d "%ROOT_DIR%"
echo.
echo ===================================================
echo  SERVIDOR LISTO PARA INICIAR
echo  La aplicacion se abrira en tu navegador.
echo  NO CIERRES ESTA VENTANA mientras uses la app.
echo ===================================================
echo.

:: Abrir navegador despues de 3 segundos
start /b cmd /c "timeout /t 3 >nul & start http://localhost:8000"

:: Ejecutar servidor usando el python del venv
cd /d "%ROOT_DIR%backend"
"venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000

:: Si el servidor termina
echo.
echo El servidor se ha detenido.
pause
