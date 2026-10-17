import { useEffect, useState } from 'react';
import { fetchEventsForReport, fetchStaffForReport } from '../../lib/adminEvents';
import { absentees, dayRangeUtc, localDay, MAX_SHIFT_MS, type ReportStaff } from '../../lib/reports';
import type { StaffContext } from '../../context/useStaff';
import { PageHeader, Spinner } from '../../components/ui';

// Who did not clock in on a given day, and who clocked in but never out.
export const AbsentPage = ({ context }: { context: StaffContext }) => {
  const tz = context.organization.timezone;
  const today = localDay(new Date().toISOString(), tz);
  const [day, setDay] = useState(today);
  const [result, setResult] = useState<{ day: string; noClockIn: ReportStaff[]; noClockOut: ReportStaff[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const { start, end } = dayRangeUtc(day, day, tz);
    // A little past the day, so night shifts' clock-outs after midnight count.
    const after = new Date(Date.parse(end) + MAX_SHIFT_MS).toISOString();
    Promise.all([fetchEventsForReport(start, after), fetchStaffForReport()])
      .then(([events, staff]) => {
        if (!cancelled) {
          setResult({ day, ...absentees(events, staff, day, tz) });
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load attendance. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [day, tz]);

  const loading = !error && result?.day !== day;

  return (
    <div className="space-y-5">
      <PageHeader title="Absent" subtitle="Who didn't clock in on a day, and who clocked in but never out." />
      <label className="block max-w-xs text-sm font-medium text-gray-700">Day
        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)}
          className="mt-1 block w-full min-h-11 rounded-control border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25 text-sm" />
      </label>
      {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {loading && <Spinner label="Loading" />}
      {!loading && result && (
        <div className="grid sm:grid-cols-2 gap-4">
          <PeopleList title="Did not clock in" people={result.noClockIn} empty="Everyone clocked in." tone="red" />
          <PeopleList title="Clocked in, never clocked out" people={result.noClockOut} empty="No open clock-ins." tone="amber" />
        </div>
      )}
    </div>
  );
};

const PeopleList = ({ title, people, empty, tone }: { title: string; people: ReportStaff[]; empty: string; tone: 'red' | 'amber' }) => (
  <section className="bg-white rounded-card border border-gray-200 overflow-hidden" aria-label={title}>
    <h2 className={`px-4 py-3 border-b text-sm font-bold ${tone === 'red' ? 'text-red-800 bg-red-50' : 'text-amber-900 bg-amber-50'}`}>
      {title} ({people.length})
    </h2>
    {people.length === 0 ? <p className="px-4 py-6 text-sm text-gray-500">{empty}</p> : (
      <ul className="divide-y divide-gray-100">
        {people.map((p) => (
          <li key={p.id} className="px-4 py-2.5 text-sm flex justify-between">
            <span className="font-medium text-gray-900">{p.full_name}</span>
            <span className="text-gray-500">{p.staff_code} · {p.role}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
);
