import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { fetchEventsForReport, fetchStaffForReport } from '../../lib/adminEvents';
import { downloadCsv, downloadXlsx } from '../../lib/download';
import { dayRangeUtc, EVENT_HEADER, eventRows, localDay, MAX_SHIFT_MS, summarise, summaryRows, SUMMARY_HEADER } from '../../lib/reports';
import type { StaffContext } from '../../context/useStaff';

// Download attendance for a date range as CSV (two files) or one Excel workbook.
export const ReportsPage = ({ context }: { context: StaffContext }) => {
  const tz = context.organization.timezone;
  const today = localDay(new Date().toISOString(), tz);
  const monthStart = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const build = async () => {
    const [a, b] = from <= to ? [from, to] : [to, from];
    const { start, end } = dayRangeUtc(a, b, tz);
    // Fetch a little past the range so night shifts started on the last day find their clock-out.
    const [fetched, staff] = await Promise.all([fetchEventsForReport(start, new Date(Date.parse(end) + MAX_SHIFT_MS).toISOString()), fetchStaffForReport()]);
    const events = fetched.filter((e) => Date.parse(e.captured_at) < Date.parse(end));
    return {
      name: `attendance_${context.organization.slug}_${a}_to_${b}`, events,
      rows: eventRows(events, staff, tz), summary: summaryRows(summarise(fetched, staff, tz, { from: a, to: b })),
    };
  };

  const run = async (format: 'csv' | 'xlsx') => {
    setBusy(format);
    setMessage(null);
    try {
      const report = await build();
      if (format === 'csv') {
        downloadCsv(`${report.name}_clock-ins.csv`, EVENT_HEADER, report.rows);
        downloadCsv(`${report.name}_summary.csv`, SUMMARY_HEADER, report.summary);
      } else {
        await downloadXlsx(`${report.name}.xlsx`, report.rows, report.summary);
      }
      setMessage({ kind: 'ok', text: `Downloaded ${report.events.length} clock-in${report.events.length === 1 ? '' : 's'}.` });
    } catch {
      setMessage({ kind: 'error', text: "Couldn't build the report. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-gray-700">From
            <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full min-h-11 rounded-lg border border-gray-300 py-2 px-2 text-sm" />
          </label>
          <label className="text-sm font-medium text-gray-700">To
            <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full min-h-11 rounded-lg border border-gray-300 py-2 px-2 text-sm" />
          </label>
        </div>
        <p className="text-sm text-gray-600">
          You get every clock-in (one per row) and a per-worker summary: days present, days without a clock-out, flagged and rejected clock-ins.
          Times are in {tz.replace('_', ' ')} time.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run('xlsx')} disabled={busy !== null} className="min-h-11 px-4 rounded-lg bg-green-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60">
            {busy === 'xlsx' ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Download size={16} aria-hidden />} Download Excel (.xlsx)
          </button>
          <button onClick={() => run('csv')} disabled={busy !== null} className="min-h-11 px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium flex items-center gap-2 disabled:opacity-60">
            {busy === 'csv' ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Download size={16} aria-hidden />} Download CSV (2 files)
          </button>
        </div>
      </div>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm rounded-lg p-3 ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};
