@echo off
title VeriLoom Persistent Daemon Watchdog
echo =================================================================
echo   VeriLoom Persistent 24/7 Watchdog (Survives IDE Restarts)
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

:: 2. Check if localtunnel is running
tasklist /fi "imagename eq node.exe" | findstr node.exe >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [%date% %time%] Tunnel not detected. Starting localtunnel on https://veriloom-round2.loca.lt...
    start /min "VeriLoom_Tunnel" cmd /c "npx -y localtunnel --port 8000 --subdomain veriloom-round2"
)

:: Sleep 10 seconds before next health check
timeout /t 10 >nul
goto LOOP
