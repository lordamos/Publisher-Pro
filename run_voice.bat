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
python -c "import google.genai" 2>nul
if errorlevel 1 (
  echo Installing voice dependencies ...
  python -m pip install -r requirements-voice.txt
)

python run_voice.py %*
