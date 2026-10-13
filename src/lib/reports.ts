// Pure report logic for the admin screens: organisation-local days, per-worker
// summaries, the absent list, and spreadsheet-safe CSV. No I/O here.

export interface ReportEvent {
  id: string;
  staff_id: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  captured_at: string;
  site_name_snapshot: string | null;
  distance_m: number | null;
  within_radius: boolean | null;
  accuracy_m: number | null;
  flags: string[];
  liveness_passed: boolean;
  review_status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  reviewed_at: string | null;
}

export interface ReportStaff {
  id: string;
  full_name: string;
  staff_code: string;
  role: 'admin' | 'supervisor' | 'worker';
  status: 'active' | 'deactivated';
}

const FLAG_LABELS: Record<string, string> = {
  outside_radius: 'Outside site',
  low_accuracy: 'Weak GPS',
  time_skew: 'Phone time wrong',
  no_location: 'No location',
  liveness_failed: 'No smile check',
  no_site_photo: 'No site photo',
  no_face_photo: 'No face photo',
  no_site: 'No site',
};
export const flagLabel = (flag: string) => FLAG_LABELS[flag] ?? flag;

// Calendar day (YYYY-MM-DD) of an instant in the organisation's time zone.
export const localDay = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export const localTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// Offset (ms) of `timeZone` from UTC at the given instant.
const zoneOffsetMs = (utcMs: number, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
};

// UTC instant at which local midnight of `day` occurs in `timeZone`.
const localMidnightUtc = (day: string, timeZone: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - zoneOffsetMs(guess - zoneOffsetMs(guess, timeZone), timeZone);
};

// [start, end) in UTC ISO strings covering local days `from`..`to` inclusive.
export const dayRangeUtc = (from: string, to: string, timeZone: string) => {
  const [y, m, d] = to.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: new Date(localMidnightUtc(from, timeZone)).toISOString(), end: new Date(localMidnightUtc(next, timeZone)).toISOString() };
};

const byTime = (a: ReportEvent, b: ReportEvent) => a.captured_at.localeCompare(b.captured_at);

// A day is incomplete when the worker's last event that day is a clock-in.
const dayStatus = (events: ReportEvent[], timeZone: string) => {
  const days = new Map<string, ReportEvent[]>();
  for (const e of [...events].sort(byTime)) {
    const day = localDay(e.captured_at, timeZone);
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  return [...days.entries()].map(([day, list]) => ({
    day,
    present: list.some((e) => e.type === 'CLOCK_IN'),
    incomplete: list[list.length - 1].type === 'CLOCK_IN',
  }));
};

export interface WorkerSummary {
  staff: ReportStaff;
  daysPresent: number;
  incompleteDays: number;
  clockIns: number;
  flagged: number;
  rejected: number;
}

export const summarise = (events: ReportEvent[], staff: ReportStaff[], timeZone: string): WorkerSummary[] =>
  staff
    .filter((s) => s.role !== 'admin')
    .map((s) => {
      const mine = events.filter((e) => e.staff_id === s.id);
      const days = dayStatus(mine, timeZone);
      return {
        staff: s,
        daysPresent: days.filter((d) => d.present).length,
        incompleteDays: days.filter((d) => d.incomplete).length,
        clockIns: mine.filter((e) => e.type === 'CLOCK_IN').length,
        flagged: mine.filter((e) => e.flags.length > 0).length,
        rejected: mine.filter((e) => e.review_status === 'rejected').length,
      };
    })
    .sort((a, b) => a.staff.full_name.localeCompare(b.staff.full_name));

// For one local day: active non-admin staff with no clock-in, and those whose
// last event of the day is a clock-in (never clocked out).
export const absentees = (events: ReportEvent[], staff: ReportStaff[], day: string, timeZone: string) => {
  const today = events.filter((e) => localDay(e.captured_at, timeZone) === day);
  const people = staff.filter((s) => s.status === 'active' && s.role !== 'admin');
  const noClockIn = people.filter((s) => !today.some((e) => e.staff_id === s.id && e.type === 'CLOCK_IN'));
  const noClockOut = people.filter((s) => {
    const mine = today.filter((e) => e.staff_id === s.id).sort(byTime);
    return mine.length > 0 && mine[mine.length - 1].type === 'CLOCK_IN';
  });
  return { noClockIn, noClockOut };
};

// ---- Spreadsheet output ----

type Cell = string | number | boolean | null;

export const EVENT_HEADER = [
  'Date', 'Time', 'Worker', 'Staff code', 'Type', 'Site', 'Distance from site (m)', 'Inside site radius',
  'GPS accuracy (m)', 'Flags', 'Smile check passed', 'Review status', 'Review note', 'Reviewed at',
];

export const eventRows = (events: ReportEvent[], staff: ReportStaff[], timeZone: string): Cell[][] => {
  const people = new Map(staff.map((s) => [s.id, s]));
  return [...events].sort(byTime).map((e) => [
    localDay(e.captured_at, timeZone),
    localTime(e.captured_at, timeZone),
    people.get(e.staff_id)?.full_name ?? 'Unknown',
    people.get(e.staff_id)?.staff_code ?? '',
    e.type === 'CLOCK_IN' ? 'Clock in' : 'Clock out',
    e.site_name_snapshot,
    e.distance_m === null ? null : Math.round(e.distance_m),
    e.within_radius === null ? null : e.within_radius ? 'Yes' : 'No',
    e.accuracy_m === null ? null : Math.round(e.accuracy_m),
    e.flags.map(flagLabel).join('; '),
    e.liveness_passed ? 'Yes' : 'No',
    e.review_status,
    e.review_note,
    e.reviewed_at ? `${localDay(e.reviewed_at, timeZone)} ${localTime(e.reviewed_at, timeZone)}` : null,
  ]);
};

export const SUMMARY_HEADER = ['Worker', 'Staff code', 'Role', 'Status', 'Days present', 'Days without clock-out', 'Clock-ins', 'Flagged', 'Rejected'];

export const summaryRows = (summaries: WorkerSummary[]): Cell[][] =>
  summaries.map((s) => [
    s.staff.full_name, s.staff.staff_code, s.staff.role, s.staff.status, s.daysPresent, s.incompleteDays, s.clockIns, s.flagged, s.rejected,
  ]);

// CSV cell: neutralise spreadsheet formulas (CSV/formula injection), then quote
// when needed. Text starting with = + - @ tab or CR gets a leading apostrophe.
export const csvCell = (value: Cell) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// UTF-8 BOM so Excel reads names with accents correctly; CRLF line endings.
export const toCsv = (header: string[], rows: Cell[][]) =>
  '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
