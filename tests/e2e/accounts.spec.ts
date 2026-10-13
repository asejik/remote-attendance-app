import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// M3 flow on the dev project: admin adds a worker (with reference photo), the
// worker logs in with code + PIN and accepts the notice, the admin deactivates
// them, and their next login is refused. Needs E2E_ADMIN_* in the local .env.
const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const org = process.env.E2E_ORG_SLUG ?? 'demo'
test.skip(!adminEmail || !adminPassword || !process.env.SUPABASE_SECRET_KEY, 'E2E_ADMIN_* / SUPABASE_SECRET_KEY not set')

// 1x1 JPEG.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)
const workerName = `E2E Worker ${Date.now()}`

const adminLogin = async (page: Page) => {
  await page.goto('/v2/login')
  await page.getByRole('button', { name: 'Organisation admin? Log in here' }).click()
  await page.getByLabel('Email').fill(adminEmail!)
  await page.getByLabel('Password').fill(adminPassword!)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible()
}

const workerLogin = async (page: Page, code: string, pin: string) => {
  await page.goto('/v2/login')
  await page.getByLabel('Organisation').fill(org)
  await page.getByLabel('Staff code').fill(code)
  await page.getByLabel('PIN (6 digits)').fill(pin)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

const logOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/v2\/login/)
}

test.afterAll(async () => {
  const svc = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  const { data } = await svc.from('staff').select('id, user_id, organization_id').eq('full_name', workerName)
  for (const s of data ?? []) {
    await svc.storage.from('reference-photos').remove([`${s.organization_id}/${s.id}.jpg`])
    await svc.from('audit_log').delete().eq('target_id', s.id)
    await svc.from('staff').delete().eq('id', s.id)
    if (s.user_id) await svc.auth.admin.deleteUser(s.user_id)
  }
})

test('admin adds a worker, the worker logs in with a PIN, and deactivation blocks them', async ({ page }) => {
  test.setTimeout(90_000)
  page.on('dialog', (dialog) => dialog.accept())

  // Admin adds a worker with a reference photo and gets the PIN once.
  await adminLogin(page)
  await page.getByRole('button', { name: 'Add worker' }).click()
  await page.getByLabel('Full name').fill(workerName)
  await page.getByLabel(/Reference photo/).setInputFiles({ name: 'face.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await page.getByRole('dialog').getByRole('button', { name: 'Add worker' }).click()
  const code = (await page.getByTestId('new-staff-code').textContent())!.trim()
  const pin = (await page.getByTestId('new-pin').textContent())!.trim()
  expect(code).toMatch(/^W-\d{4}$/)
  expect(pin).toMatch(/^\d{6}$/)
  await page.getByRole('button', { name: 'Done' }).click()
  const row = page.getByRole('listitem').filter({ hasText: workerName })
  await expect(row).toBeVisible()
  await expect(row.getByRole('img', { name: `Reference photo of ${workerName}` })).toBeVisible()
  await logOut(page)

  // Worker: wrong PIN is refused, the right PIN leads to the notice, then home.
  await workerLogin(page, code, pin === '000000' ? '111111' : '000000')
  await expect(page.getByRole('alert')).toHaveText('Organisation, staff code or PIN is not correct.')
  await workerLogin(page, code, pin)
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
  await page.getByRole('button', { name: 'I understand and agree' }).click()
  await expect(page.getByRole('heading', { name: workerName })).toBeVisible()

  // Reopening goes straight back in (no second consent).
  await page.goto('/v2/login')
  await expect(page.getByRole('heading', { name: workerName })).toBeVisible()
  await logOut(page)

  // Admin deactivates the worker; their next login is refused.
  await adminLogin(page)
  await page.getByRole('button', { name: `Deactivate ${workerName}` }).click()
  await expect(page.getByRole('listitem').filter({ hasText: workerName })).toContainText('deactivated')
  await logOut(page)
  await workerLogin(page, code, pin)
  await expect(page.getByRole('alert')).toHaveText('This account has been deactivated. Please contact your admin.')
})
