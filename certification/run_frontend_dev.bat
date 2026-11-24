@echo off
echo ========================================================
echo Starting TTSA Attestation Generator - Frontend Dev Server
echo ========================================================
echo.
echo Vite Dev Server will be available at: http://localhost:5173
echo.

cd /d "%~dp0frontend"
pnpm dev
pause

