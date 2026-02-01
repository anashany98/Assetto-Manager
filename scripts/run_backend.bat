@echo off
setlocal

cd /d "%~dp0\.."

set ENVIRONMENT=production

if exist .venv\Scripts\activate.bat (
  call .venv\Scripts\activate.bat
)

python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 2

endlocal
