import { expect, test } from './fixtures'

test('login page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Worker login' })).toBeVisible()
})
