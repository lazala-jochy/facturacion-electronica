import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Precache del shell (JS/CSS/HTML) para modo offline en la imagen web. Electron no lo usa
    // (no registra el service worker, ver main.tsx) -- `file://` no lo soporta bien y ahí ya
    // funciona offline de forma nativa. injectRegister:false porque el registro se hace a mano
    // con rutas absolutas en main.tsx (con base:"./" para Electron, la inyección automática del
    // plugin generaría una ruta relativa al sw.js que rompe con deep-links de React Router).
    VitePWA({
      injectRegister: false,
      registerType: "autoUpdate",
      manifest: {
        name: "Lazala Facturación",
        short_name: "Lazala",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0b57d0",
        icons: [
          { src: "/default.png", sizes: "192x192", type: "image/png" },
          { src: "/default.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Solo el shell de la app; las llamadas a /api y /uploads siempre van a la red (la
        // cola offline ya maneja esos casos -- cachearlas aquí serviría datos desactualizados).
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // Necesario para cargar el build desde `file://` en Electron (rutas relativas).
  base: "./",
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://backend:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: "http://backend:3001",
        changeOrigin: true,
      },
    },
  },
})
