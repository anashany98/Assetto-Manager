@echo off
echo ==========================================
echo      ASSETTO MANAGER - TEST RUNNER
echo ==========================================
echo.

echo [1/3] Running Backend Tests (Logic & DB)...
python -m pytest backend/tests
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Backend Tests FAILED!
    goto error
) else (
    echo ✅ Backend Tests PASSED.
)
echo.

echo [2/3] Running Agent Tests (Parsing)...
python -m pytest agent/tests
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Agent Tests FAILED!
    goto error
) else (
    echo ✅ Agent Tests PASSED.
)
echo.

echo [3/3] Running Frontend Tests (Analysis)...
cd frontend
call npm run test -- --run
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Frontend Tests FAILED!
    cd ..
    goto error
) else (
    echo ✅ Frontend Tests PASSED.
)
cd ..
echo.

echo ==========================================
echo 🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉
echo ==========================================
pause
exit /b 0

:error
echo.
echo 💥 TESTS FAILED. Please check the logs above.
echo ==========================================
pause
exit /b 1
