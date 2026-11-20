import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',   // GitHub Pages de proyecto: '/<repo>/'
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FincApp', short_name: 'FincApp', description: 'Cuaderno de campo para productores', lang: 'es',
        theme_color: '#245442', background_color: '#F4F6F2', display: 'standalone', start_url: '.', scope: '.', orientation: 'portrait',
        categories: ['productivity', 'business'],
        icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], maximumFileSizeToCacheInBytes: 4_000_000,
        // Imágenes satelitales ya vistas: quedan guardadas para usar el mapa en el campo sin señal.
        runtimeCaching: [{ urlPattern: /^https:\/\/(tiles\.maps\.eox\.at|server\.arcgisonline\.com|sh\.dataspace\.copernicus\.eu)\//, handler: 'CacheFirst',
          options: { cacheName: 'satelite', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } } }],
      },
    }),
  ],
  clearScreen: false,
  server: { port: 5173, strictPort: true },   // Tauri espera este puerto
  build: { target: 'es2022', sourcemap: false },
})
