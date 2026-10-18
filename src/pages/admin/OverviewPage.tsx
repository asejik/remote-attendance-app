import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, MapPin, RefreshCw, UserRound, UserX } from 'lucide-react';
import { fetchEventsForReport, fetchStaffForReport } from '../../lib/adminEvents';
import { dayOverview, dayRangeUtc, flagLabel, localDay, localTime, MAX_SHIFT_MS, whichRecords, type DayRow, type DayStatus } from '../../lib/reports';
import { renewPhotoUrl, signListPhotos, type ListPhoto, type PhotoBucket } from '../../lib/photoUrls';
import { useLatestOnly } from '../../hooks/useLatestOnly';
import type { StaffContext } from '../../context/useStaff';
import { Alert, Badge, PageHeader, SkeletonList } from '../../components/ui';
import { button, card, field } from '../../components/classes';

type Filter = 'all' | 'present' | 'on_site' | 'absent' | 'review';

const STATUS: Record<DayStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger'; Icon: typeof MapPin }> = {
  on_site: { label: 'On site now', tone: 'success', Icon: MapPin },
  clocked_out: { label: 'Clocked out', tone: 'neutral', Icon: CheckCircle },
  no_clock_out: { label: 'No clock-out', tone: 'warning', Icon: AlertTriangle },
  absent: { label: 'Absent', tone: 'danger', Icon: UserX },
};

const shiftDay = (day: string, by: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
};

const matches: Record<Filter, (r: DayRow) => boolean> = {
  all: () => true,
  present: (r) => r.status !== 'absent',
  on_site: (r) => r.status === 'on_site',
  absent: (r) => r.status === 'absent',
  review: (r) => r.pending > 0,
};

