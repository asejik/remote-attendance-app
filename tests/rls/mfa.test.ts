import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, buildWorld, callFunction, destroyWorld, hasCredentials, purgeStaleWorlds, service, type World } from './fixtures'
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
    expect((await passwordOnly.from('work_sites').select('id')).data).toEqual([]) // not even active sites (migration 20261015180000)
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

  // Migration 20261015170000: Supabase limits code guesses per IP only, so a job
  // locks admins after repeated wrong codes (20 in 24 h; 3 here, for this admin only).
  it('repeated wrong codes lock the admin: even the right code then gives no admin power', async () => {
    const guesser = anon()
    await guesser.auth.signInWithPassword({ email: w.adminB.email, password: w.adminB.password })
    const factor = (await guesser.auth.mfa.listFactors()).data!.totp[0]
    for (let i = 0; i < 3; i++) {
      expect((await guesser.auth.mfa.challengeAndVerify({ factorId: factor.id, code: '000000' })).error).not.toBeNull()
    }
    const svc = service()
    const lock = () => svc.rpc('lock_guessed_admins', { p_threshold: 3, p_only_user: w.adminB.userId })
    expect((await lock()).data).toBe(1)
    expect((await lock()).data).toBe(0) // already locked: not twice

    let verified = await guesser.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(w.adminB.totpSecret!) })
    if (verified.error?.code === 'mfa_ip_address_mismatch') verified = await guesser.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(w.adminB.totpSecret!) })
    expect(verified.error).toBeNull() // the session is AAL2...
    expect((await guesser.rpc('my_admin_lockout')).data).toBe(true)
    expect((await guesser.from('staff').select('id')).data).toEqual([{ id: w.adminB.staffId }]) // ...but only its own record
    expect((await guesser.from('attendance_events').select('id')).data).toEqual([])
    expect((await guesser.rpc('update_org_settings', {})).error?.code).toBe('42501')
    expect(await callFunction('admin-staff', { action: 'create', full_name: 'Not Allowed' }, guesser)).toEqual({ status: 403, body: { error: 'mfa_locked' } })
    // The admin's own session from before the lock loses its power too.
    expect((await w.adminB.client.rpc('update_org_settings', {})).error?.code).toBe('42501')

    const { data: log } = await svc.from('audit_log').select('target_id, details').eq('organization_id', w.orgB).eq('action', 'admin_locked_wrong_codes')
    expect(log).toHaveLength(1)
    expect(log![0].target_id).toBe(w.adminB.staffId)
    expect((log![0].details as { wrong_codes_24h: number }).wrong_codes_24h).toBeGreaterThanOrEqual(3)
    // The daily purge run reports the new lock once (to Sentry).
    expect((await svc.rpc('admin_lockouts_to_report')).data).toEqual(expect.arrayContaining([expect.objectContaining({ organization_id: w.orgB })]))
    expect((await svc.rpc('admin_lockouts_to_report')).data!.some((r) => r.organization_id === w.orgB)).toBe(false)
  })

  it('other people cannot see or call the lock functions', async () => {
    expect((await w.adminA.client.rpc('lock_guessed_admins', {})).error).not.toBeNull()
    expect((await w.adminA.client.rpc('admin_locked', { p_user_id: w.adminB.userId })).error).not.toBeNull()
    expect((await anon().rpc('my_admin_lockout')).error).not.toBeNull()
    expect((await w.adminA.client.rpc('my_admin_lockout')).data).toBe(false)
  })

  it('workers are unaffected (PIN sessions never need a code)', async () => {
    expect((await w.workerA1.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.nextLevel).toBe('aal1')
    expect((await w.workerA1.client.from('work_sites').select('id')).data!.length).toBeGreaterThan(0)
  })
})
