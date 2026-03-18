@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo =========================================
echo   Global AI Climate Platform - Start
echo =========================================

echo Checking Docker daemon...
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Docker daemon is not running.
  echo Please start Docker Desktop first, then run this file again.
  pause
  exit /b 1
)

echo Starting docker compose stack...
docker compose up --build -d
if %ERRORLEVEL% NEQ 0 (
  echo Docker compose startup failed.
  pause
  exit /b 1
)

echo Waiting for API health endpoint...
call :wait_url "http://localhost:8000/api/v1/health" 60
if %ERRORLEVEL% NEQ 0 (
  echo API did not become ready in time.
  docker compose ps
  docker compose logs api --tail=80
  pause
  exit /b 1
)

echo Waiting for frontend...
call :wait_url "http://localhost:5180" 60
if %ERRORLEVEL% NEQ 0 (
  echo Frontend did not become ready in time.
  docker compose ps
  docker compose logs frontend --tail=120
  pause
  exit /b 1
)

echo.
echo API:      http://localhost:8000
echo Docs:     http://localhost:8000/docs
echo Frontend: http://localhost:5180
echo Note: this project uses port 5180 (not 5173).
echo.

echo Opening frontend in browser...
set "BUILD_TOKEN=%RANDOM%%RANDOM%"
start "" "http://localhost:5180/?v=%BUILD_TOKEN%"

echo To stop all services run:
echo docker compose down

echo.
echo Startup completed.
pause

endlocal
exit /b 0

:wait_url
set "TARGET=%~1"
set "MAX_TRIES=%~2"
for /l %%i in (1,1,%MAX_TRIES%) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%TARGET%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if !ERRORLEVEL! EQU 0 (
    exit /b 0
  )
  timeout /t 2 /nobreak >nul
)
exit /b 1
