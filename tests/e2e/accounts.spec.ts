import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { totp } from '../support/totp'

// M3 flow on the dev project: admin adds a worker (with reference photo), the
// worker logs in with code + PIN and accepts the notice, the admin deactivates
// them, and their next login is refused. Uses a throwaway admin in the demo
// organisation, who sets up two-step login through the real screen.
const org = process.env.E2E_ORG_SLUG ?? 'demo'
const secretKey = process.env.SUPABASE_SECRET_KEY
test.skip(!secretKey, 'SUPABASE_SECRET_KEY not set')
const svc = () => createClient(process.env.VITE_SUPABASE_URL!, secretKey!, { auth: { persistSession: false } })
const adminEmail = `e2e-accounts-admin-${randomUUID().slice(0, 8)}@attendance-dev.test`
const adminPassword = `Pw-${randomUUID()}`
let adminUserId = ''
let adminTotp = '' // learnt from the set-up screen on the first login

test.beforeAll(async () => {
  const s = svc()
  const { data: o } = await s.from('organizations').select('id').eq('slug', org).single()
  const { data: u } = await s.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true })
  adminUserId = u.user!.id
  await s.from('staff').insert({ organization_id: o!.id, user_id: adminUserId, full_name: 'E2E Accounts Admin', staff_code: `ADM-${adminUserId.slice(0, 6)}`, role: 'admin', status: 'active' })
})

// 1x1 JPEG.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)
const workerName = `E2E Worker ${Date.now()}`

const adminLogin = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Organisation admin? Log in here' }).click()
  await page.getByLabel('Email').fill(adminEmail!)
  await page.getByLabel('Password').fill(adminPassword!)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/verify/)
  if (!adminTotp) {
    // First login: the set-up screen shows a QR code and the key to type by hand.
    await expect(page.getByRole('heading', { name: 'Set up two-step login' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible()
    adminTotp = (await page.getByTestId('totp-secret').textContent())!.trim()
  }
  await page.getByLabel('6-digit code').fill(totp(adminTotp))
  await page.getByRole('button', { name: /Finish set-up|Continue/ }).click()
  await expect(page).toHaveURL(/\/admin\/review/)
  await page.getByRole('link', { name: 'Staff' }).click()
  await expect(page.getByRole('button', { name: 'Add worker' })).toBeVisible()
}

const workerLogin = async (page: Page, code: string, pin: string) => {
  await page.goto('/')
  await page.getByLabel('Organisation').fill(org)
  await page.getByLabel('Staff code').fill(code)
  await page.getByLabel('PIN (6 digits)').fill(pin)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

const logOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/$/)
}

test.afterAll(async () => {
  const s = svc()
  const { data } = await s.from('staff').select('id, user_id, organization_id').or(`full_name.eq.${workerName},user_id.eq.${adminUserId}`)
  for (const row of data ?? []) {
    await s.storage.from('reference-photos').remove([`${row.organization_id}/${row.id}.jpg`])
    await s.from('audit_log').delete().eq('target_id', row.id)
    await s.from('staff').delete().eq('id', row.id)
    if (row.user_id) {
      await s.from('profiles').delete().eq('id', row.user_id) // legacy signup trigger
      await s.auth.admin.deleteUser(row.user_id)
    }
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
  await expect(page.getByRole('alert')).toContainText('Organisation, staff code or PIN is not correct.')
  await workerLogin(page, code, pin)
  // PIN sign-in runs an Edge Function (cold starts of 4-5 s seen on dev) plus a session exchange.
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'I understand and agree' }).click()
  await expect(page.getByRole('heading', { name: workerName })).toBeVisible()

  // Reopening goes straight back in (no second consent).
  await page.goto('/')
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
