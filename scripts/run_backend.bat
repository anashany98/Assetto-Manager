@echo off
setlocal

cd /d "%~dp0\.."

set ENVIRONMENT=production
set REQUIRE_SECRETS=true
if "%UVICORN_WORKERS%"=="" set UVICORN_WORKERS=1
if "%ENABLE_SCHEDULER%"=="" set ENABLE_SCHEDULER=true

if exist .venv\Scripts\activate.bat (
  call .venv\Scripts\activate.bat
)

set "PY_EXE=python"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py -3.11"
%PY_EXE% -c "import sys" >nul 2>&1
if errorlevel 1 set "PY_EXE=py"

%PY_EXE% -c "from backend.app.main import _validate_runtime_config; _validate_runtime_config()" || exit /b 1

%PY_EXE% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers %UVICORN_WORKERS%

endlocal
