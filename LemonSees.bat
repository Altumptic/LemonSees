@echo off
chcp 65001 >nul
title LemonSees by Altumptic
cd /d "%~dp0"
echo.
echo   LemonSees by Altumptic — starting the engine. The browser opens automatically.
echo   Close this window to stop.
echo.
if not exist dist\index.html call npm run build
node server\index.js
pause
