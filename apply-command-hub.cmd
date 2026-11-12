@echo off
cd /d "%~dp0"
node scripts\install-command-hub.mjs
if errorlevel 1 exit /b 1
npm run help
