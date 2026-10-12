import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // Shown on the diagnostics screen and (later) sent with each event.
    __APP_VERSION__: JSON.stringify(
      `${process.env.npm_package_version ?? '0.0.0'}+${(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local').slice(0, 7)}`,
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: precaches the app shell and face models so the app opens
    // and the liveness check runs with no network after the first visit.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered in main.tsx, skipped inside the native app
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Attendance',
        short_name: 'Attendance',
        description: 'Clock in and out with photo and location proof, even offline.',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}', 'models/*'],
        // The main bundle (face-api + tfjs) is ~1.2 MB; the default 2 MiB cap is close.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
})
