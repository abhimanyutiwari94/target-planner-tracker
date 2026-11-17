import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // works on GitHub Pages sub-paths and inside the Android app
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['logo.svg', 'favicon-64.png', 'icons/*.png', 'sw-extra.js'],
      manifest: {
        id: './',
        name: 'Target Planner and Tracker',
        short_name: 'Target Planner',
        description: 'Offline daily progress, targets, manpower, site photos and to-do app with PDF, Excel and Word reports.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#06213F',
        theme_color: '#0B3C6E',
        categories: ['productivity', 'business'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        importScripts: ['sw-extra.js'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
});
