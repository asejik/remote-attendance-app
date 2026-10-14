// Organisation admins manage workers and supervisors:
//   create | reset_pin | set_status | set_reference_photo
// The caller must be an active admin; every target must be in the caller's
// organisation. Each action is written to the audit log.
import { withCors, json, randomDigits, randomPin, randomSecret, serviceClient } from '../_shared/http.ts'
import { logError } from '../_shared/sentry.ts'
import { retryOnce } from '../_shared/retry.ts'

type Svc = ReturnType<typeof serviceClient>

const jwtClaims = (jwt: string): { aal?: string } => {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))
  } catch {
    return {}
  }
}
interface Admin { userId: string; staffId: string; orgId: string; orgSlug: string }

const audit = async (svc: Svc, admin: Admin, action: string, targetId: string, details: Record<string, unknown> = {}) => {
  const { error } = await svc.from('audit_log').insert({
    organization_id: admin.orgId, actor_user_id: admin.userId, action, target_table: 'staff', target_id: targetId, details,
  })
  if (error) await logError('admin-staff', `audit ${action} failed`, error)
}

const findStaff = async (svc: Svc, admin: Admin, staffId: unknown) => {
  if (typeof staffId !== 'string' || !/^[0-9a-f-]{36}$/.test(staffId)) return null
  const { data } = await svc.from('staff').select('*').eq('id', staffId).eq('organization_id', admin.orgId).maybeSingle()
  return data
}

const create = async (svc: Svc, admin: Admin, body: Record<string, unknown>) => {
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const role = body.role === 'supervisor' ? 'supervisor' : body.role === 'worker' || body.role === undefined ? 'worker' : null
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  const requested = typeof body.staff_code === 'string' && body.staff_code.trim() ? body.staff_code.trim().toUpperCase() : null
  if (fullName.length < 2 || fullName.length > 120) return json({ error: 'invalid_name' }, 400)
  if (!role) return json({ error: 'invalid_role' }, 400) // admins are created by the platform owner
  if (phone && !/^\+?[0-9 ]{7,20}$/.test(phone)) return json({ error: 'invalid_phone' }, 400)
  if (requested && !/^[A-Z0-9-]{2,20}$/.test(requested)) return json({ error: 'invalid_staff_code' }, 400)

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = requested ?? `${role === 'supervisor' ? 'S' : 'W'}-${randomDigits(4)}`
    const { data: taken } = await svc.from('staff').select('id').eq('organization_id', admin.orgId).eq('staff_code', code).maybeSingle()
    if (taken) {
      if (requested) return json({ error: 'staff_code_taken' }, 409)
      continue
    }

    const email = `${code.toLowerCase()}@${admin.orgSlug}.staff.invalid`
    const { data: created, error: userError } = await svc.auth.admin.createUser({
      email, password: randomSecret(), email_confirm: true,
      app_metadata: { organization_id: admin.orgId, kind: 'staff' }, user_metadata: { full_name: fullName },
    })
    if (userError || !created.user) {
      await logError('admin-staff', 'createUser failed', userError)
      return json({ error: 'server_error' }, 500)
    }

    const { data: staff, error: staffError } = await svc.from('staff').insert({
      organization_id: admin.orgId, user_id: created.user.id, full_name: fullName, staff_code: code,
      role, phone, status: 'active', created_by: admin.userId,
    }).select('*').single()
    if (staffError || !staff) {
      await svc.auth.admin.deleteUser(created.user.id)
      if (staffError?.code === '23505' && !requested) continue
      await logError('admin-staff', 'insert staff failed', staffError)
      return json({ error: staffError?.code === '23505' ? 'staff_code_taken' : 'server_error' }, staffError?.code === '23505' ? 409 : 500)
    }

    // The PIN is the last step. If it can't be set (after one retry), undo the
    // staff record and login so the admin can simply try again with the same code.
    const pin = randomPin()
    const pinError = await retryOnce(() => svc.rpc('staff_pin_set', { p_staff_id: staff.id, p_pin: pin }))
    if (pinError) {
      await logError('admin-staff', 'staff_pin_set failed; account creation undone', pinError)
      await svc.from('staff').delete().eq('id', staff.id)
      await svc.auth.admin.deleteUser(created.user.id)
      return json({ error: 'server_error' }, 500)
    }
    await audit(svc, admin, 'create_staff', staff.id, { role, staff_code: code })
    return json({ staff, pin }, 201)
  }
  await logError('admin-staff', 'create: no free staff code after 5 tries')
  return json({ error: 'server_error' }, 500)
}

