@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\activate.bat" (
  echo Creating virtual environment at .venv ...
  python -m venv .venv
  if errorlevel 1 (
    echo Failed to create .venv. Is Python installed and on PATH?
    exit /b 1
  )
)

call ".venv\Scripts\activate.bat"
python -c "import sounddevice, numpy, requests, dotenv" 2>nul
if errorlevel 1 (
  echo Installing Jarvis dependencies ...
  python -m pip install -r requirements.txt
)

python jarvis.py %*
