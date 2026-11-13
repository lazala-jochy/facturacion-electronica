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
echo "=== Firmador DGII .NET (self-contained, sin depender del runtime del usuario) ==="
DOTNET_SIGNER_DIR="../backend/dotnet/DgiiXmlSigner"
dotnet publish "$DOTNET_SIGNER_DIR" -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
  -o "$DOTNET_SIGNER_DIR/publish/win-x64"
dotnet publish "$DOTNET_SIGNER_DIR" -c Release -r osx-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
  -o "$DOTNET_SIGNER_DIR/publish/osx-x64"

echo ""
echo "=== Motor de migraciones de Prisma para Windows (evita que el cliente lo descargue en el primer arranque) ==="
npm --prefix ../backend run fetch:win-engine

echo ""
echo "=== Windows (NSIS .exe) ==="
CSC_IDENTITY_AUTO_DISCOVERY=false dotenv -e .env -- electron-builder --win nsis --publish "$PUBLISH"

echo ""
echo "=== macOS (.dmg / .zip) ==="
CSC_IDENTITY_AUTO_DISCOVERY=false dotenv -e .env -- electron-builder --mac dmg zip --publish "$PUBLISH"

echo ""
echo "Listo. Revisa la carpeta electron/release/"
