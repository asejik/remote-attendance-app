import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildWorld, destroyWorld, hasCredentials, jpeg, newEvent, purgeStaleWorlds, service, type World } from './fixtures'

// The purge-expired-photos Edge Function on dev: deletes exactly the photos it
// should (expired event photos, old deactivated staff's reference photos,
// orphans) and keeps everything else, including all attendance records.
const cronSecret = process.env.CRON_SECRET
const DAY = 86_400_000

describe.skipIf(!hasCredentials || !cronSecret)('photo retention job', () => {
  let w: World
  const paths: Record<string, string> = {}
  const events: Record<string, string> = {}

  const exists = async (bucket: string, path: string) => {
    const [folder, ...rest] = path.split('/')
    const name = rest.pop()!
    const { data } = await service().storage.from(bucket).list([folder, ...rest].join('/'), { search: name })
    return (data ?? []).some((f) => f.name === name)
  }

  const recordEvent = async (key: string, client: World['workerA1']['client'], org: string, staffId: string, siteId: string, ageDays: number) => {
    const id = randomUUID()
    for (const kind of ['face', 'site']) {
      const { error } = await client.storage.from('event-photos').upload(`${org}/${id}/${kind}.jpg`, jpeg())
      if (error) throw error
    }
    const { error } = await client.from('attendance_events').insert(newEvent(org, staffId, siteId, {
      id, captured_at: new Date(Date.now() - ageDays * DAY).toISOString(), face_photo_path: `${org}/${id}/face.jpg`, site_photo_path: `${org}/${id}/site.jpg`,
    }))
    if (error) throw error
    events[key] = id
    paths[key] = `${org}/${id}/face.jpg`
  }

  const callPurge = (body: unknown = {}) => fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/purge-expired-photos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret! }, body: JSON.stringify(body),
  })

  beforeAll(async () => {
    await purgeStaleWorlds()
    w = await buildWorld()
    const svc = service()
    await svc.from('organizations').update({ photo_retention_days: 7 }).eq('id', w.orgA) // org B keeps the default 60

    await recordEvent('oldA', w.workerA1.client, w.orgA, w.workerA1.staffId, w.siteA, 20) // past 7 days: purge
    await recordEvent('recentA', w.workerA1.client, w.orgA, w.workerA1.staffId, w.siteA, 1) // keep
    const { data: workerB } = await svc.from('staff').insert({ organization_id: w.orgB, full_name: 'RLS B Worker', staff_code: `B1-${w.run}`, role: 'worker', status: 'active' }).select('id').single()
    const bUser = (await svc.auth.admin.createUser({ email: `rls-b1-${w.run}@attendance-dev.test`, password: `Pw-${randomUUID()}`, email_confirm: true })).data.user!
    w.userIds.push(bUser.id)
    await svc.from('staff').update({ user_id: bUser.id }).eq('id', workerB!.id)
    // Org B's old event is inserted by the service role (20 days < 60-day retention: keep).
    const oldB = randomUUID()
    for (const kind of ['face', 'site']) await svc.storage.from('event-photos').upload(`${w.orgB}/${oldB}/${kind}.jpg`, jpeg())
    await svc.from('attendance_events').insert({
      ...newEvent(w.orgB, workerB!.id, w.siteB, { id: oldB, captured_at: new Date(Date.now() - 20 * DAY).toISOString(), face_photo_path: `${w.orgB}/${oldB}/face.jpg`, site_photo_path: `${w.orgB}/${oldB}/site.jpg` }),
      captured_by: bUser.id,
    })
    events.oldB = oldB
    paths.oldB = `${w.orgB}/${oldB}/face.jpg`

    // Reference photos: A2 deactivated 40 days ago (purge); A3 deactivated just now (keep).
    for (const [key, staffId, ageDays] of [['refA2', w.workerA2.staffId, 40], ['refA3', w.deactivatedA3.staffId, 1]] as const) {
      const path = `${w.orgA}/${staffId}.jpg`
      await svc.storage.from('reference-photos').upload(path, jpeg())
      await svc.from('staff').update({ status: 'deactivated', deactivated_at: new Date(Date.now() - ageDays * DAY).toISOString(), reference_photo_path: path }).eq('id', staffId)
      paths[key] = path
    }

    // An orphan: a photo whose event record never arrived.
    paths.orphan = `${w.orgA}/${randomUUID()}/face.jpg`
    await w.workerA1.client.storage.from('event-photos').upload(paths.orphan, jpeg())
  })

  afterAll(async () => {
    if (w) await destroyWorld(w)
  })

  it('refuses calls without the shared secret', async () => {
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/purge-expired-photos`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
  })

  it('deletes expired event photos, old reference photos and orphans; keeps everything else', async () => {
    const res = await callPurge({ orphan_min_age_hours: 0 })
    expect(res.status).toBe(200)

    expect(await exists('event-photos', paths.oldA)).toBe(false)
    expect(await exists('event-photos', paths.oldA.replace('face', 'site'))).toBe(false)
    expect(await exists('event-photos', paths.recentA)).toBe(true)
    expect(await exists('event-photos', paths.oldB)).toBe(true) // org B keeps photos for 60 days
    expect(await exists('reference-photos', paths.refA2)).toBe(false)
    expect(await exists('reference-photos', paths.refA3)).toBe(true)
    expect(await exists('event-photos', paths.orphan)).toBe(false)

    const svc = service()
    const { data: rows } = await svc.from('attendance_events').select('id, photos_deleted_at').in('id', [events.oldA, events.recentA, events.oldB])
    const deleted = Object.fromEntries((rows ?? []).map((r) => [r.id, r.photos_deleted_at !== null]))
    expect(deleted).toEqual({ [events.oldA]: true, [events.recentA]: false, [events.oldB]: false }) // records are kept
    const { data: a2 } = await svc.from('staff').select('reference_photo_path').eq('id', w.workerA2.staffId).single()
    expect(a2!.reference_photo_path).toBeNull()
  })

  it('is safe to run again (nothing left to delete for these records)', async () => {
    const res = await callPurge()
    expect(res.status).toBe(200)
    expect(await exists('event-photos', paths.recentA)).toBe(true)
    expect(await exists('reference-photos', paths.refA3)).toBe(true)
  })
})
