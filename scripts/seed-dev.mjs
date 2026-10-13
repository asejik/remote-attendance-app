// Seeds the DEV project with a demo organisation for building and testing the UI.
// Idempotent: re-running reuses existing rows and resets the demo passwords.
// Usage: node scripts/seed-dev.mjs   (needs SUPABASE_URL + SUPABASE_SECRET_KEY in .env)
// Prints the demo logins; keep them in the private repo, never commit them here.
import { randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env')) process.loadEnvFile('.env')
const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required')
if (process.env.SEED_ALLOW !== 'dev') throw new Error('Refusing to run: set SEED_ALLOW=dev to confirm this is the dev project')

const svc = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const check = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

const ORG = { name: 'Demo Construction Ltd', slug: 'demo' }
const SITES = [
  { name: 'Demo Site North', latitude: 11.8333, longitude: 13.15, radius_m: 250 },
  { name: 'Demo Site South', latitude: 11.8, longitude: 13.17, radius_m: 250 },
  { name: 'Demo Office', latitude: 8.4966, longitude: 4.5421, radius_m: 100 },
]
const PEOPLE = [
  { code: 'ADM-01', name: 'Demo Admin', role: 'admin', email: 'demo.admin@attendance-dev.test' },
  { code: 'SUP-01', name: 'Demo Supervisor', role: 'supervisor', email: 'demo.supervisor@attendance-dev.test' },
  { code: 'WRK-01', name: 'Demo Worker One', role: 'worker', email: 'demo.worker1@attendance-dev.test' },
  { code: 'WRK-02', name: 'Demo Worker Two', role: 'worker', email: 'demo.worker2@attendance-dev.test' },
]

const org = check(await svc.from('organizations').upsert(ORG, { onConflict: 'slug' }).select().single(), 'organisation')

for (const site of SITES) {
  const existing = check(await svc.from('work_sites').select('id').eq('organization_id', org.id).eq('name', site.name), 'find site')
  if (!existing.length) check(await svc.from('work_sites').insert({ ...site, organization_id: org.id, active: true }), `site ${site.name}`)
}

const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
const logins = []
for (const p of PEOPLE) {
  const password = `Demo-${randomInt(100000, 999999)}`
  let user = list.users.find((u) => u.email === p.email)
  if (user) {
    check(await svc.auth.admin.updateUserById(user.id, { password }), `reset ${p.email}`)
  } else {
    user = check(await svc.auth.admin.createUser({ email: p.email, password, email_confirm: true, user_metadata: { full_name: p.name } }), `create ${p.email}`).user
  }
  check(await svc.from('staff').upsert(
    { organization_id: org.id, user_id: user.id, full_name: p.name, staff_code: p.code, role: p.role, status: 'active' },
    { onConflict: 'organization_id,staff_code' },
  ), `staff ${p.code}`)
  logins.push({ role: p.role, email: p.email, password })
}

console.log(`Seeded organisation "${org.name}" (${org.id}) with ${SITES.length} sites.`)
console.table(logins)
