@echo off
cd /d "%~dp0"
set "PYTHON_BIN=C:\Users\fabri\AppData\Local\Python\pythoncore-3.14-64\python.exe"
if exist "%PYTHON_BIN%" (
  start "ArancelSmart Server" /min "%PYTHON_BIN%" "%CD%\serve.py" 3001
) else (
  start "ArancelSmart Server" /min py -3 "%CD%\serve.py" 3001
)
timeout /t 2 /nobreak >nul
start "" "http://localhost:3001/"
exit /b
