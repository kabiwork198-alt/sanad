@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 -m sanad.app
) else (
  python -m sanad.app
)
if errorlevel 1 (
  echo.
  echo Could not start Sanad. Install Python 3.10 or later and try again.
  pause
)
