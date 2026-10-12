import { expect, test } from '@playwright/test'

test('login page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Staff Access' })).toBeVisible()
})
