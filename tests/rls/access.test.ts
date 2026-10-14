import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, buildWorld, destroyWorld, hasCredentials, jpeg, newEvent, purgeStaleWorlds, service, SITE_A, type World } from './fixtures'

const TABLES = ['organizations', 'staff', 'work_sites', 'attendance_events', 'audit_log'] as const
const DENIED = ['42501', 'PGRST301']

describe.skipIf(!hasCredentials)('access rules (RLS) on the new schema', () => {
  let w: World
  beforeAll(async () => {
    await purgeStaleWorlds()
    w = await buildWorld()
  })
  afterAll(async () => {
    if (w) await destroyWorld(w)
  })

  describe('anonymous (public key only)', () => {
    it.each(TABLES)('cannot read %s', async (table) => {
      const { error } = await anon().from(table).select('*').limit(1)
      expect(DENIED).toContain(error?.code)
    })

    it('cannot record an event', async () => {
      const { error } = await anon().from('attendance_events').insert(newEvent(w.orgA, w.workerA1.staffId, w.siteA))
      expect(DENIED).toContain(error?.code)
    })

    it('cannot upload photos', async () => {
      const { error } = await anon().storage.from('event-photos').upload(`${w.orgA}/${randomUUID()}/face.jpg`, jpeg())
      expect(error).not.toBeNull()
    })
  })

  describe('worker', () => {
    it('sees only their own organisation', async () => {
      const { data } = await w.workerA1.client.from('organizations').select('id')
      expect(data?.map((o) => o.id)).toEqual([w.orgA])
    })

    it('sees only their own staff record', async () => {
      const { data } = await w.workerA1.client.from('staff').select('id')
      expect(data?.map((s) => s.id)).toEqual([w.workerA1.staffId])
    })

    it('sees only active sites of their organisation', async () => {
      const { data } = await w.workerA1.client.from('work_sites').select('id')
      expect(data?.map((s) => s.id)).toEqual([w.siteA])
    })

    it('cannot create or change sites', async () => {
      const ins = await w.workerA1.client.from('work_sites')
        .insert({ organization_id: w.orgA, name: 'Sneaky', ...SITE_A, created_by: w.workerA1.userId })
      expect(DENIED).toContain(ins.error?.code)
      const upd = await w.workerA1.client.from('work_sites').update({ radius_m: 5000 }).eq('id', w.siteA).select()
      expect(upd.data ?? []).toHaveLength(0)
    })

    it('records an on-site clock-in; the server computes distance and flags', async () => {
      const { data, error } = await w.workerA1.client.from('attendance_events')
        .insert(newEvent(w.orgA, w.workerA1.staffId, w.siteA)).select().single()
      expect(error).toBeNull()
      expect(data!.within_radius).toBe(true)
      expect(data!.distance_m).toBeLessThan(1)
      expect(data!.flags).toEqual([])
      expect(data!.site_name_snapshot).toBe('Site A')
      expect(data!.captured_by).toBe(w.workerA1.userId)
    })

    it('a clock-in ~2 km from the site is flagged outside_radius', async () => {
      const { data } = await w.workerA1.client.from('attendance_events')
        .insert(newEvent(w.orgA, w.workerA1.staffId, w.siteA, { latitude: SITE_A.latitude + 0.018 })).select().single()
      expect(data!.within_radius).toBe(false)
      expect(data!.distance_m).toBeGreaterThan(1900)
      expect(data!.flags).toContain('outside_radius')
    })

    it('cannot forge server-computed or review fields', async () => {
      const { data } = await w.workerA1.client.from('attendance_events')
        .insert(newEvent(w.orgA, w.workerA1.staffId, w.siteA, {
          latitude: SITE_A.latitude + 0.018, within_radius: true, distance_m: 0, flags: [],
          review_status: 'approved', reviewed_by: w.workerA1.userId, accuracy_m: 500,
        })).select().single()
      expect(data!.within_radius).toBe(false)
      expect(data!.review_status).toBe('pending')
      expect(data!.reviewed_by).toBeNull()
      expect(data!.flags).toEqual(expect.arrayContaining(['outside_radius', 'low_accuracy']))
    })

    it('flags missing photos, location and old device times', async () => {
      const { data } = await w.workerA1.client.from('attendance_events')
        .insert(newEvent(w.orgA, w.workerA1.staffId, w.siteA, {
          face_photo_path: null, site_photo_path: null, latitude: null, longitude: null,
          liveness_passed: false, captured_at: new Date(Date.now() - 20 * 86400_000).toISOString(),
        })).select().single()
      expect(data!.flags).toEqual(expect.arrayContaining(['no_face_photo', 'no_site_photo', 'no_location', 'time_skew', 'liveness_failed']))
    })

    it('re-uploading the same event is harmless (idempotent)', async () => {
      const event = newEvent(w.orgA, w.workerA1.staffId, w.siteA)
      expect((await w.workerA1.client.from('attendance_events').insert(event)).error).toBeNull()
      const again = await w.workerA1.client.from('attendance_events').upsert(event, { onConflict: 'id', ignoreDuplicates: true })
      expect(again.error).toBeNull()
      const { count } = await service().from('attendance_events').select('id', { count: 'exact', head: true }).eq('id', event.id)
      expect(count).toBe(1)
    })

    it('cannot record events for a colleague, another organisation, or as someone else', async () => {
      const c = w.workerA1.client.from('attendance_events')
      expect(DENIED).toContain((await c.insert(newEvent(w.orgA, w.workerA2.staffId, w.siteA))).error?.code)
      expect((await c.insert(newEvent(w.orgB, w.workerA1.staffId, w.siteB))).error).not.toBeNull()
      expect(DENIED).toContain((await c.insert({ ...newEvent(w.orgA, w.workerA1.staffId, w.siteA), captured_by: w.workerA2.userId })).error?.code)
    })

    it('sees only their own events and cannot change or delete them', async () => {
      await w.workerA2.client.from('attendance_events').insert(newEvent(w.orgA, w.workerA2.staffId, w.siteA))
      const { data } = await w.workerA1.client.from('attendance_events').select('staff_id')
      expect(new Set(data?.map((e) => e.staff_id))).toEqual(new Set([w.workerA1.staffId]))
      const upd = await w.workerA1.client.from('attendance_events').update({ review_status: 'approved' }).eq('staff_id', w.workerA1.staffId)
      expect(DENIED).toContain(upd.error?.code)
      const del = await w.workerA1.client.from('attendance_events').delete().eq('staff_id', w.workerA1.staffId)
      expect(DENIED).toContain(del.error?.code)
    })

    it('cannot read the audit log or use admin functions', async () => {
      const { data } = await w.workerA1.client.from('audit_log').select('id')
      expect(data).toEqual([])
      const [ev] = (await w.workerA1.client.from('attendance_events').select('id').limit(1)).data!
      expect((await w.workerA1.client.rpc('review_event', { event_id: ev.id, decision: 'approved' })).error).not.toBeNull()
      expect((await w.workerA1.client.rpc('update_org_settings', { photo_retention_days: 7 })).error).not.toBeNull()
    })

    it('uploads photos only into their own organisation, write-once, and cannot read them back', async () => {
      const own = `${w.orgA}/${randomUUID()}/face.jpg`
      expect((await w.workerA1.client.storage.from('event-photos').upload(own, jpeg())).error).toBeNull()
      expect((await w.workerA1.client.storage.from('event-photos').upload(own, jpeg(), { upsert: true })).error).not.toBeNull()
      expect((await w.workerA1.client.storage.from('event-photos').download(own)).error).not.toBeNull()
      expect((await w.workerA1.client.storage.from('event-photos').upload(`${w.orgB}/${randomUUID()}/face.jpg`, jpeg())).error).not.toBeNull()
      expect((await w.workerA1.client.storage.from('event-photos').upload(`${w.orgA}/john-smith.jpg`, jpeg())).error).not.toBeNull()
      expect((await w.workerA1.client.storage.from('reference-photos').upload(`${w.orgA}/${w.workerA1.staffId}.jpg`, jpeg())).error).not.toBeNull()
    })
  })

  describe('supervisor', () => {
    it('records a clock-in for a worker in their organisation (crew mode)', async () => {
      const { data, error } = await w.supervisorA.client.from('attendance_events')
        .insert(newEvent(w.orgA, w.workerA2.staffId, w.siteA)).select().single()
      expect(error).toBeNull()
      expect(data!.captured_by).toBe(w.supervisorA.userId)
      expect(data!.flags).toContain('recorded_by_other') // stands out in Review
    })

    it('reads organisation events but cannot review them', async () => {
      const { data } = await w.supervisorA.client.from('attendance_events').select('staff_id')
      expect(new Set(data?.map((e) => e.staff_id))).toEqual(new Set([w.workerA1.staffId, w.workerA2.staffId]))
      expect((await w.supervisorA.client.rpc('review_event', { event_id: randomUUID(), decision: 'approved' })).error).not.toBeNull()
    })
  })

  describe('deactivated worker', () => {
    it('sees nothing and cannot record events', async () => {
      for (const table of TABLES) {
        const { data } = await w.deactivatedA3.client.from(table).select('*')
        expect(data ?? []).toEqual([])
      }
      const { error } = await w.deactivatedA3.client.from('attendance_events').insert(newEvent(w.orgA, w.deactivatedA3.staffId, w.siteA))
      expect(error).not.toBeNull()
    })
  })

  describe('organisation admin', () => {
    it('sees all staff, sites and events of their organisation only', async () => {
      const staff = (await w.adminA.client.from('staff').select('organization_id')).data!
      expect(staff.length).toBe(5)
      expect(new Set(staff.map((s) => s.organization_id))).toEqual(new Set([w.orgA]))
      const sites = (await w.adminA.client.from('work_sites').select('id')).data!.map((s) => s.id)
      expect(new Set(sites)).toEqual(new Set([w.siteA, w.siteAInactive]))
      const events = (await w.adminA.client.from('attendance_events').select('organization_id')).data!
      expect(events.length).toBeGreaterThan(0)
      expect(new Set(events.map((e) => e.organization_id))).toEqual(new Set([w.orgA]))
    })

    it('manages sites in their organisation only', async () => {
      const own = await w.adminA.client.from('work_sites')
        .insert({ organization_id: w.orgA, name: 'New Site', ...SITE_A, created_by: w.adminA.userId }).select().single()
      expect(own.error).toBeNull()
      const upd = await w.adminA.client.from('work_sites').update({ radius_m: 300 }).eq('id', own.data!.id).select().single()
      expect(upd.data!.radius_m).toBe(300)
      const other = await w.adminA.client.from('work_sites')
        .insert({ organization_id: w.orgB, name: 'Hijack', ...SITE_A, created_by: w.adminA.userId })
      expect(DENIED).toContain(other.error?.code)
      const moved = await w.adminA.client.from('work_sites').update({ organization_id: w.orgB }).eq('id', own.data!.id)
      expect(DENIED).toContain(moved.error?.code)
    })

    it('reviews an event; the action is written to the audit log', async () => {
      const [ev] = (await w.adminA.client.from('attendance_events').select('id').limit(1)).data!
      const { data, error } = await w.adminA.client.rpc('review_event', { event_id: ev.id, decision: 'rejected', note: 'Not on site' })
      expect(error).toBeNull()
      expect(data!.review_status).toBe('rejected')
      expect(data!.reviewed_by).toBe(w.adminA.userId)
      const log = (await w.adminA.client.from('audit_log').select('action, target_id')).data!
      expect(log).toContainEqual({ action: 'review_event', target_id: ev.id })
    })

    it('updates organisation settings (audited)', async () => {
      const { data, error } = await w.adminA.client.rpc('update_org_settings', { photo_retention_days: 30, geofence_mode: 'block' })
      expect(error).toBeNull()
      expect(data!.photo_retention_days).toBe(30)
      expect(data!.geofence_mode).toBe('block')
      expect(data!.site_photo_required).toBe(true)
    })

    it('views event photos through short-lived signed links and manages reference photos', async () => {
      const path = `${w.orgA}/${randomUUID()}/site.jpg`
      await w.workerA1.client.storage.from('event-photos').upload(path, jpeg())
      const signed = await w.adminA.client.storage.from('event-photos').createSignedUrl(path, 600)
      expect(signed.error).toBeNull()
      const ref = `${w.orgA}/${w.workerA1.staffId}.jpg`
      expect((await w.adminA.client.storage.from('reference-photos').upload(ref, jpeg())).error).toBeNull()
      expect((await w.adminA.client.storage.from('reference-photos').upload(ref, jpeg(), { upsert: true })).error).toBeNull()
    })
  })

  describe('admin of another organisation', () => {
    it('sees nothing from organisation A', async () => {
      const c = w.adminB.client
      expect((await c.from('organizations').select('id')).data!.map((o) => o.id)).toEqual([w.orgB])
      expect((await c.from('staff').select('organization_id')).data!.every((s) => s.organization_id === w.orgB)).toBe(true)
      expect((await c.from('work_sites').select('id')).data!.map((s) => s.id)).toEqual([w.siteB])
      expect((await c.from('attendance_events').select('id')).data).toEqual([])
      // B's own audit rows only (creating B's site is audited since 20261015100000).
      expect((await c.from('audit_log').select('organization_id')).data!.every((r) => r.organization_id === w.orgB)).toBe(true)
    })

    it("cannot review A's events or open A's photos", async () => {
      const [ev] = (await w.adminA.client.from('attendance_events').select('id').limit(1)).data!
      expect((await w.adminB.client.rpc('review_event', { event_id: ev.id, decision: 'approved' })).error).not.toBeNull()
      const path = `${w.orgA}/${randomUUID()}/face.jpg`
      await w.workerA1.client.storage.from('event-photos').upload(path, jpeg())
      expect((await w.adminB.client.storage.from('event-photos').createSignedUrl(path, 600)).error).not.toBeNull()
      expect((await w.adminB.client.storage.from('reference-photos').createSignedUrl(`${w.orgA}/${w.workerA1.staffId}.jpg`, 600)).error).not.toBeNull()
    })
  })
})
