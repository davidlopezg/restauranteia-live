@echo off
REM Arranca la aplicación completa en Windows nativo (cmd / PowerShell).
REM Equivalente a start.sh (bash) para sistemas sin bash.
REM
REM Uso:
REM   start.bat                 (doble clic o desde cmd)
REM   .\start.bat               (desde PowerShell)
REM
REM En Termux / Linux / WSL / Mac usar: bash start.sh
REM
REM Abre la app en: http://127.0.0.1:8765

setlocal EnableExtensions

cd /d "%~dp0"

set "ROOT=%CD%"
set "DIST=%ROOT%\admin-web-frontend\dist"
set "FRONTEND=%ROOT%\admin-web-frontend"
set "BACKEND=%ROOT%\admin-web\backend"

REM Sanity checks (mismos que start.sh)
if not exist "%FRONTEND%" (
    echo === ERROR: falta admin-web-frontend\ en %ROOT%
    exit /b 1
)
if not exist "%BACKEND%" (
    echo === ERROR: falta admin-web\backend\ en %ROOT%
    exit /b 1
)

REM Build solo si no existe dist/index.html (asume deps ya instaladas).
if not exist "%DIST%\index.html" (
    echo === dist/ no existe. Construyendo frontend por primera vez...
    cd /d "%FRONTEND%"
    if not exist node_modules (
        echo === Instalando dependencias (puede tardar unos minutos)...
        call npm install --no-audit --no-fund --loglevel=error
        if errorlevel 1 goto :error
    )
    call npm run build
    if errorlevel 1 goto :error
    cd /d "%ROOT%"
    echo === Build completado en admin-web-frontend\dist\
) else (
    echo === dist/ ya existe. Si quieres forzar rebuild: borra admin-web-frontend\dist\ y vuelve a correr start.bat
)

REM Aviso si falta .env (no bloquea, pero el backend fallara al primer query real).
if not exist "%BACKEND%\.env" if exist "%BACKEND%\.env.example" (
    echo === AVISO: falta admin-web\backend\.env - copia de .env.example y rellena credenciales Supabase.
)

echo.
echo === Arrancando FastAPI en http://127.0.0.1:8765 (Ctrl+C para parar)
echo.
cd /d "%BACKEND%"
python main.py
goto :eof

:error
echo.
echo === ERROR: build fallo. Revisa la salida de npm arriba.
exit /b 1
