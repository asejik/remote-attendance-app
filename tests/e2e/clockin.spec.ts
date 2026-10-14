import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { createClient } from '@supabase/supabase-js'

// M4 clock-in on the new system, end to end against the dev project:
// offline clock-in -> survives reload -> uploads on reconnect -> server record
// has distance/flags and a private photo; then clock-out; then block mode.
// Uses its own throwaway organisation. The test build bypasses the smile check.
const url = process.env.VITE_SUPABASE_URL!
const secret = process.env.SUPABASE_SECRET_KEY
test.skip(!secret, 'SUPABASE_SECRET_KEY not set')

const SITE = { latitude: 11.8311, longitude: 13.151 }
const run = randomUUID().slice(0, 8)
const slug = `e2e-${run}`
const code = 'W-0001'
const pin = '482913'
let orgId = ''
let userId = ''

const svc = () => createClient(url, secret!, { auth: { persistSession: false } })

test.use({ geolocation: { ...SITE, accuracy: 15 } })

test.beforeAll(async () => {
  const s = svc()
  const { data: org, error } = await s.from('organizations')
    .insert({ name: `E2E Clock-in ${run}`, slug, site_photo_required: false, geofence_mode: 'flag' }).select('id').single()
  if (error) throw error
  orgId = org.id
  await s.from('work_sites').insert({ organization_id: orgId, name: 'E2E Site', ...SITE, radius_m: 200, active: true })
  const { data: user } = await s.auth.admin.createUser({ email: `${code.toLowerCase()}@${slug}.staff.invalid`, password: randomUUID(), email_confirm: true })
  userId = user.user!.id
  const { data: staff } = await s.from('staff')
    .insert({ organization_id: orgId, user_id: userId, full_name: 'E2E Clocker', staff_code: code, role: 'worker', status: 'active' }).select('id').single()
  await s.rpc('staff_pin_set', { p_staff_id: staff!.id, p_pin: pin })
})

test.afterAll(async () => {
  if (!orgId) return
  const s = svc()
  const { data: folders } = await s.storage.from('event-photos').list(orgId, { limit: 1000 })
  for (const f of folders ?? []) {
    const { data: files } = await s.storage.from('event-photos').list(`${orgId}/${f.name}`)
    await s.storage.from('event-photos').remove((files ?? []).map((x) => `${orgId}/${f.name}/${x.name}`))
  }
  await s.from('audit_log').delete().eq('organization_id', orgId)
  await s.from('attendance_events').delete().eq('organization_id', orgId)
  await s.from('staff').delete().eq('organization_id', orgId)
  await s.from('work_sites').delete().eq('organization_id', orgId)
  await s.from('organizations').delete().eq('id', orgId)
  if (userId) await s.auth.admin.deleteUser(userId)
})

