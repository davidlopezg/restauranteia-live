@echo off
REM Arranca la aplicación completa en Windows nativo (cmd/PowerShell).
REM Alternativa a start.sh para sistemas sin bash.
REM
REM Uso: start.bat
REM Abre la app en: http://127.0.0.1:8765

setlocal

cd /d "%~dp0"

set "DIST=admin-web-frontend\dist"
set "BACKEND=admin-web\backend"

if not exist "%DIST%\index.html" (
    echo === dist/ no existe. Construyendo frontend...
    cd admin-web-frontend
    if not exist node_modules (
        echo === Instalando dependencias (puede tardar unos minutos)...
        call npm install --no-audit --no-fund --loglevel=error
        if errorlevel 1 goto :error
    )
    call npm run build
    if errorlevel 1 goto :error
    cd ..
    echo === Build completado.
) else (
    echo === dist/ ya existe.
)

if not exist "%BACKEND%\.env" if exist "%BACKEND%\.env.example" (
    echo === AVISO: falta %BACKEND%\.env - copia de .env.example y rellena credenciales Supabase.
)

echo === Arrancando FastAPI en http://127.0.0.1:8765 (Ctrl+C para parar)
echo.
cd /d "%BACKEND%"
python main.py
goto :eof

:error
echo.
echo === ERROR: build fallo. Revisa la salida de npm arriba.
exit /b 1
