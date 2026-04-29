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

## 3) Configuracion de base de datos (primera vez)

Desde `backend`:

```bash
npx prisma generate
```

> La base SQLite usada es `backend/prisma/dev.db`.

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

## 6) Generar instalador Windows (.exe)

Ya esta configurado con `electron-builder`.

Desde la carpeta `electron` ejecuta:

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

> Importante: para generar instalador de Windows, ejecuta este comando en Windows.

---

## 7) Instalar en otra PC (usuario final)

En la PC destino (usuario final) **NO necesita Node.js**.

Solo necesitas:

1. Copiar el instalador generado (`.exe`)
2. Ejecutarlo y completar el wizard de instalacion
3. Abrir **Facturacion Electronica RD** desde escritorio o menu inicio

La app en produccion:

- Carga frontend local (sin Vite)
- Levanta backend automaticamente al iniciar
- Guarda SQLite en carpeta de usuario de la app

---

## 8) Comandos de verificacion rapida

```bash
cd frontend && npm run lint && npm run build
cd ../backend && npx tsc --noEmit
cd ../electron && npm run build
```

---

## 9) Estructura del proyecto

```text
facturacion-electronica/
  backend/
  frontend/
  electron/
  shared/
```

---

## 10) Troubleshooting

- **No abre estilos Tailwind**: verifica que frontend este corriendo (`npm run dev`) y que `src/index.css` tenga `@import "tailwindcss";`.
- **Error de login/register**: confirma backend en `http://localhost:3001`.
- **Electron pantalla en blanco**: revisa que Vite este arriba en `http://localhost:5173`.
- **Error al generar `.exe`**: ejecuta `npm install` dentro de `electron` y vuelve a correr `npm run dist:win`.

