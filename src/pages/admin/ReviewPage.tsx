import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCheck, ExternalLink, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  fetchReviewPage, mapLink, PAGE_SIZE, reviewEvent, signPhotoUrls, type EventFilter, type ReviewEvent, type ReviewStatus,
} from '../../lib/adminEvents';
import { dayRangeUtc, flagLabel, localDay, localTime } from '../../lib/reports';
import type { StaffContext } from '../../context/useStaff';
import { useEscape } from '../../hooks/useEscape';
import { orSuspended } from '../../lib/support';

interface Option { id: string; label: string }
type StatusFilter = ReviewStatus | 'all';
type ReviewedRow = Awaited<ReturnType<typeof reviewEvent>>;

// Signed photo links last 10 minutes; renew them before that while the page stays open.
const RESIGN_MS = 8 * 60_000;
// Bulk approvals sent at once.
const BULK_CHUNK = 5;

const inputClass = 'mt-1 block w-full min-h-11 rounded-lg border border-gray-300 bg-white py-2 px-2 text-sm text-gray-900';

export const ReviewPage = ({ context }: { context: StaffContext }) => {
  const tz = context.organization.timezone;
  const today = localDay(new Date().toISOString(), tz);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [staffId, setStaffId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ events: ReviewEvent[]; total: number } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [people, setPeople] = useState<Option[]>([]);
  // Login → name, to show who recorded a clock-in for someone else.
  const [recorders, setRecorders] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<Option[]>([]);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  // Reviews made on this page, applied in place so the list doesn't reload after every tap.
  const [reviewed, setReviewed] = useState<Record<string, ReviewedRow>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('staff').select('id, full_name, staff_code, role, user_id').order('full_name'),
      supabase.from('work_sites').select('id, name').order('name'),
    ]).then(([s, w]) => {
      if (cancelled) return;
      setPeople((s.data ?? []).filter((p) => p.role !== 'admin').map((p) => ({ id: p.id, label: `${p.full_name} (${p.staff_code})` })));
      setRecorders(Object.fromEntries((s.data ?? []).filter((p) => p.user_id).map((p) => [p.user_id!, `${p.full_name} (${p.staff_code})`])));
      setSites((w.data ?? []).map((x) => ({ id: x.id, label: x.name })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (filter: EventFilter, pageNo: number) => {
    try {
      const data = await fetchReviewPage(filter, pageNo);
      const [eventPhotos, refPhotos] = await Promise.all([
        signPhotoUrls('event-photos', data.events.flatMap((e) => [e.face_photo_path ?? '', e.site_photo_path ?? ''])),
        signPhotoUrls('reference-photos', data.events.map((e) => e.staff?.reference_photo_path ?? '')),
      ]);
      return { data, photos: { ...eventPhotos, ...refPhotos }, error: '' };
    } catch {
      return { data: null, photos: {}, error: "Couldn't load clock-ins. Check your connection and try again." };
    }
  }, []);

  const filter = useCallback((): EventFilter => ({
    ...dayRangeUtc(from <= to ? from : to, from <= to ? to : from, tz),
    staffId: staffId || undefined, siteId: siteId || undefined, flaggedOnly, status: status === 'all' ? undefined : status,
  }), [from, to, tz, staffId, siteId, flaggedOnly, status]);

  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    setResult(r.data);
    setPhotos(r.photos);
    setError(r.error);
    setReviewed({});
    setBulkMessage('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(filter(), page).then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [load, apply, filter, page]);

  // Keep photo links valid while the admin works through a long page.
  useEffect(() => {
    if (!result?.events.length) return;
    const events = result.events;
    const timer = window.setInterval(() => {
      Promise.all([
        signPhotoUrls('event-photos', events.flatMap((e) => [e.face_photo_path ?? '', e.site_photo_path ?? ''])),
        signPhotoUrls('reference-photos', events.map((e) => e.staff?.reference_photo_path ?? '')),
      ]).then(([a, b]) => setPhotos({ ...a, ...b })).catch(() => undefined);
    }, RESIGN_MS);
    return () => window.clearInterval(timer);
  }, [result]);

  // The page as the admin sees it: reviews applied, and cards that no longer match the status filter gone.
  const shown = (result?.events ?? [])
    .map((e) => (reviewed[e.id] ? { ...e, ...reviewed[e.id] } : e))
    .filter((e) => status === 'all' || e.review_status === status);
  const total = result ? result.total - (result.events.length - shown.length) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const bulkCandidates = shown.filter((e) => e.review_status === 'pending' && e.flags.length === 0);

  const onReviewed = (rows: ReviewedRow[]) => setReviewed((r) => ({ ...r, ...Object.fromEntries(rows.map((row) => [row.id, row])) }));

  // After the last card on a page is reviewed, load what's left.
  const showMore = async () => {
    const last = pages - 1;
    if (page > last) return setPage(last);
    apply(await load(filter(), page));
  };

  const approveUnflagged = async () => {
    const n = bulkCandidates.length;
    if (!window.confirm(`Approve ${n} clock-in${n === 1 ? '' : 's'} without flags on this page? Check their photos first: a clock-in by someone else is not flagged automatically.`)) return;
    setBulkBusy(true);
    setBulkMessage('');
    let failed = 0;
    let suspendedMessage = '';
    for (let i = 0; i < n; i += BULK_CHUNK) {
      const results = await Promise.allSettled(bulkCandidates.slice(i, i + BULK_CHUNK).map((e) => reviewEvent(e.id, 'approved', null)));
      onReviewed(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
      for (const r of results) {
        if (r.status === 'rejected') {
          failed += 1;
          suspendedMessage = orSuspended(r.reason, '');
        }
      }
    }
    setBulkBusy(false);
    if (failed) setBulkMessage(suspendedMessage || `${failed} could not be approved. Please try again.`);
  };

  const changeFilter = (update: () => void) => {
    update();
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <section aria-label="Filters" className="bg-white rounded-xl border border-gray-200 p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 text-sm">
        <label className="font-medium text-gray-700">From
          <input type="date" value={from} max={today} onChange={(e) => changeFilter(() => setFrom(e.target.value))} className={inputClass} />
        </label>
        <label className="font-medium text-gray-700">To
          <input type="date" value={to} max={today} onChange={(e) => changeFilter(() => setTo(e.target.value))} className={inputClass} />
        </label>
        <label className="font-medium text-gray-700">Worker
          <select value={staffId} onChange={(e) => changeFilter(() => setStaffId(e.target.value))} className={inputClass}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="font-medium text-gray-700">Site
          <select value={siteId} onChange={(e) => changeFilter(() => setSiteId(e.target.value))} className={inputClass}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="font-medium text-gray-700">Status
          <select value={status} onChange={(e) => changeFilter(() => setStatus(e.target.value as StatusFilter))} className={inputClass}>
            <option value="pending">Needs review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="font-medium text-gray-700 flex items-end gap-2 pb-2">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => changeFilter(() => setFlaggedOnly(e.target.checked))} className="h-4 w-4" />
          Flagged only
        </label>
      </section>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      {!result && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" aria-label="Loading clock-ins" /></div>}
      {result && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600" role="status">
            {total === 0 ? 'No clock-ins match these filters.' : `${total} clock-in${total === 1 ? '' : 's'}`}
          </p>
          {bulkCandidates.length > 0 && (
            <button onClick={approveUnflagged} disabled={bulkBusy}
              className="min-h-11 px-4 rounded-lg border border-green-700 text-green-800 bg-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-60">
              {bulkBusy ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <CheckCheck size={16} aria-hidden />}
              Approve {bulkCandidates.length} without flags
            </button>
          )}
        </div>
      )}
      {bulkMessage && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{bulkMessage}</p>}

      <ul className="space-y-3">
        {shown.map((e) => (
          <EventCard key={e.id} event={e} tz={tz} photos={photos} recordedBy={recorders[e.captured_by]} onOpen={setLightbox}
            onReviewed={(row) => onReviewed([row])} />
        ))}
      </ul>

      {result && shown.length === 0 && total > 0 && (
        <div className="flex justify-center">
          <button onClick={showMore} className="min-h-11 px-4 rounded-lg border bg-white text-sm font-medium">Show the next clock-ins</button>
        </div>
      )}

      {result && shown.length > 0 && pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-11 px-4 rounded-lg border bg-white disabled:opacity-40">Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="min-h-11 px-4 rounded-lg border bg-white disabled:opacity-40">Next</button>
        </nav>
      )}

      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
};

const Lightbox = ({ photo, onClose }: { photo: { src: string; alt: string }; onClose: () => void }) => {
  useEscape(onClose);
  // Focus moves to the close button, and back to the photo that opened it.
  const [opener] = useState(() => document.activeElement as HTMLElement | null); // read before autoFocus moves it
  useEffect(() => () => opener?.focus(), [opener]);
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={photo.alt} onClick={onClose}>
      <button autoFocus onClick={onClose} aria-label="Close photo" className="absolute top-4 right-4 text-white min-h-11 min-w-11 inline-flex items-center justify-center"><X size={28} /></button>
      <img src={photo.src} alt={photo.alt} className="max-h-full max-w-full rounded-lg" />
    </div>
  );
};

const Photo = ({ src, alt, label, onOpen }: { src?: string; alt: string; label: string; onOpen: (p: { src: string; alt: string }) => void }) => (
  <figure className="text-center">
    {src ? (
      <button onClick={() => onOpen({ src, alt })} className="block">
        <img src={src} alt={alt} loading="lazy" className="h-28 w-24 object-cover rounded-lg border border-gray-200" />
      </button>
    ) : (
      <span className="h-28 w-24 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500 px-1">None</span>
    )}
    <figcaption className="mt-1 text-xs text-gray-500">{label}</figcaption>
  </figure>
);

const EventCard = ({ event: e, tz, photos, recordedBy, onOpen, onReviewed }: {
  event: ReviewEvent; tz: string; photos: Record<string, string>; recordedBy?: string;
  onOpen: (p: { src: string; alt: string }) => void; onReviewed: (row: ReviewedRow) => void;
}) => {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = e.staff?.full_name ?? 'Unknown worker';

  const decide = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && note.trim().length < 3) return setError('Add a short reason for rejecting.');
    setBusy(true);
    setError('');
    try {
      const row = await reviewEvent(e.id, decision, decision === 'rejected' ? note.trim() : null);
      setRejecting(false);
      onReviewed(row);
    } catch (err) {
      setError(orSuspended(err, 'Could not save the review. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const flagText = (flag: string) =>
    flag === 'outside_radius' && e.distance_m !== null ? `Outside site (${e.distance_m >= 1000 ? `${(e.distance_m / 1000).toFixed(1)} km` : `${Math.round(e.distance_m)} m`})`
      : flag === 'recorded_by_other' ? `Recorded by ${recordedBy ?? 'another login'}`
      : flagLabel(flag);

  return (
    <li className={`bg-white rounded-xl border p-4 ${(e.flag_count ?? 0) > 0 && e.review_status === 'pending' ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{name} <span className="text-xs text-gray-500">{e.staff?.staff_code}</span></p>
          <p className="text-sm text-gray-600">
            <span className={`font-semibold ${e.type === 'CLOCK_IN' ? 'text-green-700' : 'text-red-700'}`}>{e.type === 'CLOCK_IN' ? 'IN' : 'OUT'}</span>
            {' · '}{localDay(e.captured_at, tz)} {localTime(e.captured_at, tz)} · {e.site_name_snapshot ?? 'No site'}
          </p>
          <p className="text-xs text-gray-500">
            {e.distance_m !== null ? `${Math.round(e.distance_m)} m from site` : 'No location'}
            {e.accuracy_m !== null && ` · GPS ±${Math.round(e.accuracy_m)} m`}
            {e.latitude !== null && e.longitude !== null && (
              <> · <a href={mapLink(e.latitude, e.longitude)} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">Map <ExternalLink size={10} aria-hidden /></a></>
            )}
          </p>
        </div>
        <span className={`self-start text-xs font-semibold px-2 py-1 rounded-full ${
          e.review_status === 'approved' ? 'bg-green-100 text-green-800' : e.review_status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>
          {e.review_status === 'pending' ? 'Needs review' : e.review_status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
      </div>

      {e.flags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Flags">
          {e.flags.map((f) => (
            <li key={f} className="text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1">
              <AlertTriangle size={11} aria-hidden /> {flagText(f)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-3 flex-wrap">
        <Photo src={e.face_photo_path ? photos[e.face_photo_path] : undefined} alt={`Clock-in photo of ${name}`} label={e.photos_deleted_at ? 'Expired' : 'Clock-in'} onOpen={onOpen} />
        <Photo src={e.staff?.reference_photo_path ? photos[e.staff.reference_photo_path] : undefined} alt={`Reference photo of ${name}`} label="Reference" onOpen={onOpen} />
        <Photo src={e.site_photo_path ? photos[e.site_photo_path] : undefined} alt={`Site photo from ${name}`} label="Site" onOpen={onOpen} />
      </div>

      {e.review_note && <p className="mt-2 text-sm text-gray-700"><span className="font-medium">Note:</span> {e.review_note}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <label className="block text-sm font-medium text-gray-700">Reason for rejecting
            <textarea autoFocus value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-gray-300 p-2 text-sm" />
          </label>
          <div className="flex gap-2">
            <button onClick={() => decide('rejected')} disabled={busy} className="min-h-11 px-4 rounded-lg bg-red-700 text-white text-sm font-medium disabled:opacity-60">Confirm reject</button>
            <button onClick={() => { setRejecting(false); setError(''); }} className="min-h-11 px-4 rounded-lg border text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {e.review_status !== 'approved' && (
            <button onClick={() => decide('approved')} disabled={busy} aria-label={`Approve clock-in by ${name}`}
              className="min-h-11 px-4 rounded-lg bg-green-700 text-white text-sm font-medium flex items-center gap-1 disabled:opacity-60">
              <Check size={16} aria-hidden /> Approve
            </button>
          )}
          {e.review_status !== 'rejected' && (
            <button onClick={() => setRejecting(true)} disabled={busy} aria-label={`Reject clock-in by ${name}`}
              className="min-h-11 px-4 rounded-lg border border-red-300 text-red-700 text-sm font-medium flex items-center gap-1 disabled:opacity-60">
              <X size={16} aria-hidden /> Reject
            </button>
          )}
        </div>
      )}
    </li>
  );
};
