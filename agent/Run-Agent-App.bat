@echo off
title P2P GPU Node Agent
cd /d "%~dp0"

echo ======================================================
echo    P2P GPU Node Agent — Application Launcher
echo ======================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10 or higher from https://python.org
    pause
    exit /b 1
)

echo Checking dependencies...
pip install -r requirements.txt >nul 2>nul

echo Starting application...
python app.py

if %ERRORLEVEL% neq 0 (
    echo Application exited with error code %ERRORLEVEL%
    pause
)