// Who worked on a day, where and when: one row per active staff member.
export const OverviewPage = ({ context }: { context: StaffContext }) => {
  const tz = context.organization.timezone;
  const today = localDay(new Date().toISOString(), tz);
  const [day, setDay] = useState(today);
  const [result, setResult] = useState<{ day: string; rows: DayRow[] } | null>(null);
  const [photos, setPhotos] = useState<Record<string, ListPhoto>>({});
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [site, setSite] = useState('');
  const [role, setRole] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const latest = useLatestOnly();

  const load = useCallback(async (d: string) => {
    const { start, end } = dayRangeUtc(d, d, tz);
    // A little past the day, so night shifts' clock-outs after midnight count.
    const after = new Date(Date.parse(end) + MAX_SHIFT_MS).toISOString();
    try {
      const [events, staff] = await Promise.all([fetchEventsForReport(start, after), fetchStaffForReport()]);
      const rows = dayOverview(events, staff, d, tz);
      const [refPhotos, facePhotos] = await Promise.all([
        signListPhotos('reference-photos', rows.map((r) => r.staff.reference_photo_path ?? '')),
        signListPhotos('event-photos', rows.flatMap((r) => r.events.map((e) => e.face_photo_path ?? ''))),
      ]).catch(() => [{}, {}]); // photos are a nicety; the table still shows
      return { result: { day: d, rows }, photos: { ...refPhotos, ...facePhotos }, error: '' };
    } catch {
      return { result: null, photos: {}, error: "Couldn't load attendance. Check your connection and try again." };
    }
  }, [tz]);

  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    if (r.result) setResult(r.result);
    setPhotos(r.photos);
    setError(r.error);
  }, []);

  useEffect(() => {
    latest(load(day), apply);
  }, [day, load, apply, latest]);

  const refresh = async () => {
    setRefreshing(true);
    await latest(load(day), apply);
    setRefreshing(false);
  };

  // A photo whose link expired before it was shown gets a new link, once.
  const [renewed] = useState(() => new Set<string>());
  const renew = useCallback(async (bucket: PhotoBucket, path: string, shown: ListPhoto) => {
    if (renewed.has(shown.path)) return;
    renewed.add(shown.path);
    const url = await renewPhotoUrl(bucket, shown.path).catch(() => null);
    if (url) setPhotos((p) => ({ ...p, [path]: { url, path: shown.path } }));
  }, [renewed]);

  const loading = !error && result?.day !== day;
  const rows = result?.day === day ? result.rows : [];
  const sites = [...new Set(rows.map((r) => r.site).filter((s): s is string => !!s))].sort();
  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => matches[filter](r)
    && (!q || r.staff.full_name.toLowerCase().includes(q) || r.staff.staff_code.toLowerCase().includes(q))
    && (!site || r.site === site)
    && (!role || r.staff.role === role));
  const count = (f: Filter) => rows.filter(matches[f]).length;
  const toReview = rows.reduce((n, r) => n + r.pending, 0);
  const isToday = day === today;
  const dayLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  const tiles: { f: Filter; label: string; value: number; note?: string }[] = [
    { f: 'present', label: 'Present', value: count('present'), note: `of ${rows.length}` },
    { f: 'on_site', label: 'On site now', value: count('on_site') },
    { f: 'absent', label: 'Absent', value: count('absent') },
    { f: 'review', label: 'Needs review', value: toReview, note: toReview === 1 ? 'clock-in' : 'clock-ins' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Overview" subtitle="Who worked on a day, where and when. Tap a person to see their clock-ins.">
        <button onClick={refresh} disabled={refreshing} className={button.secondary}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden /> Refresh
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day" className={`${button.secondary} px-3`}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <label className="text-sm font-semibold text-gray-700">Day
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} className={`${field} text-sm`} />
        </label>
        <button type="button" onClick={() => setDay(shiftDay(day, 1))} disabled={isToday} aria-label="Next day" className={`${button.secondary} px-3`}>
          <ChevronRight size={18} aria-hidden />
        </button>
        {!isToday && <button type="button" onClick={() => setDay(today)} className={button.secondary}>Today</button>}
        <p className="basis-full text-sm text-gray-600 sm:ml-2 sm:basis-auto sm:self-center">{isToday ? `Today, ${dayLabel}` : dayLabel}</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => {
          const active = filter === t.f;
          return (
            <button key={t.f} type="button" aria-pressed={active} onClick={() => setFilter(active ? 'all' : t.f)}
              className={`${card} min-h-11 p-4 text-left transition duration-150 hover:border-brand focus-visible:outline-3 focus-visible:outline-brand ${active ? 'border-brand ring-2 ring-brand' : ''}`}>
              <span className="block text-sm font-semibold text-gray-700">{t.label}</span>
              <span className="mt-1 block font-display text-3xl font-extrabold tabular-nums leading-none text-gray-900">
                {loading ? '–' : t.value}
                {t.note && <span className="ml-1.5 font-sans text-sm font-semibold text-gray-600">{t.note}</span>}
              </span>
            </button>
          );
        })}
      </section>

      <section aria-label="Filters" className={`${card} grid grid-cols-1 gap-3 p-3 text-sm sm:grid-cols-3`}>
        <label className="font-semibold text-gray-700">Search
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or staff code" className={`${field} text-sm`} />
        </label>
        <label className="font-semibold text-gray-700">Site
          <select value={site} onChange={(e) => setSite(e.target.value)} className={`${field} text-sm`}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="font-semibold text-gray-700">Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`${field} text-sm`}>
            <option value="">Workers and supervisors</option>
            <option value="worker">Workers</option>
            <option value="supervisor">Supervisors</option>
          </select>
        </label>
      </section>

      {loading && <SkeletonList rows={4} label="Loading attendance" />}
      {!loading && result && (
        <>
          <p className="text-sm text-gray-600" aria-live="polite">
            {shown.length} of {rows.length} {rows.length === 1 ? 'person' : 'people'}
            {filter !== 'all' && <> · <button type="button" onClick={() => setFilter('all')} className={`${button.link} min-h-0 underline`}>show everyone</button></>}
          </p>
          {rows.length === 0 && <p className={`${card} p-6 text-sm text-gray-600`}>No active workers yet. Add them under Staff.</p>}
          {rows.length > 0 && shown.length === 0 && <p className={`${card} p-6 text-sm text-gray-600`}>Nobody matches these filters.</p>}
          {shown.length > 0 && (
            <ul className="space-y-2 lg:hidden" aria-label="Staff">
              {shown.map((r) => (
                <li key={r.staff.id} className={`${card} overflow-hidden`}>
                  <PersonCard row={r} tz={tz} photos={photos} renew={renew} open={open === r.staff.id} toggle={() => setOpen(open === r.staff.id ? null : r.staff.id)} day={day} />
                </li>
              ))}
            </ul>
          )}
          {shown.length > 0 && (
            <div className={`${card} hidden overflow-hidden lg:block`}>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Attendance on {dayLabel}</caption>
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-[0.08em] text-gray-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Staff</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Site</th>
                    <th scope="col" className="px-4 py-3">In</th>
                    <th scope="col" className="px-4 py-3">Out</th>
                    <th scope="col" className="px-4 py-3">Hours</th>
                    <th scope="col" className="px-4 py-3">Flags and review</th>
                  </tr>
                </thead>
                {shown.map((r) => (
                  <PersonRow key={r.staff.id} row={r} tz={tz} photos={photos} renew={renew} open={open === r.staff.id} toggle={() => setOpen(open === r.staff.id ? null : r.staff.id)} day={day} />
                ))}
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface RowProps {
  row: DayRow;
  tz: string;
  day: string;
  photos: Record<string, ListPhoto>;
  renew: (bucket: PhotoBucket, path: string, shown: ListPhoto) => void;
  open: boolean;
  toggle: () => void;
}

const StatusBadge = ({ status }: { status: DayStatus }) => {
  const { label, tone, Icon } = STATUS[status];
  return <Badge tone={tone}><Icon size={13} aria-hidden /> {label}</Badge>;
};

const Avatar = ({ row, photos, renew }: Pick<RowProps, 'row' | 'photos' | 'renew'>) => {
  const path = row.staff.reference_photo_path;
  const photo = path ? photos[path] : undefined;
  return photo
    ? <img src={photo.url} alt="" loading="lazy" decoding="async" onError={() => renew('reference-photos', path!, photo)} className="h-10 w-10 shrink-0 rounded-full object-cover" />
    : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400"><UserRound size={18} aria-hidden /></span>;
};

const time = (iso: string | undefined, tz: string) => (iso ? localTime(iso, tz) : '–');
const hours = (r: DayRow) => (r.hoursWorked > 0 ? `${r.hoursWorked} h` : '–');

// Says which records ("In and out flagged", "Out to review"): a clock-out is a
// record too, so a bare "2 flagged" read like two clock-ins.
const ReviewBadges = ({ row }: { row: DayRow }) => {
  const flagged = whichRecords(row.events, (e) => e.flags.length > 0);
  const pending = whichRecords(row.events, (e) => e.review_status === 'pending');
  const rejected = whichRecords(row.events, (e) => e.review_status === 'rejected');
  return (
    <span className="flex flex-wrap gap-1">
      {flagged && <Badge tone="warning"><AlertTriangle size={13} aria-hidden /> {flagged} flagged</Badge>}
      {pending && <Badge>{pending} to review</Badge>}
      {rejected && <Badge tone="danger">{rejected} rejected</Badge>}
      {row.events.length > 0 && row.pending + row.rejected === 0 && <Badge tone="success"><CheckCircle size={13} aria-hidden /> Approved</Badge>}
    </span>
  );
};

const NameButton = ({ row, open, toggle }: Pick<RowProps, 'row' | 'open' | 'toggle'>) => (
  <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`day-${row.staff.id}`}
    className="flex min-h-11 min-w-0 items-center gap-1 text-left font-semibold text-gray-900 hover:text-brand-700 focus-visible:outline-3 focus-visible:outline-brand">
    <span className="truncate">{row.staff.full_name}</span>
    <ChevronDown size={16} className={`shrink-0 transition duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
  </button>
);

// Phones and tablets: one card per person.
const PersonCard = (p: RowProps) => {
  const { row, tz } = p;
  return (
    <>
      <div className="flex items-start gap-3 p-3">
        <Avatar {...p} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <NameButton {...p} />
            <StatusBadge status={row.status} />
          </div>
          <p className="text-xs text-gray-600">{row.staff.staff_code} · {row.staff.role}{row.site ? ` · ${row.site}` : ''}</p>
          {row.events.length > 0 && (
            <p className="mt-1 font-mono text-sm tabular-nums text-gray-800">
              In {time(row.firstIn?.captured_at, tz)} · Out {time(row.lastOut?.captured_at, tz)}{row.hoursWorked > 0 && ` · ${hours(row)}`}
            </p>
          )}
          <div className="mt-1.5"><ReviewBadges row={row} /></div>
        </div>
      </div>
      {p.open && <DayDetail {...p} />}
    </>
  );
};

// Laptops: a table row, with the day's clock-ins in a row below when opened.
const PersonRow = (p: RowProps) => {
  const { row, tz } = p;
  return (
    <tbody className="border-b border-gray-100 last:border-0">
      <tr className="align-middle">
        <th scope="row" className="px-4 py-2 font-normal">
          <div className="flex items-center gap-3">
            <Avatar {...p} />
            <div className="min-w-0">
              <NameButton {...p} />
              <p className="-mt-2 text-xs text-gray-600">{row.staff.staff_code} · {row.staff.role}</p>
            </div>
          </div>
        </th>
        <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
        <td className="px-4 py-2 text-gray-800">{row.site ?? '–'}</td>
        <td className="px-4 py-2 font-mono tabular-nums">{time(row.firstIn?.captured_at, tz)}</td>
        <td className="px-4 py-2 font-mono tabular-nums">{time(row.lastOut?.captured_at, tz)}</td>
        <td className="px-4 py-2 font-mono tabular-nums">{hours(row)}</td>
        <td className="px-4 py-2"><ReviewBadges row={row} /></td>
      </tr>
      {p.open && (
        <tr>
          <td colSpan={7} className="p-0"><DayDetail {...p} /></td>
        </tr>
      )}
    </tbody>
  );
};

// Every clock-in and clock-out of that person's day.
const DayDetail = ({ row, tz, day, photos, renew }: RowProps) => (
  <div id={`day-${row.staff.id}`} className="border-t border-gray-100 bg-gray-50 p-3">
    {row.events.length === 0 ? (
      <p className="text-sm text-gray-600">No clock-ins on this day.</p>
    ) : (
      <ol className="space-y-2" aria-label={`${row.staff.full_name}'s clock-ins`}>
        {row.events.map((e) => {
          const path = e.face_photo_path;
          const photo = path ? photos[path] : undefined;
          return (
            <li key={e.id} className="flex items-start gap-3 rounded-control bg-white p-2.5">
              {photo
                ? <img src={photo.url} alt={`Face photo, ${e.type === 'CLOCK_IN' ? 'clock-in' : 'clock-out'} at ${localTime(e.captured_at, tz)}`} loading="lazy" decoding="async"
                    onError={() => renew('event-photos', path!, photo)} className="h-14 w-11 shrink-0 rounded-md object-cover" />
                : <span className="h-14 w-11 shrink-0 rounded-md bg-gray-100" aria-hidden />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono font-semibold tabular-nums">{localTime(e.captured_at, tz)}</span>
                  <span className="font-semibold">{e.type === 'CLOCK_IN' ? 'Clock in' : 'Clock out'}</span>
                  {localDay(e.captured_at, tz) !== day && <span className="text-xs text-gray-600">(next day)</span>}
                </p>
                <p className="text-gray-600">
                  {e.site_name_snapshot ?? 'No site'}
                  {e.distance_m != null && ` · ${e.distance_m < 1000 ? `${Math.round(e.distance_m)} m` : `${(e.distance_m / 1000).toFixed(1)} km`} away`}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {e.flags.map((f) => <Badge key={f} tone="warning"><AlertTriangle size={13} aria-hidden /> {flagLabel(f)}</Badge>)}
                  <Badge tone={e.review_status === 'approved' ? 'success' : e.review_status === 'rejected' ? 'danger' : 'neutral'}>
                    {e.review_status === 'approved' ? 'Approved' : e.review_status === 'rejected' ? 'Rejected' : 'Needs review'}
                  </Badge>
                </div>
                {e.review_note && <p className="mt-1 text-gray-700">Note: {e.review_note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    )}
    {row.events.length > 0 && (
      <Link to={`/admin/review?day=${day}&staff=${row.staff.id}&status=all`} className={`${button.link} mt-1 text-sm`}>
        <ExternalLink size={15} aria-hidden /> Open in Review
      </Link>
    )}
  </div>
);
