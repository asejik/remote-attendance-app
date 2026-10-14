import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, buildWorld, callFunction, destroyWorld, hasCredentials, purgeStaleWorlds, type World } from './fixtures'
import { totp } from '../support/totp'

// Migration 20261015150000: an admin has no admin power until two-step login
// (TOTP) is complete for that session.
describe.skipIf(!hasCredentials)('admin two-step login', () => {
  let w: World
  let passwordOnly: ReturnType<typeof anon>

  beforeAll(async () => {
    await purgeStaleWorlds()
    w = await buildWorld()
    passwordOnly = anon()
    const { error } = await passwordOnly.auth.signInWithPassword({ email: w.adminA.email, password: w.adminA.password })
    if (error) throw error
  })
  afterAll(async () => {
    if (w) await destroyWorld(w)
  })

  it('a password-only session can read its own staff record (so the app asks for the code) and nothing else', async () => {
    expect((await passwordOnly.auth.mfa.getAuthenticatorAssuranceLevel()).data).toMatchObject({ currentLevel: 'aal1', nextLevel: 'aal2' })
    const { data: staff } = await passwordOnly.from('staff').select('id, role')
    expect(staff).toEqual([{ id: w.adminA.staffId, role: 'admin' }])
    expect((await passwordOnly.from('attendance_events').select('id')).data).toEqual([])
    expect((await passwordOnly.from('audit_log').select('id')).data).toEqual([])
    expect((await passwordOnly.from('work_sites').select('id, active')).data!.every((s) => s.active)).toBe(true) // only what workers see
    expect((await passwordOnly.storage.from('reference-photos').list(w.orgA)).data).toEqual([])
  })

  it('a password-only session cannot use admin actions', async () => {
    expect((await passwordOnly.rpc('review_event', { event_id: randomUUID(), decision: 'approved' })).error?.code).toBe('42501')
    expect((await passwordOnly.rpc('update_org_settings', { geofence_mode: 'block' })).error?.code).toBe('42501')
    const site = await passwordOnly.from('work_sites').insert({ organization_id: w.orgA, name: 'No MFA', latitude: 1, longitude: 1, created_by: w.adminA.userId })
    expect(site.error?.code).toBe('42501')
    const res = await callFunction('admin-staff', { action: 'create', full_name: 'Not Allowed' }, passwordOnly)
    expect(res).toEqual({ status: 403, body: { error: 'mfa_required' } })
  })

  it('entering the code unlocks admin power for that session', async () => {
    const { data: factors } = await passwordOnly.auth.mfa.listFactors()
    const factor = factors!.totp[0]
    const { error } = await passwordOnly.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(w.adminA.totpSecret!) })
    expect(error).toBeNull()
    expect((await passwordOnly.from('staff').select('id')).data!.length).toBeGreaterThan(1)
    expect((await passwordOnly.rpc('update_org_settings', {})).error).toBeNull()
  })

  it('workers are unaffected (PIN sessions never need a code)', async () => {
    expect((await w.workerA1.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.nextLevel).toBe('aal1')
    expect((await w.workerA1.client.from('work_sites').select('id')).data!.length).toBeGreaterThan(0)
  })
})
