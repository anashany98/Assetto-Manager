@echo off
echo Starting Assetto Manager LICENSE ADMIN PORTAL...
echo Open http://localhost:8800 in your browser.
echo.
set "SCRIPT_DIR=%~dp0"
set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"

set "LICENSE_ADMIN_HOST=%LICENSE_ADMIN_HOST%"
if "%LICENSE_ADMIN_HOST%"=="" set "LICENSE_ADMIN_HOST=127.0.0.1"
set "LICENSE_ADMIN_PORT=%LICENSE_ADMIN_PORT%"
if "%LICENSE_ADMIN_PORT%"=="" set "LICENSE_ADMIN_PORT=8800"

pushd "%SCRIPT_DIR%tools\license-manager" || (
  echo.
  echo ERROR: cannot find tools\license-manager relative to: %SCRIPT_DIR%
  echo Run this script from the repo root, or keep it in the repo root.
  pause
  exit /b 1
)

echo Host: %LICENSE_ADMIN_HOST%  Port: %LICENSE_ADMIN_PORT%
%PY_EXE% -m uvicorn backend:app --host %LICENSE_ADMIN_HOST% --port %LICENSE_ADMIN_PORT% --reload
popd
pause
