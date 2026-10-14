import { createClient } from 'npm:@supabase/supabase-js@2'

// Browsers may call the functions only from the app itself: the web app, the
// Android app (Capacitor serves it from https://localhost) and local dev/test
// servers. ALLOWED_ORIGINS (comma-separated) adds more, e.g. a preview URL.
// Auth is by bearer token, not cookies, so this is defence in depth (P04 L2).
const DEFAULT_ORIGINS = [
  'https://attendance.asejik.com', 'https://localhost',
  'http://localhost:5173', 'http://[::1]:5173', 'http://localhost:4173', 'http://[::1]:4173',
]
const allowedOrigin = (req: Request) => {
  const origin = req.headers.get('Origin')
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  return origin && [...DEFAULT_ORIGINS, ...extra].includes(origin) ? origin : null
}

// Wraps a function handler: answers CORS preflights and adds the CORS headers
// only for allowed origins.
export const withCors = (handler: (req: Request) => Promise<Response>) => async (req: Request) => {
  const origin = allowedOrigin(req)
  const cors: Record<string, string> = origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
  if (req.method === 'OPTIONS') return new Response(origin ? 'ok' : null, { status: origin ? 200 : 403, headers: cors })
  const res = await handler(req)
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(cors)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }
export const serviceClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), options)
export const publicClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), options)

// Uniform random integer in [0, max) without modulo bias.
const randomBelow = (max: number) => {
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

export const randomPin = () => String(randomBelow(1_000_000)).padStart(6, '0')
export const randomDigits = (n: number) => String(randomBelow(10 ** n)).padStart(n, '0')

export const randomSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '')
}
