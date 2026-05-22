import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — presente em todas as páginas
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          // Leaflet — só carregado em páginas com mapa (~180 KB)
          'vendor-leaflet': ['leaflet', 'react-leaflet'],
          // UI utilitários
          'vendor-ui':      ['lucide-react', 'date-fns', 'zustand'],
          // Firebase Analytics — isolado para não bloquear bundle principal
          'vendor-firebase': ['firebase/app', 'firebase/analytics'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
