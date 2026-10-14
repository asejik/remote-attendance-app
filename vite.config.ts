import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

// Headers from public/_headers (the "/*" block), reused by `vite preview` so
// local and E2E runs enforce the same Content-Security-Policy as production.
// Only the site-wide `/*` block (other blocks apply to single paths).
const securityHeaders = Object.fromEntries(
  (readFileSync('public/_headers', 'utf8').split(/^(?=\/)/m).find((block) => block.startsWith('/*')) ?? '').split('\n')
    .filter((line) => /^\s+[A-Za-z-]+:/.test(line))
    .map((line) => {
      const [name, ...value] = line.trim().split(':')
      return [name, value.join(':').trim()]
    }),
)

// https://vitejs.dev/config/
export default defineConfig({
  preview: { headers: securityHeaders },
  define: {
    // Shown on the diagnostics screen and (later) sent with each event.
    __APP_VERSION__: JSON.stringify(
      `${(process.env.VITE_APP_VERSION ?? process.env.npm_package_version ?? '0.0.0').replace(/^v/, '')}+${(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local').slice(0, 7)}`,
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
