# Imagen única (web): backend Express + SPA de React servidos por el mismo proceso Node.
#
# No corre Electron ni toca SQLite local -- el backend habla directo con Postgres (Supabase),
# igual que la build de escritorio. Lo único que se compila especialmente para Linux es el
# firmador DGII (.NET), que en la build de escritorio solo se publica para macOS/Windows.
#
# Build:
#   docker build -t facturacion-electronica:web .
#   # Si el frontend necesita apuntar la API a otro lado que no sea /api (mismo origen):
#   docker build --build-arg VITE_API_URL=https://api.midominio.com -t facturacion-electronica:web .
#
# Run (ver .env.docker.example para las variables requeridas):
#   docker run --rm -p 3001:3001 --env-file .env.docker.example facturacion-electronica:web

ARG NODE_IMAGE=node:20-bookworm-slim

# ---------------------------------------------------------------------------
# 1) Frontend: build estático de Vite. VITE_API_URL=/api -> mismo origen que el backend.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------------------------------------------------------------------------
# 2) Firmador DGII (.NET): el único publish self-contained que no existe ya en el repo
#    es linux-x64 (ahí solo están osx-x64 y win-x64, empacados para Electron).
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dotnet-signer-build
WORKDIR /src
COPY backend/dotnet/DgiiXmlSigner/DgiiXmlSigner.csproj ./
RUN dotnet restore
COPY backend/dotnet/DgiiXmlSigner/ ./
RUN dotnet publish DgiiXmlSigner.csproj \
    -c Release \
    -r linux-x64 \
    --self-contained true \
    -p:PublishSingleFile=true \
    -p:IncludeNativeLibrariesForSelfExtract=true \
    -o /out

# ---------------------------------------------------------------------------
# 3) Backend: compila TypeScript y genera el cliente de Prisma (motor nativo = Linux,
#    porque este stage corre sobre la misma imagen base que el runtime final).
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# 4) node_modules de producción -- sin typescript/ts-node-dev/@types, para una imagen final chica.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS backend-prod-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate

# ---------------------------------------------------------------------------
# 5) Runtime final.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV PORT=3001
ENV UPLOADS_DIR=/data/uploads

WORKDIR /app/backend

COPY --from=backend-prod-deps /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY backend/prisma ./prisma
COPY backend/assets ./assets
# JS plano fuera de src/ (no pasa por tsc) -- controllers lo requieren por ruta relativa
# ("../../utils/...") esperando esto como hermano de dist/, igual que en el empaquetado Electron.
COPY backend/utils ./utils
COPY backend/package.json ./package.json

COPY --from=dotnet-signer-build /out/DgiiXmlSigner ./dotnet-signer/DgiiXmlSigner
RUN chmod +x ./dotnet-signer/DgiiXmlSigner

COPY --from=frontend-build /app/frontend/dist ./public

RUN mkdir -p /data/uploads/companies

EXPOSE 3001

CMD ["node", "dist/index.js"]
