import { createClient } from 'npm:@supabase/supabase-js@2'

// Auth is by bearer token, not cookies, so a wildcard origin is safe here.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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
