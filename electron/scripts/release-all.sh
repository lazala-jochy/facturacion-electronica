#!/usr/bin/env sh
# Un solo comando: genera Y publica los instaladores de Windows y macOS desde esta Mac.
# Usa el Wine portable que electron-builder cachea solo (no depende de Homebrew).
set -e

PUBLISH="${1:-always}"

cd "$(dirname "$0")/.."

echo ""
echo "=== Compilando frontend + backend + electron ==="
npm run build:all

echo ""
echo "=== Generando Prisma Client (engine nativo + Windows) ==="
npm --prefix ../backend run prisma:generate

echo ""
echo "=== Windows (NSIS .exe) ==="
CSC_IDENTITY_AUTO_DISCOVERY=false dotenv -e .env -- electron-builder --win nsis --publish "$PUBLISH"

echo ""
echo "=== macOS (.dmg / .zip) ==="
CSC_IDENTITY_AUTO_DISCOVERY=false dotenv -e .env -- electron-builder --mac dmg zip --publish "$PUBLISH"

echo ""
echo "Listo. Revisa la carpeta electron/release/"
