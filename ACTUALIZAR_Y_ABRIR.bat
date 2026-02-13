@echo off
setlocal
title AC Manager - Cliente (1 clic)
color 0A

cd /d "%~dp0"

echo ===================================================
echo      ASSETTO MANAGER - CLIENTE 1 CLIC
echo ===================================================
echo.

set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Python no encontrado.
    echo Instala Python 3.10+ y vuelve a intentar.
    pause
    exit /b 1
)

echo [1/4] Descargando ultima version...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] Git no encontrado. Se abrira la version local.
) else (
    git pull origin master
    if %errorlevel% neq 0 (
        echo [AVISO] No se pudo actualizar desde la nube. Se abrira la version local.
    )
)

echo.
echo [2/4] Preparando backend...
if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    %PY_EXE% -m venv .venv
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] No se pudo crear .venv
        pause
        exit /b 1
    )
)

".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt --disable-pip-version-check
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Fallo instalando dependencias del backend.
    pause
    exit /b 1
)

echo.
echo [3/4] Preparando frontend...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js/npm no encontrado.
    echo Instala Node.js LTS y vuelve a intentar.
    pause
    exit /b 1
)

cd frontend
if not exist "node_modules" (
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] Fallo en npm install.
        cd ..
        pause
        exit /b 1
    )
)

call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Fallo compilando frontend.
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo [4/4] Abriendo app...
call scripts\start_prod.bat
