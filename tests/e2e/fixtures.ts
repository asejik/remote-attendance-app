import { expect, test as base } from '@playwright/test'

// Every E2E test fails if the browser reports a Content-Security-Policy
// violation, so the production security headers can't silently break a feature.
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = []
      page.on('console', (msg) => {
        if (/Content Security Policy|Refused to (load|execute|connect|apply|evaluate)/i.test(msg.text())) violations.push(msg.text())
      })
      await use()
      expect(violations, 'Content-Security-Policy violations').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
