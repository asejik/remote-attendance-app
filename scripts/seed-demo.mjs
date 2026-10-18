// Seeds the DEV project with a sample organisation and a realistic week of
// attendance, for client demos: a busy Overview, a Review queue with a few
// flagged clock-ins, a night shift, an absence, a forgotten clock-out and
// reports worth exporting. Only shows what the app can do today (no "recorded
// by someone else": there's no screen for that yet). Every person is made up and every photo is a drawn
// placeholder marked "SAMPLE".
//
// Re-run it on the morning of a demo: it deletes only the records it made
// earlier (device_info.sample = true, with their photos) and rebuilds the week
// up to "now", so "today" is always today. Accounts, PINs and any clock-ins
// made live during the demo are kept.
//
// Usage: SEED_ALLOW=dev node scripts/seed-demo.mjs [--name "Org name"] [--slug sample]
//          [--lat 9.0579 --lng 7.4951]  (centre for the sample sites; default central Abuja)
//          [--reset-logins]             (new admin password and presenter PIN)
// Needs SUPABASE_URL + SUPABASE_SECRET_KEY in .env. Prints the logins: keep them
// in the private repo, never here. Never point this at production.
import { randomInt, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'

if (existsSync('.env')) process.loadEnvFile('.env')
const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required')
if (process.env.SEED_ALLOW !== 'dev') throw new Error('Refusing to run: set SEED_ALLOW=dev to confirm this is the dev project')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const ORG = { name: arg('name', 'Sample Builders Ltd'), slug: arg('slug', 'sample') }
const CENTRE = { lat: Number(arg('lat', '9.0579')), lng: Number(arg('lng', '7.4951')) }
const resetLogins = process.argv.includes('--reset-logins')
const TZ = 'Africa/Lagos' // UTC+1 all year

const svc = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const check = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

// ---- Organisation, sites, people ----

const SITES = [
  { key: 'estate', name: 'Riverside Estate, Block C', dLat: 0.012, dLng: -0.018, radius_m: 250 },
  { key: 'bridge', name: 'Ring Road Bridge', dLat: -0.021, dLng: 0.015, radius_m: 300 },
  { key: 'office', name: 'Head Office Yard', dLat: 0.002, dLng: 0.004, radius_m: 120 },
]
// Made-up names. `plan` drives the week (see dayPlan below).
const PEOPLE = [
  { code: 'ADM-01', name: 'Sample Admin', role: 'admin' },
  { code: 'SUP-01', name: 'Ibrahim Danjuma', role: 'supervisor', site: 'estate', plan: 'regular' },
  { code: 'SUP-02', name: 'Ngozi Eze', role: 'supervisor', site: 'bridge', plan: 'regular' },
  { code: 'WRK-01', name: 'Presenter Phone', role: 'worker', site: 'estate', plan: 'none' }, // the live demo login
  { code: 'WRK-02', name: 'Musa Abdullahi', role: 'worker', site: 'estate', plan: 'regular' },
  { code: 'WRK-03', name: 'Blessing Okonkwo', role: 'worker', site: 'estate', plan: 'away_once' },
  { code: 'WRK-04', name: 'Tunde Adeyemi', role: 'worker', site: 'estate', plan: 'forgot_out' },
  { code: 'WRK-05', name: 'Aisha Bello', role: 'worker', site: 'bridge', plan: 'regular' },
  { code: 'WRK-06', name: 'Chinedu Obi', role: 'worker', site: 'bridge', plan: 'weak_gps' },
  { code: 'WRK-07', name: 'Fatima Yusuf', role: 'worker', site: 'bridge', plan: 'no_smile' },
  { code: 'WRK-08', name: 'Emeka Nwosu', role: 'worker', site: 'bridge', plan: 'absent' },
  { code: 'WRK-09', name: 'Halima Garba', role: 'worker', site: 'office', plan: 'regular' },
  { code: 'WRK-10', name: 'Samuel Johnson', role: 'worker', site: 'office', plan: 'night' },
  { code: 'WRK-11', name: 'Grace Akpan', role: 'worker', site: 'estate', plan: 'late' },
]

const org = check(await svc.from('organizations')
  .upsert({ ...ORG, timezone: TZ, site_photo_required: true, geofence_mode: 'flag' }, { onConflict: 'slug' }).select().single(), 'organisation')

const sites = {}
for (const s of SITES) {
  const row = { organization_id: org.id, name: s.name, latitude: CENTRE.lat + s.dLat, longitude: CENTRE.lng + s.dLng, radius_m: s.radius_m, active: true }
  const existing = check(await svc.from('work_sites').select('id').eq('organization_id', org.id).eq('name', s.name), 'find site')
  sites[s.key] = existing.length
    ? check(await svc.from('work_sites').update(row).eq('id', existing[0].id).select().single(), `site ${s.name}`)
    : check(await svc.from('work_sites').insert(row).select().single(), `site ${s.name}`)
}

// ---- Placeholder photos, drawn in a headless browser ----

const browser = await chromium.launch()
const page = await browser.newPage()
const draw = (spec) => page.evaluate(async (spec) => {
  const c = document.createElement('canvas')
  c.width = spec.w
  c.height = spec.h
  const g = c.getContext('2d')
  const s = spec.w / 600
  if (spec.kind === 'face') {
    g.fillStyle = spec.bg
    g.fillRect(0, 0, spec.w, spec.h)
    g.fillStyle = spec.shirt
    g.beginPath(); g.ellipse(300 * s, 820 * s, 260 * s, 250 * s, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = spec.skin
    g.fillRect(255 * s, 470 * s, 90 * s, 110 * s)
    g.beginPath(); g.ellipse(300 * s, 360 * s, 130 * s, 160 * s, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#1b1b1b'
    g.beginPath(); g.ellipse(300 * s, 245 * s, 135 * s, 70 * s, 0, Math.PI, 0); g.fill()
    g.beginPath(); g.arc(250 * s, 350 * s, 11 * s, 0, Math.PI * 2); g.arc(350 * s, 350 * s, 11 * s, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 7 * s; g.lineCap = 'round'
    g.beginPath(); g.arc(300 * s, 410 * s, 45 * s, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke()
  } else {
    const sky = g.createLinearGradient(0, 0, 0, spec.h * 0.6)
    sky.addColorStop(0, '#9cc9e6'); sky.addColorStop(1, '#e6f1f7')
    g.fillStyle = sky; g.fillRect(0, 0, spec.w, spec.h)
    g.fillStyle = '#b89b72'; g.fillRect(0, 560 * s, spec.w, spec.h)
    g.fillStyle = '#8e8e8a'; g.fillRect(90 * s, 300 * s, 260 * s, 270 * s)
    g.fillStyle = '#6f6f6b'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.fillRect((115 + i * 80) * s, (325 + j * 80) * s, 50 * s, 50 * s)
    g.strokeStyle = '#d9a400'; g.lineWidth = 10 * s
    g.beginPath(); g.moveTo(430 * s, 570 * s); g.lineTo(430 * s, 150 * s); g.lineTo(560 * s, 150 * s); g.stroke()
    g.fillStyle = '#3d3d3a'; g.font = `bold ${30 * s}px sans-serif`; g.textAlign = 'center'
    g.fillText(spec.label, 300 * s, 600 * s)
  }
  // Inside the middle square, so lists' square previews still show it.
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 610 * s, spec.w, 60 * s)
  g.fillStyle = '#fff'; g.font = `bold ${34 * s}px sans-serif`; g.textAlign = 'center'
  g.fillText('SAMPLE', spec.w / 2, 652 * s)
  return c.toDataURL('image/jpeg', 0.8).split(',')[1]
}, spec).then((b64) => Buffer.from(b64, 'base64'))

const SKIN = ['#8d5524', '#a0662f', '#6b4423', '#c68642', '#7a4a2a']
const SHIRT = ['#1f5f99', '#b5442f', '#2f7d4f', '#6b4fa0', '#c9832b', '#3d3d3d', '#0f6b63']
const BG = ['#d9d4cc', '#cfd8dc', '#e3dccf', '#d7e0d4']
const look = (i) => ({ skin: SKIN[i % SKIN.length], shirt: SHIRT[i % SHIRT.length] })
const face = async (i, bg, small) => draw({ kind: 'face', w: small ? 240 : 600, h: small ? 320 : 800, bg, ...look(i) })
const sitePhoto = async (label, small) => draw({ kind: 'site', w: small ? 240 : 600, h: small ? 320 : 800, label })

const upload = async (bucket, path, buffer) => {
  const { error } = await svc.storage.from(bucket).upload(path, buffer, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`)
}

// ---- Accounts ----

const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
const staff = {}
const logins = []
for (const [i, p] of PEOPLE.entries()) {
  const email = p.role === 'admin' ? `${ORG.slug}.admin@attendance-dev.test` : `${p.code.toLowerCase()}@${ORG.slug}.staff.invalid`
  let user = list.users.find((u) => u.email === email)
  let password = p.role === 'admin' ? '(unchanged)' : null
  if (!user) {
    password = p.role === 'admin' ? `Demo-${randomUUID().slice(0, 13)}` : randomUUID()
    user = check(await svc.auth.admin.createUser({ email, password, email_confirm: true }), `create ${email}`).user
    if (p.role !== 'admin') password = null
  } else if (p.role === 'admin' && resetLogins) {
    password = `Demo-${randomUUID().slice(0, 13)}`
    check(await svc.auth.admin.updateUserById(user.id, { password }), `reset ${email}`)
  }
  const existing = check(await svc.from('staff').select('id, reference_photo_path').eq('organization_id', org.id).eq('staff_code', p.code), 'find staff')
  const row = {
    organization_id: org.id, user_id: user.id, full_name: p.name, staff_code: p.code, role: p.role, status: 'active',
    // The presenter accepts the notice live, on the phone; the made-up people already have.
    ...(p.code === 'WRK-01' ? {} : { consent_accepted_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), consent_version: 2 }),
  }
  const s = existing.length
    ? check(await svc.from('staff').update(row).eq('id', existing[0].id).select().single(), `staff ${p.code}`)
    : check(await svc.from('staff').insert(row).select().single(), `staff ${p.code}`)
  staff[p.code] = { ...s, ...p }

  if (p.role !== 'admin' && p.code !== 'WRK-01') {
    const ref = `${org.id}/${s.id}.jpg`
    await upload('reference-photos', ref, await face(i, '#ffffff'))
    await upload('reference-photos', ref.replace(/\.jpg$/, '_thumb.jpg'), await face(i, '#ffffff', true))
    if (s.reference_photo_path !== ref) check(await svc.from('staff').update({ reference_photo_path: ref }).eq('id', s.id), `photo ${p.code}`)
  }
  let pin = null
  if (p.code === 'WRK-01' && (!existing.length || resetLogins)) {
    pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
    check(await svc.rpc('staff_pin_set', { p_staff_id: s.id, p_pin: pin }), 'presenter PIN')
  }
  if (p.role === 'admin' || p.code === 'WRK-01') logins.push({ who: p.name, code: p.code, email: p.role === 'admin' ? email : '', password: password ?? '', pin: pin ?? (p.code === 'WRK-01' ? '(unchanged)' : '') })
}
const adminUserId = staff['ADM-01'].user_id

// ---- Remove the previous sample week ----

const old = check(await svc.from('attendance_events').select('id').eq('organization_id', org.id).contains('device_info', { sample: true }), 'find old events')
for (let i = 0; i < old.length; i += 50) {
  const ids = old.slice(i, i + 50).map((e) => e.id)
  const paths = ids.flatMap((id) => ['face', 'site', 'face_thumb', 'site_thumb'].map((k) => `${org.id}/${id}/${k}.jpg`))
  await svc.storage.from('event-photos').remove(paths)
  check(await svc.from('attendance_events').delete().in('id', ids), 'delete old events')
}

// ---- The week ----

const now = Date.now()
const LAGOS = 3_600_000
const localMidnight = (daysAgo) => {
  const d = new Date(now + LAGOS)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysAgo) - LAGOS
}
const at = (daysAgo, hh, mm) => localMidnight(daysAgo) + (hh * 60 + mm) * 60_000
const jitter = (min) => randomInt(-min, min + 1)
const metres = (m) => m / 111_320 // degrees of latitude per metre (close enough for offsets)

// What one person did on one day: a list of clock-ins/outs with any oddity.
// daysAgo 0 = today. Sundays are off for everyone except the night guard.
const dayPlan = (p, daysAgo) => {
  const weekday = new Date(localMidnight(daysAgo) + LAGOS).getUTCDay()
  if (p.plan === 'none') return []
  if (weekday === 0 && p.plan !== 'night') return []
  const inAt = at(daysAgo, 7, 40 + jitter(15))
  const outAt = at(daysAgo, 17, 5 + jitter(20))
  const day = [{ type: 'CLOCK_IN', t: inAt }, { type: 'CLOCK_OUT', t: outAt }]
  switch (p.plan) {
    case 'away_once': if (daysAgo === 2) day[0].away = 1400; break
    case 'forgot_out': if (daysAgo === 3) day.pop(); break
    case 'weak_gps': if (daysAgo === 1 || daysAgo === 0) day[0].accuracy = 140 + randomInt(0, 60); break
    case 'no_smile': if (daysAgo === 4 || daysAgo === 0) day[0].noSmile = true; break
    case 'absent': if (daysAgo <= 1 || daysAgo === 4) return []; break
    case 'late': day[0].t = at(daysAgo, daysAgo % 2 ? 9 : 8, 20 + jitter(10)); break
    case 'night': return [{ type: 'CLOCK_IN', t: at(daysAgo, 19, 0 + jitter(10)) }, { type: 'CLOCK_OUT', t: at(daysAgo - 1, 6, 30 + jitter(10)) }]
  }
  return day
}

const events = []
for (const p of Object.values(staff)) {
  if (p.role === 'admin') continue
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    for (const e of dayPlan(p, daysAgo)) {
      if (e.t > now - 60_000) continue // nothing in the future: today fills up as the day goes on
      const site = sites[p.site]
      const away = e.away ?? randomInt(5, Math.round(site.radius_m * 0.6))
      const angle = Math.random() * Math.PI * 2
      events.push({
        id: randomUUID(), p, e, site, daysAgo,
        latitude: site.latitude + metres(away * Math.sin(angle)),
        longitude: site.longitude + metres(away * Math.cos(angle)) / Math.cos((site.latitude * Math.PI) / 180),
      })
    }
  }
}

const siteShots = {}
for (const s of Object.values(sites)) siteShots[s.id] = { full: await sitePhoto(s.name), thumb: await sitePhoto(s.name, true) }
const faceShots = {}
for (const [i, p] of Object.values(staff).entries()) {
  if (p.role === 'admin') continue
  const bg = BG[i % BG.length]
  faceShots[p.code] = { full: await face(PEOPLE.findIndex((x) => x.code === p.code), bg), thumb: await face(PEOPLE.findIndex((x) => x.code === p.code), bg, true) }
}
await browser.close()

let done = 0
for (const ev of events) {
  const base = `${org.id}/${ev.id}`
  await upload('event-photos', `${base}/face.jpg`, faceShots[ev.p.code].full)
  await upload('event-photos', `${base}/face_thumb.jpg`, faceShots[ev.p.code].thumb)
  await upload('event-photos', `${base}/site.jpg`, siteShots[ev.site.id].full)
  await upload('event-photos', `${base}/site_thumb.jpg`, siteShots[ev.site.id].thumb)
  // The database trigger works out distance, flags and review state, as for a real upload.
  check(await svc.from('attendance_events').insert({
    id: ev.id, organization_id: org.id, staff_id: ev.p.id, captured_by: ev.p.user_id,
    site_id: ev.site.id, type: ev.e.type, captured_at: new Date(ev.e.t).toISOString(),
    latitude: ev.latitude, longitude: ev.longitude, accuracy_m: ev.e.accuracy ?? randomInt(6, 25),
    liveness_passed: !ev.e.noSmile, face_photo_path: `${base}/face.jpg`, site_photo_path: `${base}/site.jpg`,
    device_info: { sample: true, app_version: 'sample', platform: 'android' },
  }), `event ${ev.p.code}`)
  if (++done % 25 === 0) process.stdout.write(`  ${done}/${events.length} records\n`)
}

// The admin has reviewed everything before yesterday: unflagged ones approved,
// flagged ones decided with a note. Yesterday and today wait in the queue.
const reviewed = check(await svc.from('attendance_events').select('id, flags, staff_id, captured_at').eq('organization_id', org.id)
  .contains('device_info', { sample: true }).lt('captured_at', new Date(localMidnight(1)).toISOString()), 'reviewable')
const NOTES = {
  outside_radius: ['rejected', 'Not at the site: 1.4 km away. Spoke to the worker.'],
  liveness_failed: ['approved', 'Face matches; smile check skipped in poor light.'],
  low_accuracy: ['approved', 'Weak signal at the bridge; site photo confirms.'],
}
for (const r of reviewed) {
  const [status, note] = r.flags.length ? (NOTES[r.flags.find((f) => NOTES[f])] ?? ['approved', null]) : ['approved', null]
  check(await svc.from('attendance_events').update({
    review_status: status, review_note: note, reviewed_by: adminUserId, reviewed_at: new Date(Date.parse(r.captured_at) + 20 * 3_600_000).toISOString(),
  }).eq('id', r.id), 'review')
}

const flagged = check(await svc.from('attendance_events').select('id', { count: 'exact', head: false }).eq('organization_id', org.id)
  .contains('device_info', { sample: true }).gt('flag_count', 0), 'count flagged').length
console.log(`\n"${org.name}" (slug ${org.slug}): ${Object.keys(sites).length} sites, ${PEOPLE.length} people, ${events.length} sample records (${flagged} flagged), ${reviewed.length} already reviewed.`)
console.table(logins)
console.log('Keep these logins in the private repo. The admin sets up two-step login on first sign-in.')
