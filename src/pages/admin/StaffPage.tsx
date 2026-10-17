import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Camera, KeyRound, Loader2, Pencil, UserPlus, UserX, UserCheck, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createStaff, resetPin, setStaffStatus, updateStaff, uploadReferencePhoto } from '../../lib/adminStaff';
import type { Staff } from '../../lib/staffAuth';
import type { StaffContext } from '../../context/useStaff';
import { useEscape } from '../../hooks/useEscape';
import { useLatestOnly } from '../../hooks/useLatestOnly';
import { renewPhotoUrl, signListPhotos, type ListPhoto } from '../../lib/photoUrls';
import { useFocusOnMount } from '../../hooks/useFocusOnMount';
import { PageHeader, SkeletonList } from '../../components/ui';
import { button, field } from '../../components/classes';

const inputClass = field;

interface StaffList {
  staff: Staff[];
  photos: Record<string, ListPhoto>; // reference_photo_path -> link to its thumbnail (or the photo)
}

const fetchStaffList = async (): Promise<StaffList | null> => {
  const { data, error } = await supabase.from('staff').select('*').order('full_name');
  if (error || !data) return null;
  const photos = await signListPhotos('reference-photos', data.map((s) => s.reference_photo_path ?? ''));
  return { staff: data, photos };
};

