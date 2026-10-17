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

test('a login request that never gets an answer ends with a connection message, not endless loading', async ({ page }) => {
  test.setTimeout(60_000)
  await page.route('**/auth/v1/token**', () => {}) // never answered
  await page.goto('/')
  await page.getByRole('button', { name: 'Organisation admin? Log in here' }).click()
  await page.getByLabel('Email').fill('nobody@attendance-dev.test')
  await page.getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Logging in' })).toBeVisible()
  // The request time limit is 30 s (src/lib/fetchTimeout.ts).
  await expect(page.getByRole('alert')).toHaveText("Couldn't reach the server. Check your internet connection and try again.", { timeout: 40_000 })
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled()
})

test('crawlers: robots.txt allows fetching, every response says noindex, and link previews have their tags', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.headers()['content-type']).toContain('text/plain')
  expect(await robots.text()).toContain('Allow: /')
  for (const path of ['/', '/admin/review', '/version.json']) {
    expect((await request.get(path)).headers()['x-robots-tag'], path).toBe('noindex, nofollow')
  }
  // Raw HTML, as WhatsApp and search crawlers see it (no JavaScript).
  const html = await (await request.get('/')).text()
  expect(html).toContain('<meta name="robots" content="noindex, nofollow" />')
  expect(html).toContain('<meta property="og:image" content="https://siteproof.asejik.com/og-image.png" />')
  expect(html).toContain('<meta property="og:title" content="SiteProof" />')
  const image = await request.get('/og-image.png')
  expect(image.headers()['content-type']).toBe('image/png')
  expect((await image.body()).length).toBeLessThan(150_000)
})
