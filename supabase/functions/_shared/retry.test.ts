import { describe, expect, it, vi } from 'vitest'
import { retryOnce } from './retry'

describe('retryOnce (Edge Functions)', () => {
  it('returns null without retrying when the first call succeeds', async () => {
    const call = vi.fn().mockResolvedValue({ error: null })
    expect(await retryOnce(call, 0)).toBeNull()
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('retries once and succeeds', async () => {
    const call = vi.fn().mockResolvedValueOnce({ error: { message: 'timeout' } }).mockResolvedValueOnce({ error: null })
    expect(await retryOnce(call, 0)).toBeNull()
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('gives up after the second failure and returns its error', async () => {
    const call = vi.fn().mockResolvedValue({ error: { message: 'down' } })
    expect(await retryOnce(call, 0)).toEqual({ message: 'down' })
    expect(call).toHaveBeenCalledTimes(2)
  })
})