// Organisation admins: list staff, add workers (with reference photo), reset
// PINs, deactivate/reactivate. PINs are shown once and never stored readable.
export const StaffPage = ({ context }: { context: StaffContext }) => {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, ListPhoto>>({});
  const [loadError, setLoadError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [pinNotice, setPinNotice] = useState<{ name: string; code: string; pin: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState('');

  const apply = useCallback((result: StaffList | null) => {
    if (!result) return setLoadError("Couldn't load staff. Check your connection and try again.");
    setLoadError('');
    setStaff(result.staff);
    setPhotos(result.photos);
  }, []);
  const latest = useLatestOnly();
  const load = useCallback(() => latest(fetchStaffList(), apply), [latest, apply]);
  // An expired link (photo scrolled into view after 10 minutes) gets a new one, once.
  const [renewed] = useState(() => new Set<string>());
  const renewOnce = async (path: string) => {
    const shown = photos[path];
    if (!shown || renewed.has(shown.path)) return;
    renewed.add(shown.path);
    const url = await renewPhotoUrl('reference-photos', shown.path).catch(() => null);
    if (url) setPhotos((p) => ({ ...p, [path]: { url, path: shown.path } }));
  };

  useEffect(() => {
    load();
  }, [load]);


  const onReset = async (s: Staff) => {
    if (!window.confirm(`Give ${s.full_name} a new PIN? Their old PIN will stop working.`)) return;
    setRowBusy(s.id);
    setRowError('');
    const result = await resetPin(s.id);
    setRowBusy(null);
    if (result.ok) setPinNotice({ name: s.full_name, code: s.staff_code, pin: result.data.pin });
    else setRowError(result.message);
  };

  const onToggleStatus = async (s: Staff) => {
    const next = s.status === 'active' ? 'deactivated' : 'active';
    const question = next === 'deactivated'
      ? `Deactivate ${s.full_name}? They will be logged out and can't clock in. Records they haven't uploaded yet will not be accepted.`
      : `Reactivate ${s.full_name}?`;
    if (!window.confirm(question)) return;
    setRowBusy(s.id);
    setRowError('');
    const result = await setStaffStatus(s.id, next);
    setRowBusy(null);
    if (result.ok) await load();
    else setRowError(result.message);
  };

  const onPhoto = async (s: Staff, file: File | undefined) => {
    if (!file) return;
    setRowBusy(s.id);
    setRowError('');
    const result = await uploadReferencePhoto(s, file);
    setRowBusy(null);
    if (result.ok) await load();
    else setRowError(result.message);
  };

  return (
    <div>

      <div className="space-y-5">
        <PageHeader title="Staff" subtitle="Workers and supervisors: login codes, PINs and reference photos.">
          <button onClick={() => setShowAdd(true)} className={button.primary}>
            <UserPlus size={18} aria-hidden /> Add worker
          </button>
        </PageHeader>

        {rowError && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{rowError}</p>}
        {loadError && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{loadError}</p>}
        {!staff && !loadError && <SkeletonList label="Loading staff" />}
        {staff?.length === 0 && <p className="text-center text-gray-500 py-10">No staff yet. Add your first worker.</p>}

        <ul className="space-y-2">
          {staff?.map((s) => (
            <li key={s.id} className={`bg-white rounded-card border p-3 flex items-center gap-3 ${s.status === 'active' ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
              <label className="relative shrink-0 cursor-pointer" title="Take or choose a reference photo">
                {s.reference_photo_path && photos[s.reference_photo_path] ? (
                  <img src={photos[s.reference_photo_path].url} alt={`Reference photo of ${s.full_name}`} loading="lazy" decoding="async"
                    onError={() => renewOnce(s.reference_photo_path!)} className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400"><Camera size={20} aria-hidden /></span>
                )}
                <span className="sr-only">{s.reference_photo_path ? 'Replace' : 'Add'} reference photo for {s.full_name}</span>
                <input type="file" accept="image/jpeg,image/*" capture="environment" className="sr-only" disabled={rowBusy === s.id}
                  onChange={(e) => onPhoto(s, e.target.files?.[0])} />
              </label>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 break-words">{s.full_name}</p>
                <p className="text-xs text-gray-500">
                  {s.staff_code} · {s.role}
                  {s.status !== 'active' && <span className="ml-1 font-semibold text-red-700">· deactivated</span>}
                  {!s.reference_photo_path && s.role !== 'admin' && <span className="ml-1 text-amber-700">· no reference photo</span>}
                </p>
              </div>
              {s.role !== 'admin' && (
                <div className="flex gap-1">
                  {rowBusy === s.id ? <Loader2 className="animate-spin text-gray-400" aria-label="Working" /> : (
                    <>
                      <button onClick={() => setEditing(s)} aria-label={`Edit ${s.full_name}`}
                        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-control text-gray-600 hover:bg-gray-100"><Pencil size={18} /></button>
                      <button onClick={() => onReset(s)} disabled={s.status !== 'active'} aria-label={`Reset PIN for ${s.full_name}`}
                        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-control text-gray-600 hover:bg-gray-100 disabled:opacity-40"><KeyRound size={18} /></button>
                      <button onClick={() => onToggleStatus(s)}
                        aria-label={`${s.status === 'active' ? 'Deactivate' : 'Reactivate'} ${s.full_name}`}
                        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-control text-gray-600 hover:bg-gray-100">
                        {s.status === 'active' ? <UserX size={18} /> : <UserCheck size={18} />}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {showAdd && (
        <AddStaffDialog
          onClose={() => setShowAdd(false)}
          onCreated={async (s, pin) => {
            setShowAdd(false);
            setPinNotice({ name: s.full_name, code: s.staff_code, pin });
            await load();
          }}
        />
      )}
      {editing && (
        <EditStaffDialog
          staff={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
      {pinNotice && <PinDialog org={context.organization.slug} notice={pinNotice} onClose={() => setPinNotice(null)} />}
    </div>
  );
};

const AddStaffDialog = ({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Staff, pin: string) => void }) => {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'worker' | 'supervisor'>('worker');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEscape(onClose);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!photo) return setError('Take a reference photo of the worker’s face. Admins compare clock-in photos against it.');
    setBusy(true);
    setError('');
    const created = await createStaff({ full_name: fullName, role, phone: phone || undefined, staff_code: code || undefined });
    if (!created.ok) {
      setBusy(false);
      return setError(created.message);
    }
    const uploaded = await uploadReferencePhoto(created.data.staff, photo);
    setBusy(false);
    if (!uploaded.ok) {
      // The account exists; the photo can be added from the list later.
      window.alert(`${created.data.staff.full_name} was added, but the photo failed to upload. Tap their photo circle to try again.`);
    }
    onCreated(created.data.staff, created.data.pin);
  };

  return (
    <div className="fixed inset-0 z-20 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-staff-title">
      <form onSubmit={submit} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-card p-5 space-y-3 max-h-[95vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 id="add-staff-title" className="font-display text-xl font-extrabold text-gray-900">Add worker</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 inline-flex items-center justify-center text-gray-500"><X size={20} /></button>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          Full name
          <input required autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Role</legend>
          <div className="mt-1 flex gap-4">
            {(['worker', 'supervisor'] as const).map((r) => (
              <label key={r} className="min-h-11 flex items-center gap-2 text-gray-800">
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} /> {r === 'worker' ? 'Worker' : 'Supervisor'}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium text-gray-700">
          Phone (optional)
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Staff code (optional, created automatically if empty)
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Reference photo (face, clear and well lit)
          <input required type="file" accept="image/jpeg,image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-gray-700" />
        </label>
        {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
        <button type="submit" disabled={busy} className={`${button.primary} w-full min-h-12`}>
          {busy ? <Loader2 className="animate-spin" size={20} aria-label="Adding worker" /> : 'Add worker'}
        </button>
      </form>
    </div>
  );
};

// Correct a name, phone or role. The staff code is part of the login and stays.
const EditStaffDialog = ({ staff, onClose, onSaved }: { staff: Staff; onClose: () => void; onSaved: () => void }) => {
  const [fullName, setFullName] = useState(staff.full_name);
  const [role, setRole] = useState<'worker' | 'supervisor'>(staff.role === 'supervisor' ? 'supervisor' : 'worker');
  const [phone, setPhone] = useState(staff.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEscape(onClose);
  const titleRef = useFocusOnMount<HTMLHeadingElement>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = await updateStaff(staff.id, { full_name: fullName, role, phone });
    setBusy(false);
    if (result.ok) onSaved();
    else setError(result.message);
  };

  return (
    <div className="fixed inset-0 z-20 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-staff-title">
      <form onSubmit={submit} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-card p-5 space-y-3 max-h-[95vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 id="edit-staff-title" ref={titleRef} tabIndex={-1} className="font-display text-xl font-extrabold text-gray-900 outline-none">Edit {staff.staff_code}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 inline-flex items-center justify-center text-gray-500"><X size={20} /></button>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          Full name
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Role</legend>
          <div className="mt-1 flex gap-4">
            {(['worker', 'supervisor'] as const).map((r) => (
              <label key={r} className="min-h-11 flex items-center gap-2 text-gray-800">
                <input type="radio" name="edit-role" value={r} checked={role === r} onChange={() => setRole(r)} /> {r === 'worker' ? 'Worker' : 'Supervisor'}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium text-gray-700">
          Phone (optional)
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </label>
        <p className="text-xs text-gray-500">The staff code {staff.staff_code} can&apos;t change: it is part of the login. The change is recorded in the audit log.</p>
        {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
        <button type="submit" disabled={busy} className={`${button.primary} w-full min-h-12`}>
          {busy ? <Loader2 className="animate-spin" size={20} aria-label="Saving" /> : 'Save changes'}
        </button>
      </form>
    </div>
  );
};

const PinDialog = ({ org, notice, onClose }: { org: string; notice: { name: string; code: string; pin: string }; onClose: () => void }) => (
  <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pin-title">
    <div className="bg-white w-full max-w-sm rounded-card p-6 space-y-4 text-center">
      <h2 id="pin-title" className="font-display text-xl font-extrabold text-gray-900">Login details for {notice.name}</h2>
      <dl className="bg-gray-50 rounded-card p-4 space-y-2 text-left">
        <div className="flex justify-between"><dt className="text-gray-500">Organisation code</dt><dd className="font-mono font-semibold">{org}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Staff code</dt><dd className="font-mono font-semibold" data-testid="new-staff-code">{notice.code}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">PIN</dt><dd className="font-mono font-semibold text-2xl tracking-widest" data-testid="new-pin">{notice.pin}</dd></div>
      </dl>
      <p className="text-sm text-amber-800 bg-amber-50 rounded-control p-3">Give these to the worker privately. The PIN won&apos;t be shown again; you can reset it later.</p>
      <button autoFocus onClick={onClose} className={`${button.primary} w-full min-h-12`}>Done</button>
    </div>
  </div>
);
