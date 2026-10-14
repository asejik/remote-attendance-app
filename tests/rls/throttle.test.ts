import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { anon, hasCredentials, service } from './fixtures'

// Migration 20261015120000: the per-address sign-in throttle (service role only).
// Called directly with made-up keys, so the test machine's own address is never blocked.
describe.skipIf(!hasCredentials)('sign-in throttle', () => {
  it('blocks an address after the limit of failures, and reports the moment it starts', async () => {
    const svc = service()
    const key = `test:${randomUUID()}`
    const results: boolean[] = []
    for (let i = 0; i < 5; i++) {
      const { data, error } = await svc.rpc('login_throttle_record_failure', { p_key: key, p_limit: 5, p_block: '15 minutes' })
      expect(error).toBeNull()
      results.push(data as boolean)
    }
    expect(results).toEqual([false, false, false, false, true])
    const { data: until } = await svc.rpc('login_throttle_blocked', { p_key: key })
    expect(Date.parse(until as string) - Date.now()).toBeGreaterThan(14 * 60_000)
    expect((await svc.rpc('login_throttle_blocked', { p_key: `test:${randomUUID()}` })).data).toBeNull() // other addresses unaffected
  })

  it('is not callable with the public key', async () => {
    const { error } = await anon().rpc('login_throttle_record_failure', { p_key: `test:${randomUUID()}` })
    expect(error).not.toBeNull()
    expect((await anon().rpc('login_throttle_blocked', { p_key: 'test:12345678' })).error).not.toBeNull()
  })
})
