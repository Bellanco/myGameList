#!/bin/bash
# Doble clic en Finder para abrir la web (equivalente macOS de "Mis Listas.bat")
cd "$(dirname "$0")" || exit 1

# Instalar dependencias si no existen
if [ ! -d node_modules ]; then
    echo "[*] Instalando dependencias..."
    npm install --legacy-peer-deps
    if [ $? -ne 0 ]; then
        echo "[ERROR] npm install fallo. Verifica que npm este instalado."
        read -n 1 -s -r -p "Pulsa una tecla para salir..."
        exit 1
    fi
fi

# Limpiar cache de Vite
if [ -d node_modules/.vite ]; then
    echo "[*] Limpiando cache de Vite..."
    rm -rf node_modules/.vite
fi

echo "[*] Iniciando servidor de desarrollo (reoptimizando modulos)..."
npm run dev -- --open --force
if [ $? -ne 0 ]; then
    echo "[ERROR] npm run dev fallo. Ver errores arriba."
fi

read -n 1 -s -r -p "Pulsa una tecla para salir..."
