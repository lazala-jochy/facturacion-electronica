import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Necesario para cargar el build desde `file://` en Electron (rutas relativas).
  base: "./",
})
