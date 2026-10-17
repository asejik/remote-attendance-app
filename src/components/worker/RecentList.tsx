import { AlertTriangle, Check, CloudOff, XCircle } from 'lucide-react';
import { flagLabel } from '../../lib/reports';
import { card } from '../classes';

export interface HistoryItem {
  id: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  at: string;
  site: string | null;
  flags: string[];
  state: 'pending' | 'synced' | 'failed';
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// Recent clock-ins as a ledger: times in one column, state in words and an icon.
export const RecentList = ({ items }: { items: HistoryItem[] }) => (
  <section aria-labelledby="history-title" className={card}>
    <h2 id="history-title" className="px-4 pb-2 pt-3.5 text-xs font-bold uppercase tracking-[0.08em] text-gray-600">Recent clock-ins</h2>
    {items.length === 0 ? (
      <p className="border-t border-gray-100 px-4 py-6 text-center text-sm text-gray-600">No clock-ins yet. Your first one will appear here.</p>
    ) : (
      <ul>
        {items.map((h) => (
          <li key={h.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 border-t border-gray-100 px-4 py-3">
            <span className="w-[3.75rem] shrink-0 font-mono text-base font-medium tabular-nums">{time(h.at)}</span>
            <span className="min-w-[8rem] flex-1">
              <span className="block font-semibold">{h.type === 'CLOCK_IN' ? 'Clock in' : 'Clock out'}</span>
              <span className="block text-sm text-gray-600">{day(h.at)} · {h.site ?? 'No site'}</span>
              {h.flags.length > 0 && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950">
                  <AlertTriangle size={12} aria-hidden /> {h.flags.map(flagLabel).join(', ')}
                </span>
              )}
            </span>
            <span className={`ml-auto flex items-center gap-1 whitespace-nowrap text-sm font-semibold ${h.state === 'failed' ? 'text-red-800' : h.state === 'pending' ? 'text-amber-900' : 'text-brand-700'}`}>
              {h.state === 'failed' ? <><XCircle size={15} aria-hidden /> Not accepted</>
                : h.state === 'pending' ? <><CloudOff size={15} aria-hidden /> Waiting</>
                : <><Check size={15} strokeWidth={2.5} aria-hidden /> Uploaded</>}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);
