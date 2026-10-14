import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { enrolTotp } from '../support/mfa'
import { totp } from '../support/totp'

// M5 admin screens end to end on the dev project, in a throwaway organisation:
// review queue (flagged first, photos side by side, reject needs a note, audit),
// absent list, sites (typed coordinates, map pick, edit, deactivate), reports
// (CSV with formula escaping, Excel as text cells) and settings.
const url = process.env.VITE_SUPABASE_URL!
const secret = process.env.SUPABASE_SECRET_KEY
test.skip(!secret, 'SUPABASE_SECRET_KEY not set')

const SITE = { latitude: 11.8311, longitude: 13.151 }
const run = randomUUID().slice(0, 8)
const adminEmail = `admin-${run}@attendance-dev.test`
const adminPassword = `Pw-${randomUUID()}`
const EVIL = '=Evil Worker' // a name that would be a formula in a spreadsheet
const ABSENT = 'Absent Worker'
// 1x1 JPEG
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
let orgId = ''
let adminUserId = ''
let adminTotp = ''
let absentStaffId = ''
let siteId = ''
const userIds: string[] = []

// The screens filter by "today" in the organisation's time zone (Africa/Lagos,
// UTC+1, no DST). Seeded events and the browser clock are kept on the same
// local day, so a run that crosses midnight can't disagree with itself.
const LAGOS_OFFSET = 3_600_000
const DAY = 86_400_000
const LATEST = (23 * 60 + 50) * 60_000 // 23:50 local
let base = Date.now() - 3 * 60_000
const timeOfDay = (base + LAGOS_OFFSET) % DAY
if (timeOfDay > LATEST) base -= timeOfDay - LATEST
const pageNow = base + 4 * 60_000 // after both seeded events, same local day

const svc = () => createClient(url, secret!, { auth: { persistSession: false } })

test.beforeAll(async () => {
  const s = svc()
  const { data: org, error } = await s.from('organizations')
    .insert({ name: `E2E Admin ${run}`, slug: `adm-${run}`, site_photo_required: true, geofence_mode: 'flag' }).select('id').single()
  if (error) throw error
  orgId = org.id
  const { data: site } = await s.from('work_sites').insert({ organization_id: orgId, name: 'Main Site', ...SITE, radius_m: 200, active: true }).select('id').single()
  siteId = site!.id

  const user = async (email: string) => {
    const { data } = await s.auth.admin.createUser({ email, password: adminPassword, email_confirm: true })
    userIds.push(data.user!.id)
    return data.user!.id
  }
  const adminUser = await user(adminEmail)
  adminUserId = adminUser
  await s.from('staff').insert({ organization_id: orgId, user_id: adminUser, full_name: 'E2E Admin', staff_code: 'ADM-1', role: 'admin', status: 'active' })
  // Two-step login is required for admins: set up their authenticator up front.
  const adminClient = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  await adminClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
  adminTotp = await enrolTotp(adminClient)
  const evilUser = await user(`evil-${run}@attendance-dev.test`)
  const { data: evil } = await s.from('staff')
    .insert({ organization_id: orgId, user_id: evilUser, full_name: EVIL, staff_code: 'W-1', role: 'worker', status: 'active' }).select('id').single()
  const { data: absent } = await s.from('staff').insert({ organization_id: orgId, full_name: ABSENT, staff_code: 'W-2', role: 'worker', status: 'active' }).select('id').single()
  absentStaffId = absent!.id

  const ref = `${orgId}/${evil!.id}.jpg`
  await s.storage.from('reference-photos').upload(ref, JPEG, { contentType: 'image/jpeg' })
  await s.from('staff').update({ reference_photo_path: ref }).eq('id', evil!.id)

  for (const [i, lat] of [[0, SITE.latitude], [1, SITE.latitude + 0.018]] as const) {
    const id = randomUUID()
    for (const kind of ['face', 'site']) {
      await s.storage.from('event-photos').upload(`${orgId}/${id}/${kind}.jpg`, JPEG, { contentType: 'image/jpeg' })
    }
    const { error: evError } = await s.from('attendance_events').insert({
      id, organization_id: orgId, staff_id: evil!.id, captured_by: evilUser, site_id: site!.id, type: 'CLOCK_IN',
      captured_at: new Date(base + i * 60_000).toISOString(), latitude: lat, longitude: SITE.longitude, accuracy_m: 12,
      face_photo_path: `${orgId}/${id}/face.jpg`, site_photo_path: `${orgId}/${id}/site.jpg`,
    })
    if (evError) throw evError
  }
})

