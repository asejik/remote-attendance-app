// Creates a client organisation and its first admin (idempotent on slug/email).
// The admin gets a random password they never see; they set their own with
// "Forgot password?" on the login page. Prints no secrets.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY, ORG_NAME, ORG_SLUG, ADMIN_NAME, ADMIN_EMAIL
// Optional: SITE_PHOTO_REQUIRED=true|false, GEOFENCE_MODE=flag|block, PHOTO_RETENTION_DAYS
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env') && !process.env.CI) process.loadEnvFile('.env')
const need = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const org = {
  name: need('ORG_NAME'),
  slug: need('ORG_SLUG').toLowerCase(),
  site_photo_required: (process.env.SITE_PHOTO_REQUIRED ?? 'true') === 'true',
  geofence_mode: process.env.GEOFENCE_MODE === 'block' ? 'block' : 'flag',
  photo_retention_days: Number(process.env.PHOTO_RETENTION_DAYS ?? 60),
}
const admin = { name: need('ADMIN_NAME'), email: need('ADMIN_EMAIL').toLowerCase() }
if (!/^[a-z0-9-]{2,40}$/.test(org.slug)) throw new Error('ORG_SLUG: 2-40 lowercase letters, digits or dashes')
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.email)) throw new Error('ADMIN_EMAIL is not a valid email address')

const svc = createClient(need('SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const check = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

const existingOrg = check(await svc.from('organizations').select('id, name').eq('slug', org.slug).maybeSingle(), 'find organisation')
const orgRow = existingOrg ?? check(await svc.from('organizations').insert(org).select('id, name').single(), 'create organisation')
console.log(`${existingOrg ? 'Found' : 'Created'} organisation "${orgRow.name}" (${org.slug})`)

const users = check(await svc.auth.admin.listUsers({ perPage: 1000 }), 'list users').users
let user = users.find((u) => u.email === admin.email)
if (!user) {
  user = check(await svc.auth.admin.createUser({
    email: admin.email, password: randomBytes(32).toString('base64url'), email_confirm: true, user_metadata: { full_name: admin.name },
  }), 'create admin user').user
  console.log(`Created login for ${admin.email}`)
} else {
  console.log(`Login for ${admin.email} already exists`)
}

const staff = check(await svc.from('staff').select('id, organization_id, role').eq('user_id', user.id).maybeSingle(), 'find staff')
if (staff && staff.organization_id !== orgRow.id) throw new Error(`${admin.email} already belongs to another organisation`)
if (!staff) {
  check(await svc.from('staff').insert({
    organization_id: orgRow.id, user_id: user.id, full_name: admin.name, staff_code: 'ADM-01', role: 'admin', status: 'active',
  }), 'create admin staff record')
  console.log('Created admin staff record (staff code ADM-01)')
} else {
  console.log(`Admin staff record already exists (role ${staff.role})`)
}
console.log('Next: the admin opens the app, chooses "Organisation admin? Log in here" → "Forgot password?"')
