@echo off
cd /d "%~dp0"
if not exist node_modules npm install
start firefox http://localhost:8000/
npm run dev
pause
