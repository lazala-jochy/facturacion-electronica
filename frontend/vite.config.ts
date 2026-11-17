import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
