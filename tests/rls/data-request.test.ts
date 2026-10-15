import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildWorld, destroyWorld, hasCredentials, jpeg, newEvent, purgeStaleWorlds, service, type World } from './fixtures'

// scripts/data-request.mjs against the test organisations: export and erase one
// worker, then a dry run and a full deletion of an organisation.
const run = promisify(execFile)
const script = (env: Record<string, string>) => run('node', ['scripts/data-request.mjs'], {
  env: { ...process.env, CI: '1', SUPABASE_URL: process.env.VITE_SUPABASE_URL!, ...env },
})

describe.skipIf(!hasCredentials)('data requests (export and deletion)', () => {
  let w: World
  let out: string
  let eventId: string
  const code = () => `A1-${w.run}`

  beforeAll(async () => {
    await purgeStaleWorlds()
    w = await buildWorld()
    out = mkdtempSync(join(tmpdir(), 'data-request-'))
    eventId = newEvent(w.orgA, w.workerA1.staffId, w.siteA).id
    const path = `${w.orgA}/${eventId}/face.jpg`
    await w.workerA1.client.storage.from('event-photos').upload(path, jpeg())
    await w.workerA1.client.storage.from('event-photos').upload(path.replace('face', 'face_thumb'), jpeg()) // deleted with it, not exported
    const { error } = await w.workerA1.client.from('attendance_events')
      .insert(newEvent(w.orgA, w.workerA1.staffId, w.siteA, { id: eventId, face_photo_path: path, site_photo_path: null }))
    if (error) throw error
    await w.workerA2.client.from('attendance_events').insert(newEvent(w.orgA, w.workerA2.staffId, w.siteA))
  })
  afterAll(async () => {
    if (out) rmSync(out, { recursive: true, force: true })
    if (w) await destroyWorld(w)
  })

  it("exports one worker's records and photos only", async () => {
    const { stdout } = await script({ ACTION: 'export', ORG_SLUG: w.slugA, STAFF_CODE: code(), OUT_DIR: out })
    expect(stdout).toContain('1 staff, 1 clock-in records, 1 photos')
    const dir = join(out, readdirSync(out)[0])
    expect(readFileSync(join(dir, 'attendance_events.csv'), 'utf8')).toContain(eventId)
    expect(readFileSync(join(dir, 'staff.csv'), 'utf8')).not.toContain('A2-')
    expect(existsSync(join(dir, 'photos', 'event-photos', w.orgA, eventId, 'face.jpg'))).toBe(true)
    expect(existsSync(join(dir, 'audit_log.csv'))).toBe(false) // organisation-level only
  })

  it('deletes nothing without CONFIRM', async () => {
    const { stdout } = await script({ ACTION: 'delete', ORG_SLUG: w.slugA, STAFF_CODE: code() })
    expect(stdout).toContain('DRY RUN')
    expect((await service().from('staff').select('id').eq('id', w.workerA1.staffId)).data).toHaveLength(1)
  })

  it("erases one worker: photos, records, staff row, login; others untouched; the erasure is audited", async () => {
    await script({ ACTION: 'delete', ORG_SLUG: w.slugA, STAFF_CODE: code(), CONFIRM: `${w.slugA}/${code()}` })
    const svc = service()
    expect((await svc.from('staff').select('id').eq('id', w.workerA1.staffId)).data).toEqual([])
    expect((await svc.from('attendance_events').select('id').eq('staff_id', w.workerA1.staffId)).data).toEqual([])
    expect((await svc.storage.from('event-photos').list(`${w.orgA}/${eventId}`)).data).toEqual([])
    expect((await svc.auth.admin.getUserById(w.workerA1.userId)).data.user).toBeNull()
    expect((await svc.from('attendance_events').select('id').eq('staff_id', w.workerA2.staffId)).data).toHaveLength(1)
    const { data: log } = await svc.from('audit_log').select('details').eq('action', 'erase_staff').eq('target_id', w.workerA1.staffId)
    expect(log).toEqual([{ details: { staff_code: code(), events: 1 } }])
    w.userIds = w.userIds.filter((id) => id !== w.workerA1.userId)
  })

  it('deletes a whole organisation after a dry run', async () => {
    const dry = await script({ ACTION: 'delete', ORG_SLUG: w.slugB })
    expect(dry.stdout).toMatch(/DRY RUN.*1 staff, 1 logins/)
    await script({ ACTION: 'delete', ORG_SLUG: w.slugB, CONFIRM: w.slugB })
    const svc = service()
    expect((await svc.from('organizations').select('id').eq('id', w.orgB)).data).toEqual([])
    expect((await svc.auth.admin.getUserById(w.adminB.userId)).data.user).toBeNull()
    expect((await svc.from('organizations').select('id').eq('id', w.orgA)).data).toHaveLength(1)
    w.userIds = w.userIds.filter((id) => id !== w.adminB.userId)
  })
})
