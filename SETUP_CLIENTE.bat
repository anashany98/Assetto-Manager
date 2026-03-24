@echo off
setlocal enabledelayedexpansion
title AC Manager - Instalacion Inicial
color 0B
chcp 65001 >nul 2>&1

echo.
echo  ██████████████████████████████████████████████████
echo     AC MANAGER  -  INSTALACION INICIAL
echo  ██████████████████████████████████████████████████
echo.
echo  Este asistente configura el servidor por primera vez.
echo  Solo necesitas ejecutarlo UNA vez.
echo.

:: ─── Verificar que se ejecuta como Administrador ─────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Ejecuta este archivo como Administrador.
    echo  Clic derecho sobre SETUP_CLIENTE.bat → "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

set "REPO_ROOT=%~dp0"
cd /d "%REPO_ROOT%"

:: ─── Marcador: ya instalado? ──────────────────────────────────────────────────
if exist ".installed" (
    echo  [INFO] El sistema ya fue instalado anteriormente.
    echo.
    echo  Para INICIAR el servidor usa:  INICIAR_SERVIDOR.bat
    echo  Para ACTUALIZAR usa:           ACTUALIZAR_Y_ABRIR.bat
    echo.
    pause
    exit /b 0
)

echo  [1/6] Comprobando Python 3.10+...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Python no esta instalado o no esta en el PATH.
    echo.
    echo  Instala Python 3.11 desde:  https://www.python.org/downloads/
    echo  IMPORTANTE: marca la casilla "Add Python to PATH" durante la instalacion.
    echo.
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
echo  [OK] Python !PY_VER! encontrado.

echo.
echo  [2/6] Comprobando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js no esta instalado.
    echo.
    echo  Instala Node.js LTS desde:  https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f %%v in ('node --version 2^>^&1') do set "NODE_VER=%%v"
echo  [OK] Node.js !NODE_VER! encontrado.

echo.
echo  [3/6] Instalando dependencias de Python...
if not exist ".venv" (
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)
call .venv\Scripts\activate
pip install -q -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo  [ERROR] Fallo al instalar dependencias de Python.
    pause
    exit /b 1
)
echo  [OK] Dependencias de Python instaladas.

echo.
echo  [4/6] Configurando entorno de produccion...
echo.
echo  ¿Que base de datos quieres usar?
echo.
echo    1) SQLite  (recomendado para 1-4 simuladores, sin configuracion extra)
echo    2) PostgreSQL  (recomendado para 5+ simuladores o mayor rendimiento)
echo.
set /p "DB_CHOICE=  Elige [1 o 2]: "
if "!DB_CHOICE!"=="2" goto :USE_POSTGRES

:: SQLite path
powershell -ExecutionPolicy Bypass -File scripts\deploy_prod.ps1 -UseSqlite -NoStart
if %errorlevel% neq 0 (
    echo  [ERROR] Fallo la configuracion del entorno.
    pause
    exit /b 1
)
goto :CONFIG_DONE

:USE_POSTGRES
echo.
set /p "PG_URL=  Introduce la URL de PostgreSQL (postgresql://user:pass@host/db): "
if "!PG_URL!"=="" (
    echo  [ERROR] URL vacia. Vuelve a ejecutar el instalador.
    pause
    exit /b 1
)
powershell -ExecutionPolicy Bypass -File scripts\deploy_prod.ps1 -DatabaseUrl "!PG_URL!" -NoStart
if %errorlevel% neq 0 (
    echo  [ERROR] Fallo la configuracion del entorno.
    pause
    exit /b 1
)

:CONFIG_DONE
echo  [OK] Entorno configurado y backend\.env generado.

echo.
echo  [5/6] Inicializando base de datos y compilando frontend...
call .venv\Scripts\activate
python bootstrap_db.py
if %errorlevel% neq 0 (
    echo  [ERROR] Fallo la inicializacion de la base de datos.
    pause
    exit /b 1
)
cd frontend
if not exist node_modules (
    call npm install --silent
)
call npm run build
if %errorlevel% neq 0 (
    echo  [ERROR] Fallo la compilacion del frontend.
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Base de datos y frontend listos.

echo.
echo  [6/6] Creando usuario administrador...
echo.
set /p "ADMIN_USER=  Nombre de usuario admin [admin]: "
if "!ADMIN_USER!"=="" set "ADMIN_USER=admin"
echo.
set /p "ADMIN_PASS=  Contrasena admin (min 8 caracteres): "
if "!ADMIN_PASS!"=="" (
    echo  [ERROR] La contrasena no puede estar vacia.
    pause
    exit /b 1
)
echo.
powershell -ExecutionPolicy Bypass -Command ^
  "$env_file = 'backend\.env'; $token = ''; foreach ($l in (Get-Content $env_file)) { if ($l -match '^SETUP_TOKEN=(.+)') { $token = $Matches[1] } }; if (-not $token) { Write-Host 'SETUP_TOKEN no encontrado'; exit 1 }; try { Invoke-RestMethod -Uri 'http://localhost:8000/auth/users/setup' -Method Post -Headers @{'X-Setup-Token'=$token} -ContentType 'application/json' -Body ('{\"username\":\"!ADMIN_USER!\",\"password\":\"!ADMIN_PASS!\"}') | Out-Null; Write-Host 'Usuario creado.' } catch { if ($_.Exception.Message -match '400|already') { Write-Host 'El usuario ya existe.' } else { Write-Host ('Error: ' + $_.Exception.Message) } }" 2>nul

:: Marcar como instalado
echo %date% %time% > .installed

echo.
echo  ██████████████████████████████████████████████████
echo     INSTALACION COMPLETADA
echo  ██████████████████████████████████████████████████
echo.
echo  Para iniciar el servidor:   INICIAR_SERVIDOR.bat
echo  Panel de administracion:    http://localhost:8000
echo.
echo  Guarda estos datos en un lugar seguro:
echo    Usuario admin: !ADMIN_USER!
echo    Tokens y claves: backend\.env
echo.
pause
exit /b 0
