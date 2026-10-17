import { Check, MapPin } from 'lucide-react';
import { field } from '../classes';

// Large tap targets instead of a dropdown: easier with gloves and a dusty
// screen. Real radio buttons underneath, so screen readers and keyboards work.
// Organisations with many sites get a dropdown, so the list never fills the screen.
const MAX_BUTTONS = 8;

interface SiteOption { id: string; name: string }

export const SitePicker = ({ sites, value, onChange }: { sites: SiteOption[]; value: string; onChange: (id: string) => void }) => {
  if (!sites.length) {
    return (
      <div>
        <p className="text-sm font-semibold text-gray-700">Your site</p>
        <p className="mt-1 text-sm text-amber-900">No sites yet. Connect to the internet, or ask your admin to add your site.</p>
      </div>
    );
  }
  if (sites.length > MAX_BUTTONS) {
    return (
      <label className="block text-sm font-semibold text-gray-700">
        Your site
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} text-base`}>
          <option value="">Choose site…</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
    );
  }
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-700">Your site</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {sites.map((s) => {
          const selected = s.id === value;
          return (
            <label key={s.id}
              className={`inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 px-4 font-semibold transition duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
                selected ? 'border-brand bg-brand text-white' : 'border-gray-300 bg-white text-gray-900 hover:border-gray-400'}`}>
              <input type="radio" name="site" value={s.id} checked={selected} onChange={() => onChange(s.id)} className="sr-only" />
              {selected ? <Check size={18} strokeWidth={3} aria-hidden /> : <MapPin size={18} className="text-brand" aria-hidden />}
              {s.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