test.afterAll(async () => {
  if (!orgId) return
  const s = svc()
  for (const bucket of ['event-photos', 'reference-photos']) {
    const { data: entries } = await s.storage.from(bucket).list(orgId, { limit: 1000 })
    for (const entry of entries ?? []) {
      const { data: files } = await s.storage.from(bucket).list(`${orgId}/${entry.name}`)
      await s.storage.from(bucket).remove(files?.length ? files.map((f) => `${orgId}/${entry.name}/${f.name}`) : [`${orgId}/${entry.name}`])
    }
  }
  await s.from('audit_log').delete().eq('organization_id', orgId)
  await s.from('attendance_events').delete().eq('organization_id', orgId)
  await s.from('staff').delete().eq('organization_id', orgId)
  await s.from('work_sites').delete().eq('organization_id', orgId)
  await s.from('organizations').delete().eq('id', orgId)
  for (const id of userIds) await s.auth.admin.deleteUser(id)
})

const login = async (page: Page) => {
  await page.clock.setFixedTime(pageNow)
  await page.goto('/')
  await page.getByRole('button', { name: 'Organisation admin? Log in here' }).click()
  await page.getByLabel('Email').fill(adminEmail)
  await page.getByLabel('Password').fill(adminPassword)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/verify/)
  await page.getByLabel('6-digit code').fill(totp(adminTotp))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/admin\/review/)
}

const imageLoaded = (page: Page, alt: string) =>
  expect.poll(() => page.getByRole('img', { name: alt }).first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)

test('review queue: flagged first, photos side by side, reject needs a note, approve, audited', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await login(page)
  await expect(page.getByRole('status')).toHaveText('2 clock-ins')
  const cards = page.locator('main ul > li')
  await expect(cards.first()).toContainText('Outside site (2.0 km)') // flagged first
  await imageLoaded(page, `Clock-in photo of ${EVIL}`)
  await imageLoaded(page, `Reference photo of ${EVIL}`)
  await imageLoaded(page, `Site photo from ${EVIL}`)

  // Only clock-ins without flags can be approved in bulk.
  await expect(page.getByRole('button', { name: 'Approve 1 without flags' })).toBeVisible()
  const unflaggedPhoto = cards.filter({ hasNotText: 'Outside site' }).getByRole('img', { name: `Clock-in photo of ${EVIL}` })
  const photoUrl = await unflaggedPhoto.getAttribute('src')

  const flagged = cards.filter({ hasText: 'Outside site (2.0 km)' })
  await flagged.getByRole('button', { name: /Reject clock-in/ }).click()
  await flagged.getByRole('button', { name: 'Confirm reject' }).click()
  await expect(flagged.getByRole('alert')).toHaveText('Add a short reason for rejecting.')
  await flagged.getByLabel('Reason for rejecting').fill('Not at the site')
  await flagged.getByRole('button', { name: 'Confirm reject' }).click()
  await expect(page.getByRole('status')).toHaveText('1 clock-in') // left "Needs review"
  // Updated in place: the other card's photo link was not signed again.
  expect(await unflaggedPhoto.getAttribute('src')).toBe(photoUrl)

  await page.getByRole('button', { name: 'Approve 1 without flags' }).click()
  await expect(page.getByText('No clock-ins match these filters.')).toBeVisible()

  await page.getByLabel('Status').selectOption('rejected')
  await expect(page.getByText('Note: Not at the site')).toBeVisible()

  const { data: log } = await svc().from('audit_log').select('action, details').eq('organization_id', orgId).eq('action', 'review_event')
  expect(log?.map((l) => (l.details as { decision: string }).decision).sort()).toEqual(['approved', 'rejected'])
})

test('absent list: no clock-in vs never clocked out', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Absent' }).click()
  await expect(page.getByRole('region', { name: 'Did not clock in' })).toContainText(ABSENT)
  await expect(page.getByRole('region', { name: 'Clocked in, never clocked out' })).toContainText(EVIL)
})

