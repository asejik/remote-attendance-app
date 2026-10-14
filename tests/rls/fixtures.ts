import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'

type Client = SupabaseClient<Database>

const url = process.env.VITE_SUPABASE_URL!
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!
const secretKey = process.env.SUPABASE_SECRET_KEY!
export const hasCredentials = Boolean(url && anonKey && secretKey)
// CI's fresh-database job sets this so a missing credential can't silently skip the suite.
if (process.env.REQUIRE_RLS_TESTS === '1' && !hasCredentials) {
  throw new Error('REQUIRE_RLS_TESTS=1 but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY are missing')
}

// Calls a deployed Edge Function, optionally as a signed-in user.
export const callFunction = async (name: string, body: unknown, client?: Client) => {
  const token = client ? (await client.auth.getSession()).data.session?.access_token : undefined
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// Signs a fresh client in with a session returned by staff-login.
export const clientFromSession = async (tokens: { access_token: string; refresh_token: string }) => {
  const client = anon()
  const { error } = await client.auth.setSession(tokens)
  if (error) throw new Error(`setSession: ${error.message}`)
  return client
}

export const authPasswordGrant = async (email: string, password: string) => {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  return res.status
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }
export const service = () => createClient<Database>(url, secretKey, options)
export const anon = () => createClient<Database>(url, anonKey, options)

// Sample coordinates in Nigeria; offsets of ~0.018 deg latitude are ~2 km.
export const SITE_A = { latitude: 11.8311, longitude: 13.151 }
const SITE_B = { latitude: 8.4966, longitude: 4.5421 }

interface Person {
  userId: string
  staffId: string
  client: Client
}

export interface World {
  slugA: string
  slugB: string
  run: string
  orgA: string
  orgB: string
  siteA: string
  siteAInactive: string
  siteB: string
  workerA1: Person
  workerA2: Person
  supervisorA: Person
  deactivatedA3: Person
  adminA: Person
  adminB: Person
  userIds: string[]
}

const must = <T>(result: { data: T | null; error: unknown }, what: string): NonNullable<T> => {
  if (result.error || result.data === null) throw new Error(`${what}: ${JSON.stringify(result.error)}`)
  return result.data as NonNullable<T>
}

// Builds two organisations with people and sites using the service role, then
// signs each person in with the public key so their requests go through RLS.
export const buildWorld = async (): Promise<World> => {
  const svc = service()
  const run = randomUUID().slice(0, 8)
  const userIds: string[] = []

  const orgs = must(
    await svc.from('organizations').insert([
      { name: `RLS Test A ${run}`, slug: `rls-a-${run}` },
      { name: `RLS Test B ${run}`, slug: `rls-b-${run}` },
    ]).select('id, slug'),
    'create orgs',
  )
  const orgA = orgs.find((o) => o.slug.startsWith('rls-a'))!.id
  const orgB = orgs.find((o) => o.slug.startsWith('rls-b'))!.id

  const sites = must(
    await svc.from('work_sites').insert([
      // Bulk inserts send null (not the default) for keys missing from some rows.
      { organization_id: orgA, name: 'Site A', ...SITE_A, radius_m: 200, active: true },
      { organization_id: orgA, name: 'Old Site A', ...SITE_A, radius_m: 200, active: false },
      { organization_id: orgB, name: 'Site B', ...SITE_B, radius_m: 200, active: true },
    ]).select('id, name'),
    'create sites',
  )
  const siteId = (name: string) => sites.find((s) => s.name === name)!.id

  const person = async (org: string, code: string, role: 'admin' | 'supervisor' | 'worker', active = true): Promise<Person> => {
    const email = `rls-${code.toLowerCase()}-${run}@attendance-dev.test`
    const password = `Pw-${randomUUID()}`
    const created = await svc.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error || !created.data.user) throw new Error(`create user ${code}: ${created.error?.message}`)
    const user = created.data.user
    userIds.push(user.id)
    const { data: staff, error: staffError } = await svc.from('staff').insert({
      organization_id: org, user_id: user.id, full_name: `RLS ${code}`, staff_code: `${code}-${run}`, role,
      status: active ? 'active' : 'deactivated', deactivated_at: active ? null : new Date().toISOString(),
    }).select('id').single()
    if (staffError || !staff) throw new Error(`create staff ${code}: ${staffError?.message}`)
    const client = anon()
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw new Error(`sign in ${code}: ${signedIn.error.message}`)
    return { userId: user.id, staffId: staff.id, client }
  }

  return {
    run, orgA, orgB, slugA: `rls-a-${run}`, slugB: `rls-b-${run}`,
    siteA: siteId('Site A'), siteAInactive: siteId('Old Site A'), siteB: siteId('Site B'),
    workerA1: await person(orgA, 'A1', 'worker'),
    workerA2: await person(orgA, 'A2', 'worker'),
    supervisorA: await person(orgA, 'SA', 'supervisor'),
    deactivatedA3: await person(orgA, 'A3', 'worker', false),
    adminA: await person(orgA, 'AA', 'admin'),
    adminB: await person(orgB, 'AB', 'admin'),
    userIds,
  }
}

