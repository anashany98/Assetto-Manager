@echo off
echo Starting Assetto Manager LICENSE ADMIN PORTAL...
echo Open http://localhost:8800 in your browser.
echo.
cd tools\license-manager
uvicorn backend:app --port 8800 --reload
pause
