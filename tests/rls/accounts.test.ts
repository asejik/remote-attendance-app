import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  authPasswordGrant, buildWorld, callFunction, clientFromSession, destroyWorld, hasCredentials, jpeg,
  purgeStaleWorlds, service, type World,
} from './fixtures'

// Exercises the deployed admin-staff and staff-login Edge Functions on dev.
describe.skipIf(!hasCredentials)('staff accounts (Edge Functions)', () => {
  let w: World
  let worker: { id: string; staff_code: string; user_id: string }
  let pin: string

  beforeAll(async () => {
    await purgeStaleWorlds()
    w = await buildWorld()
  })
  afterAll(async () => {
    if (w) await destroyWorld(w)
  })

  const login = (code: string, p: string, org = w.slugA) => callFunction('staff-login', { org, code, pin: p })

  describe('admin-staff', () => {
    it('lets an admin create a worker and returns a 6-digit PIN once', async () => {
      const res = await callFunction('admin-staff', { action: 'create', full_name: 'New Worker', role: 'worker' }, w.adminA.client)
      expect(res.status).toBe(201)
      expect(res.body.pin).toMatch(/^[0-9]{6}$/)
      expect(res.body.staff.organization_id).toBe(w.orgA)
      expect(res.body.staff.staff_code).toMatch(/^W-[0-9]{4}$/)
      worker = res.body.staff
      pin = res.body.pin
      const { data: log } = await w.adminA.client.from('audit_log').select('action, target_id').eq('target_id', worker.id)
      expect(log).toContainEqual({ action: 'create_staff', target_id: worker.id })
    })

    it('rejects duplicate codes, admin roles and bad input', async () => {
      const dup = await callFunction('admin-staff', { action: 'create', full_name: 'Dup', staff_code: worker.staff_code }, w.adminA.client)
      expect(dup.status).toBe(409)
      expect((await callFunction('admin-staff', { action: 'create', full_name: 'Boss', role: 'admin' }, w.adminA.client)).status).toBe(400)
      expect((await callFunction('admin-staff', { action: 'create', full_name: 'X' }, w.adminA.client)).status).toBe(400)
    })

    it('refuses callers who are not admins', async () => {
      expect((await callFunction('admin-staff', { action: 'create', full_name: 'Nope' })).status).toBe(401)
      expect((await callFunction('admin-staff', { action: 'create', full_name: 'Nope' }, w.workerA1.client)).status).toBe(403)
      expect((await callFunction('admin-staff', { action: 'create', full_name: 'Nope' }, w.supervisorA.client)).status).toBe(403)
    })

    it('lets an admin correct name, phone and role (audited); code, admins and bad input are refused', async () => {
      const edit = (body: Record<string, unknown>, client = w.adminA.client) =>
        callFunction('admin-staff', { action: 'update', staff_id: worker.id, full_name: 'New Worker', role: 'worker', ...body }, client)
      const res = await edit({ full_name: '  Renamed Worker ', phone: '+234 801 000 0000', role: 'supervisor', staff_code: 'HIJACK' })
      expect(res.status).toBe(200)
      expect(res.body.staff).toMatchObject({ full_name: 'Renamed Worker', phone: '+234 801 000 0000', role: 'supervisor', staff_code: worker.staff_code })
      const { data: log } = await w.adminA.client.from('audit_log').select('details').eq('target_id', worker.id).eq('action', 'update_staff')
      expect(log).toEqual([{ details: {
        before: { full_name: 'New Worker', role: 'worker', phone: null },
        after: { full_name: 'Renamed Worker', role: 'supervisor', phone: '+234 801 000 0000' },
      } }])
      expect((await edit({ full_name: 'X' })).status).toBe(400)
      expect((await edit({ role: 'admin' })).status).toBe(400)
      expect((await edit({ phone: 'call me' })).status).toBe(400)
      expect((await edit({}, w.adminB.client)).status).toBe(404) // another organisation
      expect((await edit({}, w.supervisorA.client)).status).toBe(403)
      const self = await callFunction('admin-staff', { action: 'update', staff_id: w.adminA.staffId, full_name: 'Me', role: 'worker' }, w.adminA.client)
      expect(self.status).toBe(404) // admins are managed by the platform owner
      expect((await edit({})).status).toBe(200) // back to a worker with no phone
    })

    it("refuses an admin acting on another organisation's staff", async () => {
      expect((await callFunction('admin-staff', { action: 'reset_pin', staff_id: worker.id }, w.adminB.client)).status).toBe(404)
      expect((await callFunction('admin-staff', { action: 'set_status', staff_id: worker.id, status: 'deactivated' }, w.adminB.client)).status).toBe(404)
    })

    it('sets a reference photo only after it is uploaded to the right path', async () => {
      const path = `${w.orgA}/${worker.id}.jpg`
      const early = await callFunction('admin-staff', { action: 'set_reference_photo', staff_id: worker.id, path }, w.adminA.client)
      expect(early.status).toBe(400)
      await w.adminA.client.storage.from('reference-photos').upload(path, jpeg())
      const wrong = await callFunction('admin-staff', { action: 'set_reference_photo', staff_id: worker.id, path: `${w.orgA}/other.jpg` }, w.adminA.client)
      expect(wrong.status).toBe(400)
      const ok = await callFunction('admin-staff', { action: 'set_reference_photo', staff_id: worker.id, path }, w.adminA.client)
      expect(ok.status).toBe(200)
      expect(ok.body.staff.reference_photo_path).toBe(path)
    })
  })

  describe('staff-login', () => {
    it('signs a worker in with organisation, code and PIN; RLS sees them as that staff member', async () => {
      const res = await login(worker.staff_code.toLowerCase(), pin, w.slugA.toUpperCase())
      expect(res.status).toBe(200)
      const client = await clientFromSession(res.body)
      const { data } = await client.from('staff').select('id, consent_accepted_at')
      expect(data).toEqual([{ id: worker.id, consent_accepted_at: null }])
      const { data: accepted, error } = await client.rpc('accept_consent')
      expect(error).toBeNull()
      expect(accepted).not.toBeNull()
    })

    it('gives the same answer, with tries left, for a wrong PIN, an unknown code and an unknown organisation', async () => {
      const first = { status: 401, body: { error: 'invalid_credentials', attempts_left: 4 } }
      expect(await login(worker.staff_code, '000000')).toEqual(first)
      expect(await login(`U-${w.run}`, pin)).toEqual(first) // made-up codes are counted the same way
      expect(await login(worker.staff_code, pin, `no-org-${w.run}`)).toEqual(first)
      expect((await login(worker.staff_code, '000000')).body).toEqual({ error: 'invalid_credentials', attempts_left: 3 })
      await login(worker.staff_code, pin) // success resets the failure count
    })

    it('the PIN is not the Auth password, so it cannot be guessed against Auth directly', async () => {
      const { data } = await service().auth.admin.getUserById(worker.user_id)
      expect(data.user?.email).toMatch(/\.staff\.invalid$/)
      expect(await authPasswordGrant(data.user!.email!, pin)).toBe(400)
    })

    it('locks the account after 5 wrong PINs, even for the right PIN, exactly as an unknown code is locked', async () => {
      const lefts: unknown[] = []
      for (let i = 0; i < 4; i++) lefts.push((await login(worker.staff_code, '111111')).body)
      expect(lefts.map((b) => (b as { attempts_left: number }).attempts_left)).toEqual([4, 3, 2, 1])
      const fifth = await login(worker.staff_code, '111111')
      expect(fifth.status).toBe(423)
      const locked = await login(worker.staff_code, pin) // the right PIN no longer works
      expect(locked.status).toBe(423)
      expect(locked.body.error).toBe('locked')
      const minutes = (Date.parse(locked.body.locked_until) - Date.now()) / 60_000
      expect(minutes).toBeGreaterThan(13)
      expect(minutes).toBeLessThanOrEqual(15.5) // first lock: 15 minutes (allowing for clock differences)
      // A made-up code behaves the same: 5 tries, then the same kind of lock.
      const fake = `X-${w.run}`
      for (let i = 0; i < 5; i++) await login(fake, '111111')
      const fakeLocked = await login(fake, pin)
      expect(fakeLocked.status).toBe(423)
      expect(Object.keys(fakeLocked.body).sort()).toEqual(Object.keys(locked.body).sort())
      expect(Math.abs(Date.parse(fakeLocked.body.locked_until) - Date.parse(locked.body.locked_until))).toBeLessThan(120_000)
      const { data: log } = await w.adminA.client.from('audit_log').select('action, details').eq('target_id', worker.id).eq('action', 'pin_locked')
      expect(log).toHaveLength(1)
      expect(log![0].details).toMatchObject({ lock: 1 }) // first lock: 15 minutes
    })

    it('a PIN reset by the admin unlocks the account and replaces the old PIN', async () => {
      const reset = await callFunction('admin-staff', { action: 'reset_pin', staff_id: worker.id }, w.adminA.client)
      expect(reset.status).toBe(200)
      expect((await login(worker.staff_code, pin)).status).toBe(pin === reset.body.pin ? 200 : 401)
      pin = reset.body.pin
      expect((await login(worker.staff_code, pin)).status).toBe(200)
    })

    it('a deactivated worker cannot sign in and their existing session sees nothing; reactivation restores access', async () => {
      const session = await clientFromSession((await login(worker.staff_code, pin)).body)
      const off = await callFunction('admin-staff', { action: 'set_status', staff_id: worker.id, status: 'deactivated' }, w.adminA.client)
      expect(off.status).toBe(200)
      expect((await login(worker.staff_code, pin)).body).toEqual({ error: 'deactivated' })
      expect((await session.from('work_sites').select('id')).data).toEqual([])
      const on = await callFunction('admin-staff', { action: 'set_status', staff_id: worker.id, status: 'active' }, w.adminA.client)
      expect(on.status).toBe(200)
      expect((await login(worker.staff_code, pin)).status).toBe(200)
    })

    it('an admin cannot deactivate themselves', async () => {
      const res = await callFunction('admin-staff', { action: 'set_status', staff_id: w.adminA.staffId, status: 'deactivated' }, w.adminA.client)
      expect(res.status).toBe(400)
    })
  })
})
