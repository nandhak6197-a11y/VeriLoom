@echo off
title VeriLoom Workbench Launcher
echo =================================================================
echo   VeriLoom: Guidelines as an Executable Specification
echo   Starting Local Development & Workbench Environment
echo =================================================================
cd /d "%~dp0"

:: 1. Check if backend port 8000 is running
netstat -ano | findstr :8000 >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Starting Uvicorn Server on http://localhost:8000...
    start "VeriLoom_Server" py -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
    timeout /t 3 >nul
) else (
    echo [INFO] Uvicorn is already active on port 8000.
)

:: 2. Check if cloudflared is running for public testing
tasklist /fi "imagename eq cloudflared.exe" | findstr cloudflared.exe >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "cloudflared.exe" (
        echo [INFO] Starting Cloudflare quick tunnel...
        start "VeriLoom_Tunnel" cloudflared.exe tunnel --url http://127.0.0.1:8000
    )
) else (
    echo [INFO] Cloudflare tunnel is already running.
)

:: 3. Launch Chrome or Default Browser to Workbench
echo [INFO] Launching VeriLoom Workbench in Chrome...
start http://localhost:8000

echo =================================================================
echo   VeriLoom is running at:
echo   - Local:      http://localhost:8000
echo   - API Health: http://localhost:8000/api/health
echo   - API Docs:   http://localhost:8000/docs
echo =================================================================
pause
