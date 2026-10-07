import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'TOKO SHIDQI BANGUNAN - Kasir POS',
        short_name: 'Shidqi POS',
        description: 'Aplikasi Kasir (POS) untuk Toko Bahan Bangunan Shidqi Bangunan',
        theme_color: '#d9701a',
        background_color: '#fdfbf7',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Kasir',
            short_name: 'Kasir',
            description: 'Buka halaman kasir',
            url: '/',
            icons: [{ src: '/icon-192.svg', sizes: '192x192' }]
          },
          {
            name: 'Stok',
            short_name: 'Stok',
            description: 'Lihat stok barang',
            url: '/stok',
            icons: [{ src: '/icon-192.svg', sizes: '192x192' }]
          },
          {
            name: 'Hutang',
            short_name: 'Hutang',
            description: 'Kelola hutang pelanggan',
            url: '/hutang',
            icons: [{ src: '/icon-192.svg', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true
  }
})