export const destroyWorld = async (w: World) => {
  await destroyOrgs([w.orgA, w.orgB], w.userIds)
}

// Removes leftovers from earlier runs that crashed before cleaning up.
export const purgeStaleWorlds = async () => {
  const svc = service()
  const { data: orgs } = await svc.from('organizations').select('id').like('slug', 'rls-%')
  const { data: users } = await svc.auth.admin.listUsers({ perPage: 1000 })
  const stale = (users?.users ?? [])
    .filter((u) => /^rls-.*@attendance-dev\.test$/.test(u.email ?? '') || /@rls-[ab]-[0-9a-f]{8}\.staff\.invalid$/.test(u.email ?? ''))
    .map((u) => u.id)
  if (orgs?.length || stale.length) await destroyOrgs((orgs ?? []).map((o) => o.id), stale)
}

const destroyOrgs = async (orgs: string[], knownUserIds: string[]) => {
  const svc = service()
  // Include Auth users created by the admin-staff function for these orgs.
  const { data: staffUsers } = await svc.from('staff').select('user_id').in('organization_id', orgs)
  const userIds = [...new Set([...knownUserIds, ...(staffUsers ?? []).map((s) => s.user_id).filter((id): id is string => !!id)])]
  for (const org of orgs) {
    for (const bucket of ['event-photos', 'reference-photos']) {
      const { data: folders } = await svc.storage.from(bucket).list(org, { limit: 1000 })
      for (const entry of folders ?? []) {
        const { data: files } = await svc.storage.from(bucket).list(`${org}/${entry.name}`, { limit: 1000 })
        const paths = files?.length ? files.map((f) => `${org}/${entry.name}/${f.name}`) : [`${org}/${entry.name}`]
        await svc.storage.from(bucket).remove(paths)
      }
    }
  }
  await svc.from('audit_log').delete().in('organization_id', orgs)
  await svc.from('attendance_events').delete().in('organization_id', orgs)
  await svc.from('staff').delete().in('organization_id', orgs)
  await svc.from('work_sites').delete().in('organization_id', orgs)
  await svc.from('organizations').delete().in('id', orgs)
  for (const id of userIds) {
    await svc.from('profiles').delete().eq('id', id) // created by the legacy signup trigger
    await svc.auth.admin.deleteUser(id)
  }
}

export const newEvent = (org: string, staffId: string, siteId: string | null, overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  organization_id: org,
  staff_id: staffId,
  site_id: siteId,
  type: 'CLOCK_IN' as const,
  captured_at: new Date().toISOString(),
  latitude: SITE_A.latitude,
  longitude: SITE_A.longitude,
  accuracy_m: 15,
  face_photo_path: 'x/face.jpg',
  site_photo_path: 'x/site.jpg',
  ...overrides,
})

export const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9])], { type: 'image/jpeg' })
