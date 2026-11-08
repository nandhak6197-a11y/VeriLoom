@echo off
title VeriLoom Cloudflare 24/7 Watchdog
echo =================================================================
echo   VeriLoom Cloudflare 24/7 Watchdog (Survives IDE Restarts)
echo =================================================================
cd /d "C:\Users\NANDHA K\Documents\antigravity\valiant-turing"

:LOOP
:: 1. Check if Uvicorn is running on port 8000
netstat -ano | findstr :8000 >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [%date% %time%] Uvicorn not detected on port 8000. Starting uvicorn...
    start /min "VeriLoom_Server" "C:\Users\NANDHA K\AppData\Local\Programs\Python\Python310\python.exe" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
    timeout /t 3 >nul
)

:: 2. Check if cloudflared is running
tasklist /fi "imagename eq cloudflared.exe" | findstr cloudflared.exe >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [%date% %time%] Cloudflare Tunnel not detected. Restarting cloudflared...
    start /min "VeriLoom_Cloudflare" "cloudflared.exe" tunnel --url http://127.0.0.1:8000
)

:: Sleep 10 seconds before next health check
timeout /t 10 >nul
goto LOOP
