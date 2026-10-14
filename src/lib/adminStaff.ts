import { supabase } from './supabase';
import { functionError, type Staff } from './staffAuth';
import { shrinkPhoto } from './image';

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  invalid_name: 'Enter the full name (2 to 120 characters).',
  invalid_phone: 'Enter a valid phone number.',
  invalid_staff_code: 'Staff codes use letters, numbers and dashes (2 to 20 characters).',
  staff_code_taken: 'That staff code is already used.',
  cannot_change_self: "You can't deactivate your own account.",
  forbidden: 'Not allowed. Only organisation admins can do this, and not while the subscription is suspended.',
  network: "Can't reach the server. Check your internet connection.",
};

const call = async <T>(body: Record<string, unknown>): Promise<Result<T>> => {
  const { data, error } = await supabase.functions.invoke('admin-staff', { body });
  if (error) {
    const err = await functionError(error);
    return { ok: false, message: MESSAGES[err.error ?? ''] ?? 'Something went wrong. Please try again.' };
  }
  return { ok: true, data: data as T };
};

export const createStaff = (input: { full_name: string; role: 'worker' | 'supervisor'; phone?: string; staff_code?: string }) =>
  call<{ staff: Staff; pin: string }>({ action: 'create', ...input });

export const resetPin = (staffId: string) => call<{ pin: string }>({ action: 'reset_pin', staff_id: staffId });

export const setStaffStatus = (staffId: string, status: 'active' | 'deactivated') =>
  call<{ staff: Staff }>({ action: 'set_status', staff_id: staffId, status });

// Shrinks and uploads the photo to reference-photos/{org}/{staff}.jpg, then
// records it on the staff row.
export const uploadReferencePhoto = async (staff: Staff, file: Blob): Promise<Result<Staff>> => {
  const path = `${staff.organization_id}/${staff.id}.jpg`;
  const photo = await shrinkPhoto(file, 800, 0.8);
  const { error } = await supabase.storage
    .from('reference-photos')
    .upload(path, photo, { contentType: 'image/jpeg', upsert: true });
  if (error) return { ok: false, message: 'The photo could not be uploaded. Please try again.' };
  const result = await call<{ staff: Staff }>({ action: 'set_reference_photo', staff_id: staff.id, path });
  return result.ok ? { ok: true, data: result.data.staff } : result;
};
