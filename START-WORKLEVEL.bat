@echo off
setlocal
cd /d "%~dp0"
title WORKLEVEL V15.5

echo ========================================
echo       WORKLEVEL V15.5 STARTER
echo ========================================
echo.

if not exist package.json (
  echo ERROR: package.json was not found.
  echo Please keep START-WORKLEVEL.bat inside the worklevel-v15.5 folder.
  pause
  exit /b 1
)

if not exist node_modules\next\dist\bin\next (
  echo First start: installing required packages...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Installation failed. Please send a screenshot of this window.
    pause
    exit /b 1
  )
)

echo.
echo Starting WORKLEVEL V15.5 at http://localhost:3010/login
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3010/login"
call npm.cmd run dev -- -p 3010

echo.
echo WORKLEVEL stopped.
pause
