import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base` must match the GitHub repository name so the site works at
// https://<username>.github.io/gridiron-picks/
export default defineConfig({
  base: '/gridiron-picks/',
  server: { port: 5180 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Gridiron Picks',
        short_name: 'Gridiron',
        description: "Weekly NFL & college football pick'em",
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/gridiron-picks/',
        scope: '/gridiron-picks/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Live scores: always try the network, fall back to a recent copy offline.
            urlPattern: ({ url }) => /^(site|site\.web|sports\.core)\.api\.espn\.com$/.test(url.hostname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'espn-api',
              networkTimeoutSeconds: 4, // flaky signal: fall back to saved copy fast
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Team logos never change; cache them hard.
            urlPattern: ({ url }) => url.hostname === 'a.espncdn.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'espn-logos',
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
