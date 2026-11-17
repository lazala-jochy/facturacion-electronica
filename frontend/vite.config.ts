import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Precache del shell (JS/CSS/HTML) para modo offline. injectRegister:false porque el
    // registro se hace a mano con rutas absolutas en main.tsx.
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
        // Un service worker nuevo activa YA (no se queda en "waiting" hasta que cierren todas
        // las pestañas) y toma control de las pestañas ya abiertas de inmediato. Sin esto, un
        // SW viejo puede seguir sirviendo un index.html precacheado que apunta a JS con hash
        // que ya no existe en el server nuevo -- el mismo bug de pantalla en blanco, pero
        // mediado por el service worker en vez de el caché HTTP (que ya tiene no-store).
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  // BrowserRouter usa rutas reales (ej. /dgii-pruebas/ecf-excel) y el backend devuelve el mismo
  // index.html para cualquier ruta (catch-all SPA). Con base relativa ("./"), un refresh en una
  // ruta de 2+ segmentos resolvía mal los assets (./assets/x.js se resuelve contra el directorio
  // de la URL actual, no contra la raíz) y el navegador recibía el index.html del catch-all donde
  // esperaba un JS -- de ahí "Expected a JavaScript module but server responded with text/html".
  base: "/",
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
