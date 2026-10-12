import { expect, test } from '@playwright/test'

test('app opens and face models load with no network after the first visit', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Staff Access' })).toBeVisible()

  // Wait until the service worker has installed and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
    }
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Staff Access' })).toBeVisible()

  const modelsOk = await page.evaluate(async () => {
    const files = [
      '/models/tiny_face_detector_model-weights_manifest.json',
      '/models/face_landmark_68_model-shard1',
      '/models/face_expression_model-shard1',
    ]
    const responses = await Promise.all(files.map((f) => fetch(f)))
    return responses.every((r) => r.ok)
  })
  expect(modelsOk).toBe(true)
})
