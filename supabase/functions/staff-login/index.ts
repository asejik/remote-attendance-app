// Worker sign-in: organisation slug + staff code + 6-digit PIN.
// The PIN is checked (with lockout) by staff_pin_verify(); on success the
// function mints a normal Supabase session for the worker's Auth user, whose
// password is a random secret, so PINs cannot be guessed against Auth directly.
import { corsHeaders, json, publicClient, serviceClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { org?: unknown; code?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const { org, code, pin } = body
  if (
    typeof org !== 'string' || typeof code !== 'string' || typeof pin !== 'string' ||
    org.length > 40 || code.length > 20 || !/^[0-9]{6}$/.test(pin)
  ) {
    return json({ error: 'invalid_credentials' }, 401)
  }

  const svc = serviceClient()
  const { data, error } = await svc
    .rpc('staff_pin_verify', { p_org_slug: org.trim(), p_staff_code: code.trim(), p_pin: pin })
    .single<{ result: string; user_id: string | null; locked_until: string | null }>()
  if (error || !data) {
    console.error('staff_pin_verify failed', error)
    return json({ error: 'server_error' }, 500)
  }
  if (data.result === 'locked') return json({ error: 'locked', locked_until: data.locked_until }, 423)
  if (data.result === 'deactivated') return json({ error: 'deactivated' }, 403)
  if (data.result !== 'ok' || !data.user_id) return json({ error: 'invalid_credentials' }, 401)

  const { data: userData, error: userError } = await svc.auth.admin.getUserById(data.user_id)
  const email = userData?.user?.email
  if (userError || !email) {
    console.error('getUserById failed', userError)
    return json({ error: 'server_error' }, 500)
  }
  const { data: link, error: linkError } = await svc.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError) {
    console.error('generateLink failed', linkError)
    return json({ error: 'server_error' }, 500)
  }
  const { data: verified, error: verifyError } = await publicClient().auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyError || !verified.session) {
    console.error('verifyOtp failed', verifyError)
    return json({ error: 'server_error' }, 500)
  }
  return json({ access_token: verified.session.access_token, refresh_token: verified.session.refresh_token })
})
