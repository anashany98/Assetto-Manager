@echo off
setlocal enabledelayedexpansion
title AC Manager - Actualizacion
color 0B
chcp 65001 >nul 2>&1

set "REPO_ROOT=%~dp0"
cd /d "%REPO_ROOT%"

echo.
echo  ██████████████████████████████████████████████████
echo     AC MANAGER  -  ACTUALIZACION
echo  ██████████████████████████████████████████████████
echo.

:: ─── Leer version local ──────────────────────────────────────────────────────
set "LOCAL_VERSION=desconocida"
if exist "VERSION.txt" (
    for /f "tokens=1" %%v in (VERSION.txt) do set "LOCAL_VERSION=%%v"
)
echo  Version instalada: !LOCAL_VERSION!
echo.

:: ─── Consultar GitHub para la ultima version ─────────────────────────────────
echo  Comprobando actualizaciones...
set "GITHUB_REPO=anashany98/Assetto-Manager"
set "LATEST_VERSION="
set "DOWNLOAD_URL="

for /f "usebackq delims=" %%j in (`powershell -NoProfile -NonInteractive -Command ^
  "try { $r = Invoke-RestMethod 'https://api.github.com/repos/%GITHUB_REPO%/releases/latest' -ErrorAction Stop; Write-Output $r.tag_name; Write-Output $r.assets[0].browser_download_url } catch { Write-Output 'ERROR' }" 2^>nul`) do (
    if "!LATEST_VERSION!"=="" (
        set "LATEST_VERSION=%%j"
    ) else if "!DOWNLOAD_URL!"=="" (
        set "DOWNLOAD_URL=%%j"
    )
)

if "!LATEST_VERSION!"=="ERROR" (
    echo  [AVISO] No se pudo contactar con el servidor de actualizaciones.
    echo  Se iniciara la version local.
    echo.
    goto :START_SERVER
)

if "!LATEST_VERSION!"=="" (
    echo  [AVISO] No se encontraron versiones publicadas.
    echo  Se iniciara la version local.
    echo.
    goto :START_SERVER
)

echo  Version disponible:  !LATEST_VERSION!
echo.

:: ─── Comparar versiones ───────────────────────────────────────────────────────
if "!LOCAL_VERSION!"=="!LATEST_VERSION!" (
    echo  Ya tienes la version mas reciente.
    echo.
    goto :START_SERVER
)

:: ─── Preguntar al usuario ─────────────────────────────────────────────────────
echo  Hay una nueva version disponible: !LATEST_VERSION!
echo  (Version actual: !LOCAL_VERSION!)
echo.
set /p "DO_UPDATE=  Descargar e instalar ahora? [S/n]: "
if /i "!DO_UPDATE!"=="n" goto :START_SERVER
if /i "!DO_UPDATE!"=="no" goto :START_SERVER

:: ─── Backup del .env (datos criticos del cliente) ────────────────────────────
echo.
echo  [1/4] Haciendo backup de configuracion...
if exist "backend\.env" (
    copy /y "backend\.env" "backend\.env.backup" >nul
    echo  [OK] backend\.env respaldado como backend\.env.backup
)

:: ─── Descargar el ZIP ────────────────────────────────────────────────────────
echo.
echo  [2/4] Descargando !LATEST_VERSION!...
set "ZIP_TMP=%TEMP%\ac-manager-update.zip"
set "EXTRACT_TMP=%TEMP%\ac-manager-update"

powershell -NoProfile -NonInteractive -Command ^
  "Invoke-WebRequest -Uri '!DOWNLOAD_URL!' -OutFile '!ZIP_TMP!' -UseBasicParsing" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] No se pudo descargar la actualizacion.
    echo  Comprueba la conexion a internet e intenalo de nuevo.
    pause
    exit /b 1
)
echo  [OK] Descarga completada.

:: ─── Extraer ZIP a carpeta temporal ─────────────────────────────────────────
echo.
echo  [3/4] Instalando actualizacion...
if exist "!EXTRACT_TMP!" rd /s /q "!EXTRACT_TMP!"

powershell -NoProfile -NonInteractive -Command ^
  "Expand-Archive -Path '!ZIP_TMP!' -DestinationPath '!EXTRACT_TMP!' -Force" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] No se pudo extraer el archivo.
    del /f /q "!ZIP_TMP!" >nul 2>&1
    pause
    exit /b 1
)

:: Encontrar la carpeta raiz dentro del ZIP (ac-manager-vX.X.X\)
set "INNER_DIR="
for /d %%d in ("!EXTRACT_TMP!\*") do set "INNER_DIR=%%d"

if "!INNER_DIR!"=="" (
    echo  [ERROR] Estructura del ZIP no reconocida.
    pause
    exit /b 1
)

:: Copiar todos los archivos EXCEPTO los datos del cliente
:: Excluimos: backend\.env, backend\storage\, logs\, .installed
powershell -NoProfile -NonInteractive -Command ^
  "$src = '!INNER_DIR!'; $dst = '!REPO_ROOT!'.TrimEnd('\'); Get-ChildItem -Path $src -Recurse | ForEach-Object { $rel = $_.FullName.Substring($src.Length + 1); $target = Join-Path $dst $rel; $skip = $rel -match '^backend[\\/]\.env$' -or $rel -match '^backend[\\/]storage' -or $rel -match '^logs[\\/]' -or $rel -eq '.installed'; if (-not $skip) { if ($_.PSIsContainer) { New-Item -ItemType Directory -Path $target -Force | Out-Null } else { Copy-Item -Path $_.FullName -Destination $target -Force } } }" >nul 2>&1

:: Restaurar .env si existia backup (por si el ZIP lo sobreescribio de alguna forma)
if exist "backend\.env.backup" (
    copy /y "backend\.env.backup" "backend\.env" >nul
)

:: Limpiar temporales
del /f /q "!ZIP_TMP!" >nul 2>&1
rd /s /q "!EXTRACT_TMP!" >nul 2>&1

echo  [OK] Archivos actualizados.

:: ─── Actualizar dependencias Python ─────────────────────────────────────────
echo.
echo  [4/4] Actualizando dependencias...
set "PY_EXE=.venv\Scripts\python.exe"
if not exist "%PY_EXE%" set "PY_EXE=python"

"%PY_EXE%" -m pip install -q -r backend\requirements.txt --disable-pip-version-check
if %errorlevel% neq 0 (
    echo  [AVISO] Algunas dependencias no se pudieron actualizar.
    echo  El servidor intentara arrancar con las existentes.
)

:: Ejecutar migraciones de base de datos
"%PY_EXE%" bootstrap_db.py >nul 2>&1

echo  [OK] Actualizacion a !LATEST_VERSION! completada.
echo.

:START_SERVER
:: ─── Arrancar servidor ───────────────────────────────────────────────────────
echo  Iniciando AC Manager...

if not exist ".installed" (
    echo  [AVISO] El sistema no parece estar instalado correctamente.
    echo  Ejecuta SETUP_CLIENTE.bat primero.
    echo.
    pause
    exit /b 1
)

set "PY_EXE=.venv\Scripts\python.exe"
if not exist "%PY_EXE%" set "PY_EXE=python"

start /min "ACManager-Backend" cmd /c ^
  "cd /d %REPO_ROOT% && call .venv\Scripts\activate && python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul
start "" "http://localhost:8000"

echo  Servidor iniciado.
echo  Panel: http://localhost:8000
echo.
echo  Para detener: cierra la ventana "ACManager-Backend".
echo.
pause
