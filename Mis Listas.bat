@echo off
cd /d "%~dp0"

REM Instalar dependencias si no existen
if not exist node_modules (
    echo [*] Instalando dependencias...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [ERROR] npm install fallo. Verifica que npm este instalado.
        pause
        exit /b 1
    )
)

REM Abrir navegador
echo [*] Abriendo Firefox...
start firefox http://localhost:8000/

REM Ejecutar servidor de desarrollo
echo [*] Iniciando servidor de desarrollo...
call npm run dev
if errorlevel 1 (
    echo [ERROR] npm run dev fallo. Ver errores arriba.
)

pause
