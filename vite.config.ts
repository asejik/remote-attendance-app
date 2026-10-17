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
        name: 'SiteProof',
        short_name: 'SiteProof',
        description: 'Clock in and out with photo and location proof, even offline.',
        theme_color: '#0F6B63',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}', 'models/*'], // woff2: the bundled fonts, for offline use
        // Admin-only libraries (Excel export, site map) aren't precached, so workers'
        // phones don't download them; they're cached the first time an admin uses them.
        // The link-preview image is only for WhatsApp and other link previews.
        globIgnores: ['**/assets/xlsx-*', '**/assets/SiteMap-*', 'og-image.png'],
        runtimeCaching: [{
          urlPattern: /\/assets\/(xlsx|SiteMap)-[\w-]+\.(js|css)$/,
          handler: 'CacheFirst', // file names change with every build
          options: { cacheName: 'admin-libraries', expiration: { maxEntries: 10 } },
        }],
        // The face-api chunk (lazy, but precached for offline clock-in) is ~650 kB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
})
