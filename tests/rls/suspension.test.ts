import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildWorld, callFunction, destroyWorld, hasCredentials, newEvent, purgeStaleWorlds, service, SITE_A, type World } from './fixtures'

// Migration 20261015100000: work-site changes are audited; a suspended
// organisation is read-only for admins, and workers can clock in for 7 days.
const DENIED = ['42501', 'PGRST301']
const DAY = 86_400_000

describe.skipIf(!hasCredentials)('site audit and organisation suspension', () => {
  let w: World
  const pin = '624810'
  const login = () => callFunction('staff-login', { org: w.slugA, code: `A1-${w.run}`, pin })
  const clockIn = () => w.workerA1.client.from('attendance_events').insert(newEvent(w.orgA, w.workerA1.staffId, w.siteA, { captured_by: w.workerA1.userId }))
  const auditActions = async () => ((await service().from('audit_log').select('action, target_id, details').eq('organization_id', w.orgA).order('id')).data ?? [])

  beforeAll(async () => {
    await purgeStaleWorlds()
    w = await buildWorld()
    const { error } = await service().rpc('staff_pin_set', { p_staff_id: w.workerA1.staffId, p_pin: pin })
    if (error) throw error
  })
  afterAll(async () => {
    if (w) await destroyWorld(w)
  })

  it('audits site creation and every change with before and after values; no-op updates write nothing', async () => {
    const { data: site } = await w.adminA.client.from('work_sites')
      .insert({ organization_id: w.orgA, name: 'Audited Site', ...SITE_A, radius_m: 200, created_by: w.adminA.userId }).select('id').single()
    await w.adminA.client.from('work_sites').update({ radius_m: 350, latitude: 11.8411 }).eq('id', site!.id)
    await w.adminA.client.from('work_sites').update({ radius_m: 350 }).eq('id', site!.id) // nothing changes
    await w.adminA.client.from('work_sites').update({ active: false }).eq('id', site!.id)

    const rows = (await auditActions()).filter((r) => r.target_id === site!.id)
    expect(rows.map((r) => r.action)).toEqual(['create_site', 'update_site', 'update_site'])
    expect(rows[0].details).toMatchObject({ name: { from: null, to: 'Audited Site' }, radius_m: { from: null, to: 200 } })
    expect(rows[1].details).toEqual({
      radius_m: { from: 200, to: 350 },
      latitude: { from: SITE_A.latitude, to: 11.8411 },
    })
    expect(rows[2].details).toEqual({ active: { from: true, to: false } })
    // The admin can read it; workers can't read the audit log at all.
    expect((await w.adminA.client.from('audit_log').select('action').eq('target_id', site!.id)).data).toHaveLength(3)
    expect((await w.workerA1.client.from('audit_log').select('action')).data).toEqual([])
  })

  it('suspension: stamped and audited; admins read but cannot change anything', async () => {
    await service().from('organizations').update({ status: 'suspended' }).eq('id', w.orgA)
    const { data: org } = await service().from('organizations').select('status, suspended_at').eq('id', w.orgA).single()
    expect(org!.suspended_at).not.toBeNull()
    expect((await auditActions()).at(-1)).toMatchObject({ action: 'suspend_org', details: { from: 'active', to: 'suspended' } })

    expect((await clockIn()).error).toBeNull() // seed one event to read and review
    const events = await w.adminA.client.from('attendance_events').select('id')
    expect(events.data!.length).toBeGreaterThan(0) // reports and exports still work
    expect((await w.adminA.client.from('staff').select('id')).data!.length).toBeGreaterThan(0)

    const review = await w.adminA.client.rpc('review_event', { event_id: events.data![0].id, decision: 'approved' })
    expect(review.error?.code).toBe('42501')
    const settings = await w.adminA.client.rpc('update_org_settings', { geofence_mode: 'block' })
    expect(settings.error?.code).toBe('42501')
    const newSite = await w.adminA.client.from('work_sites')
      .insert({ organization_id: w.orgA, name: 'While Suspended', ...SITE_A, created_by: w.adminA.userId })
    expect(DENIED).toContain(newSite.error?.code)
    const edit = await w.adminA.client.from('work_sites').update({ radius_m: 999 }).eq('id', w.siteA)
    expect(DENIED).toContain(edit.error?.code)
    const create = await callFunction('admin-staff', { action: 'create', full_name: 'Not Allowed' }, w.adminA.client)
    expect(create.status).toBe(403)
  })

  it('workers can still sign in and clock in during the 7-day grace', async () => {
    expect((await login()).status).toBe(200)
    expect((await clockIn()).error).toBeNull()
  })

  it('after the grace period, clock-ins and PIN sign-in are refused', async () => {
    await service().from('organizations').update({ suspended_at: new Date(Date.now() - 8 * DAY).toISOString() }).eq('id', w.orgA)
    const refused = await clockIn()
    expect(DENIED).toContain(refused.error?.code)
    const res = await login()
    expect(res.body).toEqual({ error: 'invalid_credentials' })
  })

  it('reactivation clears the suspension (audited) and restores everything', async () => {
    await service().from('organizations').update({ status: 'active' }).eq('id', w.orgA)
    const { data: org } = await service().from('organizations').select('suspended_at').eq('id', w.orgA).single()
    expect(org!.suspended_at).toBeNull()
    expect((await auditActions()).at(-1)).toMatchObject({ action: 'reactivate_org' })
    expect((await clockIn()).error).toBeNull()
    expect((await login()).status).toBe(200)
    const settings = await w.adminA.client.rpc('update_org_settings', { geofence_mode: 'flag' })
    expect(settings.error).toBeNull()
  })
})