test('sites: add by typed coordinates, pick on the map, edit radius, deactivate', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await login(page)
  await page.getByRole('link', { name: 'Sites' }).click()
  await page.getByRole('button', { name: 'Add site' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Site name').fill('Typed Site')
  await expect(dialog.locator('.leaflet-container')).toBeVisible() // map opens for new sites
  await dialog.locator('.leaflet-container').click({ position: { x: 120, y: 100 } })
  await expect(dialog.getByLabel('Latitude')).not.toHaveValue('')
  await dialog.getByLabel('Latitude').fill('11.84')
  await dialog.getByLabel('Longitude').fill('13.16')
  await dialog.getByRole('button', { name: 'Save site' }).click()
  await expect(page.getByText('Typed Site', { exact: true })).toBeVisible()
  await expect(page.getByText('Radius 200 m · 11.84000, 13.16000')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Typed Site' }).click()
  await page.getByRole('dialog').getByLabel(/Radius/).fill('350')
  await page.getByRole('dialog').getByRole('button', { name: 'Save site' }).click()
  await expect(page.getByText('Radius 350 m')).toBeVisible()

  await page.getByRole('button', { name: 'Add site' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Deactivate Typed Site' }).click()
  await expect(page.getByRole('button', { name: 'Reactivate Typed Site' })).toBeVisible()
  const { data } = await svc().from('work_sites').select('radius_m, active').eq('organization_id', orgId).eq('name', 'Typed Site').single()
  expect(data).toEqual({ radius_m: 350, active: false })
})

test('reports: CSV escapes formulas; Excel stores names as text', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Reports' }).click()

  const downloads: { name: string; text: string }[] = []
  page.on('download', async (d) => downloads.push({ name: d.suggestedFilename(), text: readFileSync((await d.path())!, 'utf8') }))
  await page.getByRole('button', { name: 'Download CSV (2 files)' }).click()
  await expect(page.getByRole('status')).toContainText('Downloaded 2 clock-ins.')
  await expect.poll(() => downloads.length).toBe(2)
  const clockIns = downloads.find((d) => d.name.endsWith('_clock-ins.csv'))!.text
  const summary = downloads.find((d) => d.name.endsWith('_summary.csv'))!.text
  const rows = clockIns.replace(/^\uFEFF/, '').trimEnd().split('\r\n')
  expect(rows).toHaveLength(3)
  expect(rows[1]).toContain(",'=Evil Worker,W-1,Clock in,Main Site,")
  // Rejected is 0 or 1 depending on whether the review test ran first.
  expect(summary).toMatch(/'=Evil Worker,W-1,worker,active,1,1,0,2,1,[01]\r\n/) // hours worked 0: never clocked out
  expect(summary).toContain(`${ABSENT},W-2,worker,active,0,0,0,0,0,0`)

  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel (.xlsx)' }).click()])
  const book = XLSX.read(readFileSync((await xlsx.path())!))
  expect(book.SheetNames).toEqual(['Clock-ins', 'Summary'])
  const cell = book.Sheets['Clock-ins'].C2
  expect(cell).toMatchObject({ t: 's', v: EVIL })
  expect(cell.f).toBeUndefined()
})

test('settings: switch to block mode (audited)', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByLabel(/Block/).check()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toContainText('Saved.')
  const { data } = await svc().from('organizations').select('geofence_mode').eq('id', orgId).single()
  expect(data!.geofence_mode).toBe('block')
})

test('suspended organisation: banner, records still readable, changes refused with a clear message', async ({ page }) => {
  await svc().from('organizations').update({ status: 'suspended' }).eq('id', orgId)
  try {
    await login(page)
    await expect(page.getByRole('alert').filter({ hasText: 'subscription is suspended' })).toContainText('Workers can clock in until')
    await expect(page.getByRole('option', { name: `${EVIL} (W-1)` })).toBeAttached() // organisation records still load
    await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByLabel(/Allow and flag/).check()
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Changes are turned off' })).toBeVisible()
    const { data } = await svc().from('organizations').select('geofence_mode').eq('id', orgId).single()
    expect(data!.geofence_mode).toBe('block') // unchanged
  } finally {
    await svc().from('organizations').update({ status: 'active' }).eq('id', orgId)
  }
})

test('a clock-in recorded from someone else\'s login is flagged with who recorded it', async ({ page }) => {
  // As a supervisor would in crew mode; here the admin's login records it for the absent worker.
  const { error } = await svc().from('attendance_events').insert({
    id: randomUUID(), organization_id: orgId, staff_id: absentStaffId, captured_by: adminUserId, site_id: siteId, type: 'CLOCK_IN',
    captured_at: new Date(pageNow - 30_000).toISOString(), latitude: SITE.latitude, longitude: SITE.longitude, accuracy_m: 10,
    face_photo_path: null, site_photo_path: null,
  })
  if (error) throw error
  await login(page)
  const card = page.getByRole('listitem').filter({ hasText: ABSENT })
  await expect(card).toContainText('Recorded by E2E Admin (ADM-1)')
})

test('staff: an admin corrects a worker’s name and role (audited)', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Staff' }).click()
  await page.getByRole('button', { name: `Edit ${ABSENT}` }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Edit W-2' })).toBeFocused()
  await dialog.getByLabel('Full name').fill('Corrected Name')
  await dialog.getByLabel('Supervisor').check()
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Corrected Name' })
  await expect(row).toContainText('W-2 · supervisor')
  const { data: log } = await svc().from('audit_log').select('details').eq('target_id', absentStaffId).eq('action', 'update_staff')
  expect(log?.[0].details).toEqual({ before: { full_name: ABSENT, role: 'worker' }, after: { full_name: 'Corrected Name', role: 'supervisor' } })
})
