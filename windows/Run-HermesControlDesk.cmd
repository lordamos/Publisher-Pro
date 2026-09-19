@echo off
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0HermesControlDesk.ps1"
