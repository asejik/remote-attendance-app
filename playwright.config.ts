import { defineConfig, devices } from '@playwright/test'

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
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npx vite build && npx vite preview --host ::1 --port 4173 --strictPort', // typecheck runs separately
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
})
