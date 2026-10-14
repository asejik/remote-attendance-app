import { expect, test } from './fixtures'

test('login page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Worker login' })).toBeVisible()
})

test('privacy notice is public and linked from the login page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Privacy notice' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'info@asejik.com' }).first()).toHaveAttribute('href', 'mailto:info@asejik.com')
})
