@echo off
title TREDT SMP Gameplay Conference
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting TREDT SMP Gameplay Conference...
start "" http://localhost:5173
call npm run dev -- --host 0.0.0.0
pause
