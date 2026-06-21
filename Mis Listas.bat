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

REM Ejecutar servidor de desarrollo
if exist node_modules\.vite (
    echo [*] Limpiando cache de Vite...
    rmdir /s /q node_modules\.vite
)

echo [*] Iniciando servidor de desarrollo (reoptimizando modulos)...
call npm run dev -- --open --force
if errorlevel 1 (
    echo [ERROR] npm run dev fallo. Ver errores arriba.
)

pause
