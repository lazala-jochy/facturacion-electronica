# Facturacion Electronica RD (Desktop App)

Aplicacion de escritorio para facturacion electronica en Republica Dominicana usando:

- `frontend`: React + Vite + Tailwind
- `backend`: Node.js + Prisma + SQLite
- `electron`: contenedor desktop

---

## 1) Requisitos para instalar en una PC

En la PC destino necesitas:

- [Node.js 20+ LTS](https://nodejs.org/)
- `npm` (viene con Node.js)
- Windows 10/11 (para `.exe`) o macOS/Linux para desarrollo

Verifica:

```bash
node -v
npm -v
```

---

## 2) Instalacion del proyecto

Desde la raiz del proyecto:

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../electron && npm install
```

---

## 3) Base de datos (Prisma + SQLite)

La base de desarrollo es **`backend/prisma/dev.db`**. Los esquemas viven en `backend/prisma/schema.prisma` y las migraciones en `backend/prisma/migrations/`.

### Aplicar migraciones (lo habitual)

Desde la carpeta **`backend`**:

**Desarrollo** (aplica migraciones pendientes; si cambiaste el schema, crea una migración nueva y la aplica):

```bash
cd backend
npx prisma migrate dev
```

Equivale a:

```bash
cd backend
npm run migrate:dev
```

**Producción o CI** (solo aplica migraciones ya versionadas, sin preguntar ni generar archivos nuevos):

```bash
cd backend
npx prisma migrate deploy
```

Equivale a:

```bash
cd backend
npm run migrate:deploy
```

### Cliente de Prisma (tras cambiar `schema.prisma`)

```bash
cd backend
npx prisma generate
```

O:

```bash
cd backend
npm run prisma:generate
```

### Primera instalación en una máquina nueva

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
```

> **`migrate deploy`** no crea migraciones; úsalo cuando ya existan en el repo. Para iterar el modelo en local, usa **`migrate dev`**.

### Cotizaciones (RD / DGII)

El modelo incluye **`cotizaciones`** e **`cotizacion_items`** (ITBIS 18%). Tras cambios grandes de esquema en desarrollo se puede sincronizar con:

```bash
cd backend
npx prisma db push
```

En producción conviene generar migraciones con `migrate dev` desde un estado limpio y versionarlas en `prisma/migrations/`.

---

## 4) Ejecutar en modo desarrollo (desktop + auth + dashboard)

Abre **3 terminales**:

### Terminal 1: Backend

```bash
cd backend
npm run dev
```

### Terminal 2: Frontend (Vite)

```bash
cd frontend
npm run dev
```

### Terminal 3: Electron

```bash
cd electron
npm run start
```

La app de escritorio abrira y cargara el frontend en `http://localhost:5173`, consumiendo backend en `http://localhost:3001`.

---

## 5) Build de produccion por modulo

### Opcion rapida (un solo comando desde Electron)

```bash
cd electron
npm run build:modules
```

Este comando ejecuta en orden:

1. `frontend`: `npm run build`
2. `backend`: `npx tsc --noEmit`
3. `electron`: `npm run build`

### Frontend

```bash
cd frontend
npm run build
```

Genera: `frontend/dist`

### Backend (TypeScript check)

```bash
cd backend
npx tsc --noEmit
```

### Electron

```bash
cd electron
npm run build
```

Genera: `electron/dist`

---

## 6) Generar instaladores por sistema operativo

Ya esta configurado con `electron-builder`.

### Windows (NSIS `.exe`)

Desde la carpeta `electron`:

```bash
cd electron
npm run dist:win
```

Este comando hace:

1. Build de frontend (`../frontend/dist`)
2. Build de backend (`../backend/dist`)
3. Build de Electron main/preload (`electron/dist`)
4. Empaquetado NSIS para Windows (`.exe`)

El instalador se genera en:

- `electron/dist/*.exe`

### macOS (`.dmg` / `.zip`)

Desde la carpeta `electron`:

```bash
cd electron
npm run build:all
npx electron-builder --mac dmg zip
```

Archivos generados (aprox):

- `electron/dist/*.dmg`
- `electron/dist/*-mac.zip`

### Linux (`.AppImage` / `.deb`)

Desde la carpeta `electron`:

```bash
cd electron
npm run build:all
npx electron-builder --linux AppImage deb
```

Archivos generados (aprox):

- `electron/dist/*.AppImage`
- `electron/dist/*.deb`

> Importante: genera cada instalador en su propio sistema operativo (Windows en Windows, macOS en macOS, Linux en Linux).

---

## 7) Instalacion por sistema operativo (usuario final)

En la maquina destino el usuario final **NO necesita Node.js**.

### Windows

1. Copiar el instalador `.exe`
2. Ejecutarlo y completar el wizard (NSIS)
3. Abrir desde escritorio o menu inicio

### macOS

1. Abrir el `.dmg`
2. Arrastrar la app a `Applications`
3. Si Gatekeeper bloquea, abrir con click derecho > `Open`

### Linux

Para `.AppImage`:

```bash
chmod +x Facturacion*.AppImage
./Facturacion*.AppImage
```

Para `.deb` (Debian/Ubuntu):

```bash
sudo dpkg -i facturacion*.deb
sudo apt-get install -f
```

La app en produccion:

- Carga frontend local (sin Vite)
- Levanta backend automaticamente al iniciar
- Guarda SQLite en carpeta de usuario de la app

---

## 8) Desarrollo en diferentes OS

Los comandos de desarrollo son los mismos en Windows, macOS y Linux:

### Backend

```bash
cd backend
npm run dev
```

### Frontend

```bash
cd frontend
npm run dev
```

### Electron

```bash
cd electron
npm run start
```

---

## 9) Comandos de verificacion rapida

```bash
cd frontend && npm run lint && npm run build
cd ../backend && npx tsc --noEmit
cd ../electron && npm run build:modules
```

---

## 10) Estructura del proyecto

```text
facturacion-electronica/
  backend/
  frontend/
  electron/
  shared/
```

---

## 11) Troubleshooting

- **No abre estilos Tailwind**: verifica que frontend este corriendo (`npm run dev`) y que `src/index.css` tenga `@import "tailwindcss";`.
- **Error de login/register**: confirma backend en `http://localhost:3001`.
- **Electron pantalla en blanco**: revisa que Vite este arriba en `http://localhost:5173`.
- **Error al generar `.exe`**: ejecuta `npm install` dentro de `electron` y vuelve a correr `npm run dist:win`.
- **Error de firma en macOS**: para distribucion publica necesitas certificado Apple Developer ID.

