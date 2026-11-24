@echo off
echo ========================================================
echo Starting TTSA Attestation Generator
echo 5th National Tunisian Thoracic Surgery Congress
echo ========================================================
echo.
echo Application will be available at: http://localhost:8000
echo API Documentation (Swagger) at:   http://localhost:8000/docs
echo.

set "PY=C:\Users\ABC\AppData\Local\Python\pythoncore-3.14-64\python.exe"

cd /d "%~dp0backend"
"%PY%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause

