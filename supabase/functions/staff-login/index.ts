// Worker sign-in: organisation slug + staff code + 6-digit PIN.
// The PIN is checked (with lockout) by staff_pin_verify(); on success the
// function mints a normal Supabase session for the worker's Auth user, whose
// password is a random secret, so PINs cannot be guessed against Auth directly.
import { withCors, json, publicClient, serviceClient } from '../_shared/http.ts'
import { logError, reportError } from '../_shared/sentry.ts'

// Per-address throttle (migration 20261015120000). Cloudflare sets
// cf-connecting-ip and rejects requests that forge it; Supabase replaces any
// client-sent X-Forwarded-For. The IP is stored only as a keyed hash.
const THROTTLE_LIMIT = Number(Deno.env.get('LOGIN_THROTTLE_LIMIT') ?? 30) // failures per 15 min per address
const THROTTLE_BLOCK_MINUTES = Number(Deno.env.get('LOGIN_THROTTLE_BLOCK_MINUTES') ?? 15)

const addressKey = async (req: Request) => {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const secret = new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)))
  return `ip:${Array.from(mac.slice(0, 20), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { org?: unknown; code?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const svc = serviceClient()
  const address = await addressKey(req)
  const { data: blockedUntil } = await svc.rpc('login_throttle_blocked', { p_key: address })
  if (blockedUntil) return json({ error: 'too_many_attempts' }, 429)
  // Every failed attempt counts against the address, whatever account it tried.
  // Tries left and lock times are counted the same way for staff codes that
  // don't exist (migration 20261015190000), so they can't reveal which do.
  const failed = async (outcome: { attemptsLeft?: number | null; lockedUntil?: string | null } = {}) => {
    const { data: justBlocked } = await svc.rpc('login_throttle_record_failure', {
      p_key: address, p_limit: THROTTLE_LIMIT, p_block: `${THROTTLE_BLOCK_MINUTES} minutes`,
    })
    if (justBlocked) await reportError('staff-login', 'sign-ins blocked for an address after repeated failures')
    if (outcome.lockedUntil) return json({ error: 'locked', locked_until: outcome.lockedUntil }, 423)
    return json({ error: 'invalid_credentials', ...(typeof outcome.attemptsLeft === 'number' ? { attempts_left: outcome.attemptsLeft } : {}) }, 401)
  }

  const { org, code, pin } = body
  if (
    typeof org !== 'string' || typeof code !== 'string' || typeof pin !== 'string' ||
    org.length > 40 || code.length > 20 || !/^[0-9]{6}$/.test(pin)
  ) {
    return failed()
  }

  const { data, error } = await svc
    .rpc('staff_pin_verify', { p_org_slug: org.trim(), p_staff_code: code.trim(), p_pin: pin })
    .single<{ result: string; user_id: string | null; locked_until: string | null; attempts_left: number | null }>()
  if (error || !data) {
    await logError('staff-login', 'staff_pin_verify failed', error)
    return json({ error: 'server_error' }, 500)
  }
  if (data.result === 'deactivated') return json({ error: 'deactivated' }, 403) // only after the right PIN
  if (data.result === 'locked') return failed({ lockedUntil: data.locked_until })
  if (data.result !== 'ok' || !data.user_id) return failed({ attemptsLeft: data.attempts_left })

  const { data: userData, error: userError } = await svc.auth.admin.getUserById(data.user_id)
  const email = userData?.user?.email
  if (userError || !email) {
    await logError('staff-login', 'getUserById failed', userError)
    return json({ error: 'server_error' }, 500)
  }
  // A new magic link replaces the previous one, so two sign-ins for the same
  // worker at once (a double tap, two phones) would fail all but the newest.
  // On "expired" (taken over), wait a moment and mint again.
  let session: { access_token: string; refresh_token: string } | null = null
  for (let attempt = 0; attempt < 3 && !session; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 150 + Math.random() * 350))
    const { data: link, error: linkError } = await svc.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkError) {
      await logError('staff-login', 'generateLink failed', linkError)
      return json({ error: 'server_error' }, 500)
    }
    const { data: verified, error: verifyError } = await publicClient().auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: 'magiclink',
    })
    if (verified?.session) session = verified.session
    else if (verifyError?.code !== 'otp_expired') {
      await logError('staff-login', 'verifyOtp failed', verifyError)
      return json({ error: 'server_error' }, 500)
    }
  }
  if (!session) {
    await logError('staff-login', 'verifyOtp kept expiring (concurrent sign-ins)')
    return json({ error: 'server_error' }, 500)
  }
  return json({ access_token: session.access_token, refresh_token: session.refresh_token })
}))
