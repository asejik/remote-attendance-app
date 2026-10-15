// Data requests for one organisation, or one worker in it (Nigeria Data
// Protection Act: access and erasure; client exit). Run through the
// "Data request (production)" workflow, or against dev for testing.
//
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY, ACTION=export|delete, ORG_SLUG
// Optional: STAFF_CODE (one worker instead of the whole organisation)
//   export: OUT_DIR (default ./data-export), INCLUDE_PHOTOS=true (always on for one worker)
//   delete: CONFIRM=<ORG_SLUG> or <ORG_SLUG>/<STAFF_CODE>. Without it, nothing is
//           deleted and the script only reports what would be (dry run).
//
// Deleting a worker removes their photos, clock-in records, staff record, PIN
// and login. Audit-log entries about them are kept (record of processing; they
// hold the staff code, no personal details). Deleting an organisation removes
// everything, including its audit log. Export first.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env') && !process.env.CI) process.loadEnvFile('.env')
const need = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
const action = need('ACTION')
if (!['export', 'delete'].includes(action)) throw new Error('ACTION must be export or delete')
const slug = need('ORG_SLUG').toLowerCase()
const staffCode = process.env.STAFF_CODE?.trim().toUpperCase() || null

const svc = createClient(need('SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const check = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}
// All rows, 1,000 at a time (the API's page limit).
const all = async (build, what) => {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const page = check(await build().range(from, from + 999), what)
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

const org = check(await svc.from('organizations').select('*').eq('slug', slug).maybeSingle(), 'find organisation')
if (!org) throw new Error(`No organisation with code "${slug}"`)
let person = null
if (staffCode) {
  person = check(await svc.from('staff').select('*').eq('organization_id', org.id).ilike('staff_code', staffCode).maybeSingle(), 'find staff')
  if (!person) throw new Error(`No staff code "${staffCode}" in ${slug}`)
}
const target = person ? `${slug}/${person.staff_code}` : slug

const staff = person ? [person] : await all(() => svc.from('staff').select('*').eq('organization_id', org.id).order('id'), 'staff')
const events = await all(() => {
  const q = svc.from('attendance_events').select('*').eq('organization_id', org.id)
  return (person ? q.eq('staff_id', person.id) : q).order('captured_at').order('id')
}, 'events')
const photoPaths = {
  'event-photos': events.flatMap((e) => (e.photos_deleted_at ? [] : [e.face_photo_path, e.site_photo_path])).filter(Boolean),
  'reference-photos': staff.map((s) => s.reference_photo_path).filter(Boolean),
}
// Thumbnails sit next to each photo (face.jpg -> face_thumb.jpg, migration
// 20261015160000). Exports leave them out; deletions include them.
const withThumbs = (paths) => paths.flatMap((p) => [p, p.replace(/\.jpg$/, '_thumb.jpg')])

// Every object under {org}/ in a bucket (event photos sit one folder deeper).
const listAll = async (bucket, prefix) => {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const page = check(await svc.storage.from(bucket).list(prefix, { limit: 1000, offset }), `list ${bucket}/${prefix}`)
    for (const entry of page) {
      const path = `${prefix}/${entry.name}`
      if (entry.id) out.push(path)
      else out.push(...(await listAll(bucket, path))) // a folder
    }
    if (page.length < 1000) return out
  }
}

if (action === 'export') {
  const dir = join(process.env.OUT_DIR || 'data-export', `${target.replace('/', '-')}-${new Date().toISOString().slice(0, 10)}`)
  mkdirSync(dir, { recursive: true })
  // Spreadsheet-safe CSV (formula characters neutralised, as in the app's reports).
  const cell = (v) => {
    if (v === null || v === undefined) return ''
    let t = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const csv = (rows) => {
    if (!rows.length) return ''
    const keys = Object.keys(rows[0])
    return '﻿' + [keys, ...rows.map((r) => keys.map((k) => r[k]))].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  }
  writeFileSync(join(dir, 'organization.json'), JSON.stringify(org, null, 2))
  writeFileSync(join(dir, 'staff.csv'), csv(staff))
  writeFileSync(join(dir, 'attendance_events.csv'), csv(events))
  if (!person) {
    writeFileSync(join(dir, 'work_sites.csv'), csv(await all(() => svc.from('work_sites').select('*').eq('organization_id', org.id).order('id'), 'sites')))
    writeFileSync(join(dir, 'audit_log.csv'), csv(await all(() => svc.from('audit_log').select('*').eq('organization_id', org.id).order('id'), 'audit log')))
  }
  let photos = 0
  if (person || process.env.INCLUDE_PHOTOS === 'true') {
    for (const [bucket, paths] of Object.entries(photoPaths)) {
      for (const path of paths) {
        const { data, error } = await svc.storage.from(bucket).download(path)
        if (error) continue // already deleted by retention
        const file = join(dir, 'photos', bucket, path)
        mkdirSync(join(file, '..'), { recursive: true })
        writeFileSync(file, Buffer.from(await data.arrayBuffer()))
        photos++
      }
    }
  }
  console.log(`Exported ${target}: ${staff.length} staff, ${events.length} clock-in records, ${photos} photos -> ${dir}`)
} else {
  const objects = person
    ? { 'event-photos': withThumbs(photoPaths['event-photos']), 'reference-photos': withThumbs(photoPaths['reference-photos']) }
    : { 'event-photos': await listAll('event-photos', org.id), 'reference-photos': await listAll('reference-photos', org.id) }
  const userIds = staff.map((s) => s.user_id).filter(Boolean)
  const count = person ? photoPaths : objects // a person's list also names thumbnails, which may not exist
  const plan = `${target}: ${count['event-photos'].length} event photos, ${count['reference-photos'].length} reference photos (and their thumbnails), ` +
    `${events.length} clock-in records, ${staff.length} staff, ${userIds.length} logins${person ? '' : ', all sites, the audit log and the organisation'}`
  if (process.env.CONFIRM?.trim().toLowerCase() !== target.toLowerCase()) {
    console.log(`DRY RUN (nothing deleted). Would delete ${plan}.\nTo delete, set CONFIRM=${target}`)
    process.exit(0)
  }
  for (const [bucket, paths] of Object.entries(objects)) {
    for (let i = 0; i < paths.length; i += 100) check(await svc.storage.from(bucket).remove(paths.slice(i, i + 100)), `remove ${bucket}`)
  }
  if (person) {
    check(await svc.from('attendance_events').delete().eq('staff_id', person.id), 'delete events')
    check(await svc.from('staff').delete().eq('id', person.id), 'delete staff') // the PIN goes with it
    check(await svc.from('audit_log').insert({
      organization_id: org.id, actor_user_id: null, action: 'erase_staff', target_table: 'staff', target_id: person.id,
      details: { staff_code: person.staff_code, events: events.length },
    }), 'audit')
  } else {
    for (const table of ['audit_log', 'attendance_events', 'staff', 'work_sites']) {
      check(await svc.from(table).delete().eq('organization_id', org.id), `delete ${table}`)
    }
    check(await svc.from('organizations').delete().eq('id', org.id), 'delete organisation')
  }
  for (const id of userIds) {
    await svc.from('profiles').delete().eq('id', id) // legacy prototype table (until it is dropped); ignore if absent
    const { error } = await svc.auth.admin.deleteUser(id)
    if (error) {
      // A login that recorded clock-ins for other workers (supervisor) can't be deleted while those exist: ban it instead.
      await svc.auth.admin.updateUserById(id, { ban_duration: '876000h' })
      console.log(`Login ${id} banned, not deleted: ${error.message}`)
    }
  }
  console.log(`Deleted ${plan}.`)
}