test('offline clock-in uploads on reconnect; clock-out; block mode refuses outside the site', async ({ page, context }) => {
  test.setTimeout(120_000)

  // Log in (needs network the first time) and accept the notice.
  await page.goto('/')
  await page.getByLabel('Organisation').fill(slug)
  await page.getByLabel('Staff code').fill(code)
  await page.getByLabel('PIN (6 digits)').fill(pin)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: 'I understand and agree' }).click()
  await expect(page.getByText('CLOCKED OUT', { exact: true })).toBeVisible()
  await page.getByLabel('Your site').selectOption({ label: 'E2E Site' })
  await page.evaluate(async () => { await navigator.serviceWorker.ready })

  // Clock in with no network.
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Tap to clock IN' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this phone' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('1 waiting to upload')).toBeVisible()
  await expect(page.getByText('CLOCKED IN', { exact: true })).toBeVisible()

  // Still there after a reload while offline.
  await page.reload()
  await expect(page.getByText('1 waiting to upload')).toBeVisible()
  await expect(page.getByText('CLOCKED IN', { exact: true })).toBeVisible()

  // Back online: uploads by itself.
  await context.setOffline(false)
  await expect(page.getByText('All records uploaded')).toBeVisible({ timeout: 30_000 })

  const { data: events } = await svc().from('attendance_events').select('*').eq('organization_id', orgId)
  expect(events).toHaveLength(1)
  const ev = events![0]
  expect(ev.type).toBe('CLOCK_IN')
  expect(ev.within_radius).toBe(true)
  expect(ev.flags).toEqual([])
  expect(ev.accuracy_m).toBe(15)
  expect(ev.site_photo_path).toBeNull()
  expect(ev.face_photo_path).toBe(`${orgId}/${ev.id}/face.jpg`)
  const { data: photo } = await svc().storage.from('event-photos').download(ev.face_photo_path!)
  expect(photo!.size).toBeGreaterThan(1000)

  // Clock out online.
  await page.getByRole('button', { name: 'Tap to clock OUT' }).click()
  await expect(page.getByText('CLOCKED OUT', { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('All records uploaded')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Clocked out. Uploaded.' })).toBeVisible({ timeout: 30_000 })

  // Block mode: ~2 km away is refused before any photo is taken.
  await svc().from('organizations').update({ geofence_mode: 'block' }).eq('id', orgId)
  await context.setGeolocation({ latitude: SITE.latitude + 0.018, longitude: SITE.longitude, accuracy: 15 })
  // The screen uses cached settings until the fresh ones arrive; wait for them.
  await Promise.all([page.waitForResponse((r) => r.url().includes('/rest/v1/organizations')), page.reload()])
  await page.getByRole('button', { name: 'Tap to clock IN' }).click()
  await expect(page.getByRole('alert')).toContainText('You are about 2002 m from E2E Site')
  const { count } = await svc().from('attendance_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  expect(count).toBe(2)
})

test('a clock-in the server refuses twice is shown as not accepted, and "try again" uploads it', async ({ page }) => {
  test.setTimeout(120_000)
  await svc().from('organizations').update({ geofence_mode: 'flag' }).eq('id', orgId)
  // An earlier notice version: the worker is asked to accept the new one (audited).
  await svc().from('staff').update({ consent_version: 1 }).eq('user_id', userId)

  await page.goto('/')
  await page.getByLabel('Organisation').fill(slug)
  await page.getByLabel('Staff code').fill(code)
  await page.getByLabel('PIN (6 digits)').fill(pin)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Our privacy notice has changed' })).toBeVisible()
  await expect(page.getByText('Photos are deleted automatically after 60 days')).toBeVisible()
  await page.getByRole('button', { name: 'I understand and agree' }).click()
  await expect(page.getByText('CLOCKED OUT', { exact: true })).toBeVisible()
  const { data: me } = await svc().from('staff').select('id, consent_version').eq('user_id', userId).single()
  expect(me!.consent_version).toBe(2)
  const { data: log } = await svc().from('audit_log').select('details').eq('target_id', me!.id).eq('action', 'accept_consent')
  expect(log).toContainEqual({ details: { version: 2 } })
  await page.getByLabel('Your site').selectOption({ label: 'E2E Site' })

  // The server refuses the record as it would for a deactivated worker.
  const refuse = (route: import('@playwright/test').Route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) })
    : route.continue()
  await page.route('**/rest/v1/attendance_events*', refuse)

  await page.getByRole('button', { name: 'Tap to clock IN' }).click()
  // First refusal is retried (backoff 30 s); the second marks it not accepted.
  await expect(page.getByRole('alert').filter({ hasText: '1 record not accepted' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('alert')).toContainText('not allowed to send records')
  await expect(page.getByText('Not accepted', { exact: true })).toBeVisible()
  await expect(page.getByText('CLOCKED OUT', { exact: true })).toBeVisible() // a refused clock-in doesn't count

  await page.unroute('**/rest/v1/attendance_events*', refuse)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('All records uploaded')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('CLOCKED IN', { exact: true })).toBeVisible()
  const { count } = await svc().from('attendance_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  expect(count).toBe(3)
})

test('logging out with no network really signs the phone out', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel('Organisation').fill(slug)
  await page.getByLabel('Staff code').fill(code)
  await page.getByLabel('PIN (6 digits)').fill(pin)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByText(/CLOCKED (IN|OUT)/)).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Worker login' })).toBeVisible()
  await context.setOffline(false)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Worker login' })).toBeVisible()
  await page.waitForTimeout(1500) // no late redirect into the app
  await expect(page).toHaveURL(/\/$/)
})
