@echo off
chcp 65001 >nul
title ШОК · Моніторинг серверів
cd /d "%~dp0"
echo.
echo   ШОК запускається... Браузер відкриється автоматично.
echo   Щоб зупинити моніторинг — просто закрий це вікно.
echo.
node server\index.js
pause
