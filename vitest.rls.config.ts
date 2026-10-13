import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Access-rule (RLS) tests run against the dev Supabase project with real users.
// They need SUPABASE_SECRET_KEY in the local .env and are skipped without it (CI).
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  test: {
    include: ['tests/rls/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
