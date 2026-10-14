// Applies the app's required settings to a Supabase project (idempotent):
//   - Auth: public sign-up on/off, site URL, redirect allow-list, password length
//   - Vault: project_url and cron_secret for the daily photo-retention job
// Usage (dev):  node scripts/configure-supabase.mjs --dry-run
// Env: PROJECT_REF (or SUPABASE_URL), SUPABASE_ACCESS_TOKEN, SITE_URL,
//      REDIRECT_URLS (comma-separated), CRON_SECRET, DISABLE_SIGNUP=true|false
import { existsSync } from 'node:fs'

if (existsSync('.env') && !process.env.CI) process.loadEnvFile('.env')
const dryRun = process.argv.includes('--dry-run')
const env = (name, fallback) => {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') throw new Error(`Missing ${name}`)
  return value
}

const ref = process.env.PROJECT_REF || env('SUPABASE_URL').replace(/^https:\/\/([^.]+)\..*$/, '$1')
const token = env('SUPABASE_ACCESS_TOKEN')
const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'configure-supabase' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const wanted = {
  disable_signup: env('DISABLE_SIGNUP', 'true') === 'true',
  site_url: env('SITE_URL'),
  uri_allow_list: env('REDIRECT_URLS', `${env('SITE_URL')}/**`),
  password_min_length: 12, // admins see every worker's photos and locations (P04 M2)
  // Admins must use two-step login (migration 20261015150000); a new project has it off.
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
}
const current = await api('GET', '/config/auth')
const changes = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => current[k] !== v))
console.log(`Project ${ref}: auth changes`, Object.keys(changes).length ? changes : 'none')
if (Object.keys(changes).length && !dryRun) await api('PATCH', '/config/auth', changes)

// Vault secrets for the cron job (values never printed).
const projectUrl = `https://${ref}.supabase.co`
const cronSecret = env('CRON_SECRET')
if (!/^[A-Za-z0-9_-]{32,}$/.test(cronSecret)) throw new Error('CRON_SECRET must be 32+ URL-safe characters')
const upsert = (name, value, description) => `
  do $v$ declare sid uuid; begin
    select id into sid from vault.secrets where name = '${name}';
    if sid is null then perform vault.create_secret('${value}', '${name}', '${description}');
    else perform vault.update_secret(sid, '${value}'); end if;
  end $v$;`
if (dryRun) {
  console.log('Vault: would set project_url and cron_secret')
} else {
  await api('POST', '/database/query', {
    query: upsert('project_url', projectUrl, 'Base URL for scheduled Edge Function calls') +
      upsert('cron_secret', cronSecret, 'Shared secret for purge-expired-photos'),
  })
  console.log('Vault: project_url and cron_secret set')
}