const resetPin = async (svc: Svc, admin: Admin, body: Record<string, unknown>) => {
  const staff = await findStaff(svc, admin, body.staff_id)
  if (!staff || staff.role === 'admin') return json({ error: 'not_found' }, 404)
  const pin = randomPin()
  const { error } = await svc.rpc('staff_pin_set', { p_staff_id: staff.id, p_pin: pin })
  if (error) {
    await logError('admin-staff', 'reset_pin failed', error)
    return json({ error: 'server_error' }, 500)
  }
  await audit(svc, admin, 'reset_pin', staff.id)
  return json({ pin })
}

const setStatus = async (svc: Svc, admin: Admin, body: Record<string, unknown>) => {
  const status = body.status
  if (status !== 'active' && status !== 'deactivated') return json({ error: 'invalid_status' }, 400)
  const staff = await findStaff(svc, admin, body.staff_id)
  if (!staff) return json({ error: 'not_found' }, 404)
  if (staff.id === admin.staffId) return json({ error: 'cannot_change_self' }, 400)

  const { data: updated, error } = await svc.from('staff').update({
    status, deactivated_at: status === 'deactivated' ? new Date().toISOString() : null,
  }).eq('id', staff.id).select('*').single()
  if (error) {
    await logError('admin-staff', 'set_status update failed', error)
    return json({ error: 'server_error' }, 500)
  }
  // Banning stops new sessions and token refresh; RLS already ignores deactivated staff.
  if (staff.user_id) {
    const { error: banError } = await svc.auth.admin.updateUserById(staff.user_id, {
      ban_duration: status === 'deactivated' ? '876000h' : 'none',
    })
    if (banError) await logError('admin-staff', 'ban update failed', banError)
  }
  await audit(svc, admin, status === 'deactivated' ? 'deactivate_staff' : 'reactivate_staff', staff.id)
  return json({ staff: updated })
}

const setReferencePhoto = async (svc: Svc, admin: Admin, body: Record<string, unknown>) => {
  const staff = await findStaff(svc, admin, body.staff_id)
  if (!staff) return json({ error: 'not_found' }, 404)
  const path = `${admin.orgId}/${staff.id}.jpg`
  if (body.path !== path) return json({ error: 'invalid_path' }, 400)
  const { data: files } = await svc.storage.from('reference-photos').list(admin.orgId, { search: `${staff.id}.jpg` })
  if (!files?.some((f) => f.name === `${staff.id}.jpg`)) return json({ error: 'photo_not_uploaded' }, 400)
  const { data: updated, error } = await svc.from('staff').update({ reference_photo_path: path }).eq('id', staff.id).select('*').single()
  if (error) {
    await logError('admin-staff', 'set_reference_photo update failed', error)
    return json({ error: 'server_error' }, 500)
  }
  await audit(svc, admin, 'set_reference_photo', staff.id)
  return json({ staff: updated })
}

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const svc = serviceClient()
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await svc.auth.getUser(jwt)
  if (!auth?.user) return json({ error: 'unauthorized' }, 401)

  const { data: me } = await svc.from('staff')
    .select('id, organization_id, role, status, organizations(slug, status)')
    .eq('user_id', auth.user.id).maybeSingle<{ id: string; organization_id: string; role: string; status: string; organizations: { slug: string; status: string } }>()
  if (!me || me.role !== 'admin' || me.status !== 'active' || me.organizations?.status !== 'active') {
    return json({ error: 'forbidden' }, 403)
  }
  // Admins must have completed two-step login (migration 20261015150000). The
  // token was just validated by getUser, so its claims can be trusted.
  if (jwtClaims(jwt).aal !== 'aal2') return json({ error: 'mfa_required' }, 403)
  const admin: Admin = { userId: auth.user.id, staffId: me.id, orgId: me.organization_id, orgSlug: me.organizations.slug }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  switch (body.action) {
    case 'create': return create(svc, admin, body)
    case 'reset_pin': return resetPin(svc, admin, body)
    case 'set_status': return setStatus(svc, admin, body)
    case 'set_reference_photo': return setReferencePhoto(svc, admin, body)
    default: return json({ error: 'unknown_action' }, 400)
  }
}))
