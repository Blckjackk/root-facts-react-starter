import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png', 'icons/icon-192x192.png', 'icons/icon-512x512.png', 'model/model.json', 'model/weights.bin', 'model/metadata.json'],
      manifest: {
        name: 'RootFacts - AI Plant/Root Recognition',
        short_name: 'RootFacts',
        description: 'Aplikasi AI untuk mengenali tanaman dan akar serta memberikan fakta menarik',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,bin}'],
        // weights.bin is 2.16MB, Workbox default limit is 2MB, so we increase it to 5MB
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }
    })
  ],
  server: {
    port: 3001,
    host: true
  }
});

