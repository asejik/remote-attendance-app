// Minimal Sentry reporting for Edge Functions over HTTP (no SDK), enabled by
// the function secret SENTRY_DSN. SENTRY_ENVIRONMENT tags dev vs production.
// Messages are short and must never contain PINs, photos, coordinates or names;
// email-like strings are masked as a safety net.

interface Dsn { host: string; projectId: string; key: string }

const parseDsn = (): Dsn | null => {
  const raw = Deno.env.get('SENTRY_DSN')
  if (!raw) return null
  try {
    const u = new URL(raw)
    return { host: u.host, projectId: u.pathname.replace(/\//g, ''), key: u.username }
  } catch {
    return null
  }
}

const environment = () => Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production'
const mask = (text: string) => text.replace(/[^\s@]+@[^\s@]+/g, '[email]').slice(0, 300)

// Never throws and never waits long: reporting must not break the function.
const send = async (url: string, body: string, contentType: string) => {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: AbortSignal.timeout(3_000) })
  } catch {
    // Monitoring is best-effort.
  }
}

export const reportError = async (fn: string, message: string, detail?: unknown) => {
  const dsn = parseDsn()
  if (!dsn) return
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const text = detail && typeof detail === 'object' && 'message' in detail ? `${message}: ${String((detail as { message: unknown }).message)}` : message
  const event = {
    event_id: eventId, timestamp: Date.now() / 1000, platform: 'javascript', level: 'error',
    environment: environment(), server_name: fn, tags: { function: fn },
    message: { formatted: mask(text) }, fingerprint: [fn, message],
  }
  const envelope = [
    JSON.stringify({ event_id: eventId, dsn: Deno.env.get('SENTRY_DSN') }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n')
  await send(`https://${dsn.host}/api/${dsn.projectId}/envelope/?sentry_key=${dsn.key}&sentry_version=7`, envelope, 'application/x-sentry-envelope')
}

// Sentry Cron Monitor check-in. The monitor is created on first use; Sentry
// alerts when a run fails or doesn't arrive on schedule.
export const cronCheckIn = async (slug: string, status: 'ok' | 'error', schedule: string, maxRuntimeMinutes = 10) => {
  const dsn = parseDsn()
  if (!dsn) return
  await send(`https://${dsn.host}/api/${dsn.projectId}/cron/${slug}/${dsn.key}/`, JSON.stringify({
    status, environment: environment(),
    monitor_config: { schedule: { type: 'crontab', value: schedule }, checkin_margin: 60, max_runtime: maxRuntimeMinutes, timezone: 'UTC' },
  }), 'application/json')
}

// console.error (function logs) plus a Sentry event.
export const logError = async (fn: string, message: string, detail?: unknown) => {
  console.error(message, detail)
  await reportError(fn, message, detail)
}
