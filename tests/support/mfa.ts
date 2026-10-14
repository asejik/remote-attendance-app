import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { totp } from './totp'

// Admins need two-step login (migration 20261015150000). Enrols an authenticator
// factor for a password-signed-in client and verifies a code (session -> AAL2).
// Returns the secret, from which tests compute later codes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const enrolTotp = async (client: SupabaseClient<any, any, any>) => {
  const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `test-${randomUUID().slice(0, 8)}` })
  if (error || !data) throw new Error(`mfa enroll: ${error?.message}`)
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) })
  if (verified.error) throw new Error(`mfa verify: ${verified.error.message}`)
  return data.totp.secret
}
