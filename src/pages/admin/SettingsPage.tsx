import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { StaffContext } from '../../context/useStaff';
import { orSuspended } from '../../lib/support';

interface Settings {
  site_photo_required: boolean;
  geofence_mode: 'flag' | 'block';
  photo_retention_days: number;
}

// Organisation settings, saved through the audited update_org_settings() RPC.
export const SettingsPage = ({ context }: { context: StaffContext }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.from('organizations').select('site_photo_required, geofence_mode, photo_retention_days').eq('id', context.organization.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setSettings(data);
        else setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [context.organization.id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('update_org_settings', settings);
    setBusy(false);
    setMessage(error
      ? { kind: 'error', text: orSuspended(error, 'Could not save. Retention must be between 7 and 365 days.') }
      : { kind: 'ok', text: 'Saved. Workers’ phones pick up the change next time they connect.' });
  };

  if (loadError) return <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">Couldn&apos;t load settings. Check your connection and reload the page.</p>;
  if (!settings) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" aria-label="Loading settings" /></div>;

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-4 space-y-5 max-w-xl">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={settings.site_photo_required} className="mt-1 h-4 w-4"
          onChange={(e) => setSettings({ ...settings, site_photo_required: e.target.checked })} />
        <span>
          <span className="block font-medium text-gray-900">Require a site photo</span>
          <span className="block text-sm text-gray-600">Workers also photograph the site at every clock-in and clock-out.</span>
        </span>
      </label>

      <fieldset>
        <legend className="font-medium text-gray-900">Clock-ins away from the site</legend>
        <label className="mt-2 flex items-start gap-3">
          <input type="radio" name="geofence" checked={settings.geofence_mode === 'flag'} className="mt-1"
            onChange={() => setSettings({ ...settings, geofence_mode: 'flag' })} />
          <span className="text-sm text-gray-700"><strong>Allow and flag</strong>: the clock-in is saved and marked “Outside site” for review. Best when sites are remote or GPS is weak.</span>
        </label>
        <label className="mt-2 flex items-start gap-3">
          <input type="radio" name="geofence" checked={settings.geofence_mode === 'block'} className="mt-1"
            onChange={() => setSettings({ ...settings, geofence_mode: 'block' })} />
          <span className="text-sm text-gray-700"><strong>Block</strong>: when the phone has a good GPS fix outside the site radius, the clock-in is refused.</span>
        </label>
      </fieldset>

      <label className="block">
        <span className="block font-medium text-gray-900">Keep clock-in photos for (days)</span>
        <span className="block text-sm text-gray-600">After this, photos are deleted automatically. Times and places are kept.</span>
        <input type="number" min={7} max={365} required value={settings.photo_retention_days}
          onChange={(e) => setSettings({ ...settings, photo_retention_days: Number(e.target.value) })}
          className="mt-1 block w-32 min-h-11 rounded-lg border border-gray-300 py-2 px-2" />
      </label>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm rounded-lg p-3 ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{message.text}</p>
      )}
      <button type="submit" disabled={busy} className="min-h-11 px-5 rounded-lg bg-brand text-white font-medium disabled:opacity-60">
        {busy ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
};
