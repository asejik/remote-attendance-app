import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, CheckCheck, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  fetchReviewPage, mapLink, PAGE_SIZE, reviewEvent, type EventFilter, type ReviewEvent, type ReviewStatus,
} from '../../lib/adminEvents';
import { dayRangeUtc, flagLabel, localDay, localTime } from '../../lib/reports';
import type { StaffContext } from '../../context/useStaff';
import { useEscape } from '../../hooks/useEscape';
import { orSuspended } from '../../lib/support';
import { Alert, Badge, PageHeader, SkeletonList } from '../../components/ui';
import { button, card, field } from '../../components/classes';
import { renewPhotoUrl, signListPhotos, signPhotoUrls, type ListPhoto, type PhotoBucket } from '../../lib/photoUrls';

interface Option { id: string; label: string }
type StatusFilter = ReviewStatus | 'all';
type ReviewedRow = Awaited<ReturnType<typeof reviewEvent>>;

// Bulk approvals sent at once.
const BULK_CHUNK = 5;

const inputClass = `${field} text-sm`;

export const ReviewPage = ({ context }: { context: StaffContext }) => {
  const tz = context.organization.timezone;
  const today = localDay(new Date().toISOString(), tz);
  // Overview links here with ?day=YYYY-MM-DD&staff=<id>&status=all.
  const [params] = useSearchParams();
  const linkedDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day')! : today;
  const linkedStatus = params.get('status');
  const [from, setFrom] = useState(linkedDay);
  const [to, setTo] = useState(linkedDay);
  const [staffId, setStaffId] = useState(params.get('staff') ?? '');
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState<StatusFilter>(
    linkedStatus === 'all' || linkedStatus === 'pending' || linkedStatus === 'approved' || linkedStatus === 'rejected' ? linkedStatus : 'pending',
  );
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ events: ReviewEvent[]; total: number } | null>(null);
  // Full photo path -> link to show in the list (its thumbnail when there is one).
  const [photos, setPhotos] = useState<Record<string, ListPhoto>>({});
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
  // What just happened (a decision moves a card out of "Needs review"; it is never deleted).
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
        signListPhotos('event-photos', data.events.flatMap((e) => [e.face_photo_path ?? '', e.site_photo_path ?? ''])),
        signListPhotos('reference-photos', data.events.map((e) => e.staff?.reference_photo_path ?? '')),
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

  // A photo that fails to load (its 10-minute link expired before it scrolled
  // into view) gets a new link, once. Loaded photos are never downloaded again.
  const [renewed] = useState(() => new Set<string>());
  const renew = useCallback(async (bucket: PhotoBucket, path: string, shown: ListPhoto) => {
    if (renewed.has(shown.path)) return;
    renewed.add(shown.path);
    const url = await renewPhotoUrl(bucket, shown.path).catch(() => null);
    if (url) setPhotos((p) => ({ ...p, [path]: { url, path: shown.path } }));
  }, [renewed]);

  // The list shows thumbnails; the full photo is fetched only when one is opened.
  const openPhoto = useCallback(async (bucket: PhotoBucket, path: string, alt: string) => {
    const src = (await signPhotoUrls(bucket, [path]).catch(() => ({} as Record<string, string>)))[path];
    if (src) setLightbox({ src, alt });
  }, []);

  // The page as the admin sees it: reviews applied, and cards that no longer match the status filter gone.
  const shown = (result?.events ?? [])
    .map((e) => (reviewed[e.id] ? { ...e, ...reviewed[e.id] } : e))
    .filter((e) => status === 'all' || e.review_status === status);
  const total = result ? result.total - (result.events.length - shown.length) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const bulkCandidates = shown.filter((e) => e.review_status === 'pending' && e.flags.length === 0);

  const onReviewed = (rows: ReviewedRow[]) => setReviewed((r) => ({ ...r, ...Object.fromEntries(rows.map((row) => [row.id, row])) }));

  // New clock-ins arrive all day: load the list again on request.
  const refresh = async () => {
    setRefreshing(true);
    apply(await load(filter(), page));
    setNotice('');
    setRefreshing(false);
  };

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
    if (n - failed > 0) setNotice(`Approved ${n - failed} clock-in${n - failed === 1 ? '' : 's'} without flags.`);
    if (failed) setBulkMessage(suspendedMessage || `${failed} could not be approved. Please try again.`);
  };

  const changeFilter = (update: () => void) => {
    update();
    setPage(0);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Review" subtitle="Flagged clock-ins come first. Tap a photo to see it full size.">
        <button onClick={refresh} disabled={refreshing} className={button.secondary}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden /> Refresh
        </button>
      </PageHeader>
      <section aria-label="Filters" className={`${card} p-3 grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm`}>
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

      {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {!result && !error && <SkeletonList label="Loading clock-ins" />}
      {result && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600" role="status">
            {total === 0 ? 'No clock-ins match these filters.' : `${total} clock-in${total === 1 ? '' : 's'}`}
          </p>
          {bulkCandidates.length > 0 && (
            <button onClick={approveUnflagged} disabled={bulkBusy}
              className="min-h-11 px-4 rounded-control border border-brand text-brand-900 bg-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-60">
              {bulkBusy ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <CheckCheck size={16} aria-hidden />}
              Approve {bulkCandidates.length} without flags
            </button>
          )}
        </div>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {bulkMessage && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{bulkMessage}</p>}

      <ul className="grid gap-3 lg:grid-cols-2">
        {shown.map((e) => (
          <EventCard key={e.id} event={e} tz={tz} photos={photos} recordedBy={recorders[e.captured_by]} onOpen={openPhoto} onRenew={renew}
            onReviewed={(row) => {
              onReviewed([row]);
              const who = e.staff?.full_name ?? 'the worker';
              const filtered = status !== 'all' && status !== row.review_status;
              setNotice(row.review_status === 'rejected'
                ? `Rejected ${who}'s ${e.type === 'CLOCK_IN' ? 'clock-in' : 'clock-out'}. It stays on record${filtered ? ': choose Status → Rejected to see it' : ''}, and the worker sees it as rejected with your reason.`
                : `Approved ${who}'s ${e.type === 'CLOCK_IN' ? 'clock-in' : 'clock-out'}.${filtered ? ' Choose Status → Approved to see it again.' : ''}`);
            }} />
        ))}
      </ul>

      {result && shown.length === 0 && total > 0 && (
        <div className="flex justify-center">
          <button onClick={showMore} className="min-h-11 px-4 rounded-control border bg-white text-sm font-medium">Show the next clock-ins</button>
        </div>
      )}

      {result && shown.length > 0 && pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-11 px-4 rounded-control border bg-white disabled:opacity-40">Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="min-h-11 px-4 rounded-control border bg-white disabled:opacity-40">Next</button>
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
      <img src={photo.src} alt={photo.alt} className="max-h-full max-w-full rounded-control" />
    </div>
  );
};

type OpenPhoto = (bucket: PhotoBucket, path: string, alt: string) => void;
type RenewPhoto = (bucket: PhotoBucket, path: string, shown: ListPhoto) => void;

const Photo = ({ bucket, path, photos, alt, label, onOpen, onRenew }: {
  bucket: PhotoBucket; path: string | null | undefined; photos: Record<string, ListPhoto>; alt: string; label: string;
  onOpen: OpenPhoto; onRenew: RenewPhoto;
}) => {
  const shown = path ? photos[path] : undefined;
  return (
    <figure className="text-center">
      {path && shown ? (
        <button onClick={() => onOpen(bucket, path, alt)} className="block">
          <img src={shown.url} alt={alt} loading="lazy" decoding="async" onError={() => onRenew(bucket, path, shown)}
            className="h-28 w-24 object-cover rounded-control border border-gray-200" />
        </button>
      ) : (
        <span className="h-28 w-24 rounded-control border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500 px-1">None</span>
      )}
      <figcaption className="mt-1 text-xs text-gray-500">{label}</figcaption>
    </figure>
  );
};

const EventCard = ({ event: e, tz, photos, recordedBy, onOpen, onRenew, onReviewed }: {
  event: ReviewEvent; tz: string; photos: Record<string, ListPhoto>; recordedBy?: string;
  onOpen: OpenPhoto; onRenew: RenewPhoto; onReviewed: (row: ReviewedRow) => void;
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
    <li className={`rounded-card border bg-white p-4 shadow-card ${(e.flag_count ?? 0) > 0 && e.review_status === 'pending' ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{name} <span className="font-mono text-xs font-medium text-gray-600">{e.staff?.staff_code}</span></p>
          <p className="text-sm text-gray-600">
            <span className={`font-bold ${e.type === 'CLOCK_IN' ? 'text-brand-700' : 'text-gray-900'}`}>{e.type === 'CLOCK_IN' ? 'IN' : 'OUT'}</span>
            {' · '}{localDay(e.captured_at, tz)} <span className="font-mono font-medium tabular-nums text-gray-900">{localTime(e.captured_at, tz)}</span> · {e.site_name_snapshot ?? 'No site'}
          </p>
          <p className="text-xs text-gray-600">
            {e.distance_m !== null ? `${Math.round(e.distance_m)} m from site` : 'No location'}
            {e.accuracy_m !== null && ` · GPS ±${Math.round(e.accuracy_m)} m`}
            {e.latitude !== null && e.longitude !== null && (
              <> · <a href={mapLink(e.latitude, e.longitude)} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">Map <ExternalLink size={10} aria-hidden /></a></>
            )}
          </p>
        </div>
        <span className="self-start">
          <Badge tone={e.review_status === 'approved' ? 'success' : e.review_status === 'rejected' ? 'danger' : 'neutral'}>
            {e.review_status === 'pending' ? 'Needs review' : e.review_status === 'approved' ? 'Approved' : 'Rejected'}
          </Badge>
        </span>
      </div>

      {e.flags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Flags">
          {e.flags.map((f) => (
            <li key={f} className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
              <AlertTriangle size={11} aria-hidden /> {flagText(f)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-3 flex-wrap">
        <Photo bucket="event-photos" path={e.face_photo_path} photos={photos} alt={`Clock-in photo of ${name}`}
          label={e.photos_deleted_at ? 'Expired' : 'Clock-in'} onOpen={onOpen} onRenew={onRenew} />
        <Photo bucket="reference-photos" path={e.staff?.reference_photo_path} photos={photos} alt={`Reference photo of ${name}`}
          label="Reference" onOpen={onOpen} onRenew={onRenew} />
        <Photo bucket="event-photos" path={e.site_photo_path} photos={photos} alt={`Site photo from ${name}`}
          label="Site" onOpen={onOpen} onRenew={onRenew} />
      </div>

      {e.review_note && <p className="mt-2 text-sm text-gray-700"><span className="font-medium">Note:</span> {e.review_note}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <label className="block text-sm font-medium text-gray-700">Reason for rejecting
            <textarea autoFocus value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} rows={2} className={`${field} text-sm`} />
          </label>
          <div className="flex gap-2">
            <button onClick={() => decide('rejected')} disabled={busy} className={`${button.danger} text-sm`}>Confirm reject</button>
            <button onClick={() => { setRejecting(false); setError(''); }} className={`${button.secondary} text-sm`}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {e.review_status !== 'approved' && (
            <button onClick={() => decide('approved')} disabled={busy} aria-label={`Approve clock-in by ${name}`}
              className={`${button.primary} px-4 text-sm`}>
              <Check size={16} aria-hidden /> Approve
            </button>
          )}
          {e.review_status !== 'rejected' && (
            <button onClick={() => setRejecting(true)} disabled={busy} aria-label={`Reject clock-in by ${name}`}
              className={`${button.dangerOutline} px-4 text-sm`}>
              <X size={16} aria-hidden /> Reject
            </button>
          )}
        </div>
      )}
    </li>
  );
};
