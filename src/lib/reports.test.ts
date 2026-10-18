import { describe, expect, it } from 'vitest';
import {
  csvCell, dayOverview, dayRangeUtc, whichRecords, eventRows, localDay, shiftsOf, summarise, toCsv, EVENT_HEADER,
  type ReportEvent, type ReportStaff,
} from './reports';

const TZ = 'Africa/Lagos'; // UTC+1, no daylight saving

const staff: ReportStaff[] = [
  { id: 'a', full_name: 'Ada Worker', staff_code: 'W-0001', role: 'worker', status: 'active' },
  { id: 'b', full_name: 'Bayo Worker', staff_code: 'W-0002', role: 'worker', status: 'active' },
  { id: 'c', full_name: 'Chi Former', staff_code: 'W-0003', role: 'worker', status: 'deactivated' },
  { id: 'z', full_name: 'Zainab Admin', staff_code: 'ADM-01', role: 'admin', status: 'active' },
];

let n = 0;
const ev = (staff_id: string, type: ReportEvent['type'], captured_at: string, extra: Partial<ReportEvent> = {}): ReportEvent => ({
  id: `e${++n}`, staff_id, type, captured_at, site_name_snapshot: 'Site A', distance_m: 12.4, within_radius: true, accuracy_m: 9.6,
  flags: [], liveness_passed: true, review_status: 'pending', review_note: null, reviewed_at: null, ...extra,
});

