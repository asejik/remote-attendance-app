import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Test-account credentials (E2E_*) come from the local .env; CI has none.
if (existsSync('.env')) process.loadEnvFile('.env')

// E2E tests run against a production build (so the service worker is active),
// talking to the dev Supabase project configured in .env.
// IPv6 loopback on purpose: with WSL mirrored networking, connecting to a closed
// port on 127.0.0.1 hangs ~2 minutes instead of being refused, which stalls
// Playwright's "is a server already running?" check.
const BASE_URL = 'http://[::1]:4173'
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Pixel 7'],
      permissions: ['camera', 'geolocation'],
      launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    },
  }],
  webServer: {
    // Test build (VITE_E2E=1 enables the liveness bypass) goes to dist-e2e, never dist.
    command: 'VITE_E2E=1 npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --host ::1 --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
})
