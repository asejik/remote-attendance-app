// Daily photo clean-up, called by pg_cron with the shared CRON_SECRET:
//   1. event photos past their organisation's retention period
//   2. reference photos of staff deactivated more than 30 days ago
//   3. orphan event photos (uploaded, but the event record never arrived)
// Attendance records themselves are kept; only photos are deleted.
import { corsHeaders, json, serviceClient } from '../_shared/http.ts'
import { cronCheckIn, reportError } from '../_shared/sentry.ts'

const BATCH = 200
const MAX_BATCHES = 25 // up to 5,000 items per kind per run

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expected = Deno.env.get('CRON_SECRET') ?? ''
  const given = req.headers.get('x-cron-secret') ?? ''
  if (expected.length < 32 || !timingSafeEqual(given, expected)) return json({ error: 'unauthorized' }, 401)

  // Tests may shorten the orphan age; the default is 7 days.
  let orphanMinAgeHours = 168
  try {
    const body = await req.json()
    if (typeof body?.orphan_min_age_hours === 'number' && body.orphan_min_age_hours >= 0) orphanMinAgeHours = body.orphan_min_age_hours
  } catch {
    // Empty body from the cron job.
  }

  const svc = serviceClient()
  const result = { event_photos: 0, events_marked: 0, reference_photos: 0, orphans: 0, errors: [] as string[] }

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await svc.rpc('photos_to_purge', { p_limit: BATCH })
    if (error) { result.errors.push(`photos_to_purge: ${error.message}`); break }
    const rows = (data ?? []) as { event_id: string; face_photo_path: string | null; site_photo_path: string | null }[]
    if (!rows.length) break
    const paths = rows.flatMap((r) => [r.face_photo_path, r.site_photo_path]).filter((p): p is string => !!p)
    const removed = await svc.storage.from('event-photos').remove(paths)
    if (removed.error) { result.errors.push(`remove event photos: ${removed.error.message}`); break }
    result.event_photos += removed.data?.length ?? 0
    const marked = await svc.rpc('mark_photos_deleted', { p_event_ids: rows.map((r) => r.event_id) })
    if (marked.error) { result.errors.push(`mark_photos_deleted: ${marked.error.message}`); break }
    result.events_marked += (marked.data as number) ?? 0
    if (rows.length < BATCH) break
  }

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await svc.rpc('reference_photos_to_purge', { p_limit: BATCH })
    if (error) { result.errors.push(`reference_photos_to_purge: ${error.message}`); break }
    const rows = (data ?? []) as { staff_id: string; reference_photo_path: string }[]
    if (!rows.length) break
    const removed = await svc.storage.from('reference-photos').remove(rows.map((r) => r.reference_photo_path))
    if (removed.error) { result.errors.push(`remove reference photos: ${removed.error.message}`); break }
    result.reference_photos += removed.data?.length ?? 0
    const marked = await svc.rpc('mark_reference_photo_deleted', { p_staff_ids: rows.map((r) => r.staff_id) })
    if (marked.error) { result.errors.push(`mark_reference_photo_deleted: ${marked.error.message}`); break }
    if (rows.length < BATCH) break
  }

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await svc.rpc('orphan_event_photos', { p_min_age: `${orphanMinAgeHours} hours`, p_limit: BATCH })
    if (error) { result.errors.push(`orphan_event_photos: ${error.message}`); break }
    const names = ((data ?? []) as { name: string }[]).map((r) => r.name)
    if (!names.length) break
    const removed = await svc.storage.from('event-photos').remove(names)
    if (removed.error) { result.errors.push(`remove orphans: ${removed.error.message}`); break }
    result.orphans += removed.data?.length ?? 0
    if (names.length < BATCH) break
  }

  console.log('purge-expired-photos', JSON.stringify(result))
  // Sentry alerts when a nightly run fails or never arrives (schedule as in migration 20261015090000).
  if (result.errors.length) await reportError('purge-expired-photos', 'purge finished with errors', { message: result.errors.join('; ') })
  await cronCheckIn('purge-expired-photos', result.errors.length ? 'error' : 'ok', '15 2 * * *')
  return json(result, result.errors.length ? 500 : 200)
})
