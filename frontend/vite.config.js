import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendPort = Number(process.env.VITE_PORT || 5173)
const backendPort = Number(process.env.VITE_BACKEND_PORT || 5001)
const backendTarget = process.env.VITE_BACKEND_TARGET || `http://127.0.0.1:${backendPort}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/admin.js': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/employee.js': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/manager.js': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/admin.css': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/style.css': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
