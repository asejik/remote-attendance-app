import { expect, test, type Page } from '@playwright/test'

// Needs a staff account on the dev project; set in your local .env (not in CI).
const email = process.env.E2E_STAFF_EMAIL
const password = process.env.E2E_STAFF_PASSWORD
test.skip(!email || !password, 'E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD not set')

const logIn = async (page: Page) => {
  await page.goto('/')
  await page.locator('input[type=email]').fill(email!)
  await page.locator('input[type=password]').fill(password!)
  await page.locator('button[type=submit]').click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('reopening the app at / keeps a logged-in worker on the dashboard', async ({ page }) => {
  await logIn(page)
  await page.goto('/') // the installed app always starts here
  await expect(page).toHaveURL(/\/dashboard/)
})

test('reopening offline keeps a logged-in worker on the dashboard', async ({ page, context }) => {
  await logIn(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard/)
})

test('logging in while offline explains that internet is needed', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.locator('input[type=email]').fill(email!)
  await page.locator('input[type=password]').fill(password!)
  await page.locator('button[type=submit]').click()
  await expect(page.getByText(/You're offline/)).toBeVisible()
})

test('a worker using the Admin Portal is refused and stays on the login page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Login to Admin Dashboard' }).click()
  await page.locator('input[type=email]').fill(email!)
  await page.locator('input[type=password]').fill(password!)
  await page.locator('button[type=submit]').click()
  await expect(page.getByText('Access Denied. You are not an Admin.')).toBeVisible()
  await expect(page).not.toHaveURL(/\/(dashboard|admin)/)
})