describe('local days in the organisation time zone', () => {
  it('puts 23:30 UTC on the next Lagos day', () => {
    expect(localDay('2026-10-13T23:30:00Z', TZ)).toBe('2026-10-14');
    expect(localDay('2026-10-13T22:59:00Z', TZ)).toBe('2026-10-13');
  });

  it('turns a local date range into UTC bounds', () => {
    expect(dayRangeUtc('2026-10-14', '2026-10-14', TZ)).toEqual({ start: '2026-10-13T23:00:00.000Z', end: '2026-10-14T23:00:00.000Z' });
    expect(dayRangeUtc('2026-10-01', '2026-10-31', 'UTC')).toEqual({ start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z' });
  });

  it('handles a daylight-saving zone', () => {
    // London switches to GMT on 2026-10-25; midnight on the 26th is 00:00Z.
    expect(dayRangeUtc('2026-10-24', '2026-10-25', 'Europe/London')).toEqual({ start: '2026-10-23T23:00:00.000Z', end: '2026-10-26T00:00:00.000Z' });
  });
});

describe('summarise', () => {
  const events = [
    ev('a', 'CLOCK_IN', '2026-10-13T07:00:00Z'), ev('a', 'CLOCK_OUT', '2026-10-13T16:00:00Z'),
    ev('a', 'CLOCK_IN', '2026-10-14T07:05:00Z', { flags: ['outside_radius'] }), // no clock-out that day
    ev('b', 'CLOCK_IN', '2026-10-14T07:00:00Z', { review_status: 'rejected' }), ev('b', 'CLOCK_OUT', '2026-10-14T15:00:00Z'),
  ];

  it('counts days present, incomplete days, flags and rejections; excludes admins', () => {
    const rows = summarise(events, staff, TZ);
    expect(rows.map((r) => r.staff.id)).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({ daysPresent: 2, incompleteDays: 1, hoursWorked: 9, clockIns: 2, flagged: 1, rejected: 0 });
    expect(rows[1]).toMatchObject({ daysPresent: 1, incompleteDays: 0, hoursWorked: 8, clockIns: 1, flagged: 0, rejected: 1 });
    expect(rows[2]).toMatchObject({ daysPresent: 0, incompleteDays: 0 });
  });

  it('a night shift (22:30 to 06:15 Lagos) is one complete day, counted on the day it started', () => {
    const night = [ev('a', 'CLOCK_IN', '2026-10-14T21:30:00Z'), ev('a', 'CLOCK_OUT', '2026-10-15T05:15:00Z')];
    expect(summarise(night, staff, TZ)[0]).toMatchObject({ daysPresent: 1, incompleteDays: 0, hoursWorked: 7.8 });
    // Reporting only the 14th still finds the clock-out on the 15th (pages fetch 16 h past the range).
    expect(summarise(night, staff, TZ, { from: '2026-10-14', to: '2026-10-14' })[0]).toMatchObject({ daysPresent: 1, incompleteDays: 0 });
    // Reporting only the 15th: that shift belongs to the 14th, and its clock-out alone isn't a day present.
    expect(summarise(night, staff, TZ, { from: '2026-10-15', to: '2026-10-15' })[0]).toMatchObject({ daysPresent: 0, clockIns: 0 });
  });

  it('pairs each clock-in with the next clock-out within 16 hours', () => {
    const shifts = shiftsOf([
      ev('a', 'CLOCK_IN', '2026-10-13T07:00:00Z'), // forgot to clock out: a second clock-in follows
      ev('a', 'CLOCK_IN', '2026-10-14T07:00:00Z'), ev('a', 'CLOCK_OUT', '2026-10-14T15:00:00Z'),
      ev('a', 'CLOCK_OUT', '2026-10-14T15:05:00Z'), // stray duplicate clock-out: ignored
      ev('a', 'CLOCK_IN', '2026-10-15T07:00:00Z'), ev('a', 'CLOCK_OUT', '2026-10-16T07:00:00Z'), // 24 h later: not this shift's
    ]);
    expect(shifts.map((sh) => [sh.clockIn.captured_at.slice(0, 10), sh.clockOut?.captured_at.slice(0, 13) ?? null])).toEqual([
      ['2026-10-13', null], ['2026-10-14', '2026-10-14T15'], ['2026-10-15', null],
    ]);
  });
});

describe('dayOverview', () => {
  const at = (iso: string) => Date.parse(iso);

  it('one row per active worker: on site, absent; deactivated staff and admins left out', () => {
    const events = [ev('a', 'CLOCK_IN', '2026-10-14T07:00:00Z', { flags: ['low_accuracy'] }), ev('b', 'CLOCK_IN', '2026-10-13T07:00:00Z')];
    const rows = dayOverview(events, staff, '2026-10-14', TZ, at('2026-10-14T12:00:00Z'));
    expect(rows.map((r) => [r.staff.id, r.status])).toEqual([['a', 'on_site'], ['b', 'absent']]);
    expect(rows[0]).toMatchObject({ site: 'Site A', lastOut: null, hoursWorked: 0, flagged: 1, pending: 1 });
    expect(rows[0].firstIn?.captured_at).toBe('2026-10-14T07:00:00Z');
    expect(rows[1].events).toEqual([]); // the 13th's clock-in isn't the 14th's
  });

  it('an open clock-in becomes "no clock-out" once it is too old to close', () => {
    const events = [ev('a', 'CLOCK_IN', '2026-10-14T07:00:00Z')];
    expect(dayOverview(events, staff, '2026-10-14', TZ, at('2026-10-15T08:00:00Z'))[0].status).toBe('no_clock_out');
  });

  it('first in, last out and hours over several shifts in a day', () => {
    const events = [
      ev('a', 'CLOCK_IN', '2026-10-14T07:00:00Z'), ev('a', 'CLOCK_OUT', '2026-10-14T11:00:00Z', { review_status: 'rejected' }),
      ev('a', 'CLOCK_IN', '2026-10-14T12:00:00Z'), ev('a', 'CLOCK_OUT', '2026-10-14T16:30:00Z'),
    ];
    const [row] = dayOverview(events, staff, '2026-10-14', TZ, at('2026-10-14T18:00:00Z'));
    expect(row).toMatchObject({ status: 'clocked_out', hoursWorked: 8.5, rejected: 1, pending: 3 });
    expect([row.firstIn?.captured_at, row.lastOut?.captured_at]).toEqual(['2026-10-14T07:00:00Z', '2026-10-14T16:30:00Z']);
    expect(row.events).toHaveLength(4);
  });

  it('a night shift clocked out after midnight is complete, on the day it started', () => {
    const events = [ev('a', 'CLOCK_IN', '2026-10-14T21:30:00Z'), ev('a', 'CLOCK_OUT', '2026-10-15T05:15:00Z'), ev('b', 'CLOCK_IN', '2026-10-14T21:00:00Z')];
    const rows = dayOverview(events, staff, '2026-10-14', TZ, at('2026-10-16T12:00:00Z'));
    expect(rows.map((r) => r.status)).toEqual(['clocked_out', 'no_clock_out']);
    expect(rows[0]).toMatchObject({ hoursWorked: 7.8 });
    expect(rows[0].events).toHaveLength(2); // the clock-out after midnight belongs to this day
    // On the 15th that clock-out belongs to the 14th, so it isn't shown again; a stray clock-out is.
    const stray = ev('b', 'CLOCK_OUT', '2026-10-15T16:00:00Z'); // 19 h after b's clock-in: closes nothing
    const next = dayOverview([...events, stray], staff, '2026-10-15', TZ, at('2026-10-16T12:00:00Z'));
    expect(next.map((r) => r.status)).toEqual(['absent', 'absent']);
    expect(next.map((r) => r.events.length)).toEqual([0, 1]);
  });
});

describe('CSV', () => {
  it('neutralises spreadsheet formulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+2348012345678')).toBe("'+2348012345678");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5'); // real numbers stay numbers
  });

  it('quotes commas, quotes and line breaks; leaves empty cells empty', () => {
    expect(csvCell('Site, North')).toBe('"Site, North"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('');
  });

  it('produces a BOM-prefixed CRLF file with one row per event in time order', () => {
    const events = [ev('b', 'CLOCK_OUT', '2026-10-14T15:00:00Z'), ev('a', 'CLOCK_IN', '2026-10-14T07:00:00Z', { flags: ['low_accuracy', 'outside_radius'] })];
    const csv = toCsv(EVENT_HEADER, eventRows(events, staff, TZ));
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(csv.startsWith('﻿Date,Time,Worker')).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2026-10-14,08:00,Ada Worker,W-0001,Clock in,Site A,12,Yes,10,Weak GPS; Outside site,Yes,pending,,');
    expect(lines[2].startsWith('2026-10-14,16:00,Bayo Worker')).toBe(true);
  });
});

describe('whichRecords', () => {
  const flagged = (e: ReportEvent) => e.flags.length > 0;
  const inn = ev('a', 'CLOCK_IN', '2026-10-14T07:00:00Z', { flags: ['outside_radius'] });
  const out = ev('a', 'CLOCK_OUT', '2026-10-14T15:00:00Z', { flags: ['outside_radius'] });
  const clean = (e: ReportEvent) => ({ ...e, flags: [] });

  it('names the in and out records on a one-shift day', () => {
    expect(whichRecords([inn, out], flagged)).toBe('In and out');
    expect(whichRecords([inn, clean(out)], flagged)).toBe('In');
    expect(whichRecords([clean(inn), out], flagged)).toBe('Out');
    expect(whichRecords([clean(inn), clean(out)], flagged)).toBeNull();
  });

  it('counts when there are several shifts in the day', () => {
    const later = ev('a', 'CLOCK_IN', '2026-10-14T16:00:00Z');
    expect(whichRecords([inn, out, later], flagged)).toBe('2 of 3');
  });
});
