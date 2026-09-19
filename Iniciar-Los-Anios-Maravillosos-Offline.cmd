@echo off
setlocal
cd /d "%~dp0"
start "Los Anios Offline Server" /b python offline-server.py
timeout /t 1 /nobreak >nul
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "Los Anios Maravillosos" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:8765/admin.html
) else (
  start "Los Anios Maravillosos" http://127.0.0.1:8765/admin.html
)
endlocal
