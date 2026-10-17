import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Loader2, LocateFixed, Map as MapIcon, MapPin, Pencil, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { mapLink } from '../../lib/adminEvents';
import type { StaffContext } from '../../context/useStaff';
import type { Database } from '../../lib/database.types';
import { useEscape } from '../../hooks/useEscape';
import { useLatestOnly } from '../../hooks/useLatestOnly';
import { useFocusOnMount } from '../../hooks/useFocusOnMount';
import { orSuspended } from '../../lib/support';

const SiteMap = lazy(() => import('../../components/SiteMap'));

type Site = Database['public']['Tables']['work_sites']['Row'];
interface Draft { id?: string; name: string; address: string; latitude: string; longitude: string; radius_m: number }

const EMPTY: Draft = { name: '', address: '', latitude: '', longitude: '', radius_m: 200 };
const inputClass = 'mt-1 block w-full min-h-11 rounded-lg border border-gray-300 py-2 px-2 text-sm';

const fetchSites = async () => {
  const { data, error } = await supabase.from('work_sites').select('*').order('active', { ascending: false }).order('name');
  return error ? null : data ?? [];
};

// Admins add and edit work sites. A location can be set three ways: tap on the
// map, use this device's current location, or type coordinates.
export const SitesPage = ({ context }: { context: StaffContext }) => {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const apply = useCallback((list: Site[] | null) => {
    if (list) setSites(list);
    setError(list ? '' : "Couldn't load sites. Check your connection and try again.");
  }, []);

  const latest = useLatestOnly();
  useEffect(() => {
    latest(fetchSites(), apply);
  }, [latest, apply]);

  const setActive = async (site: Site, active: boolean) => {
    if (!active && !window.confirm(`Deactivate ${site.name}? Workers will no longer see it. Past clock-ins keep the site name.`)) return;
    const { error: updateError } = await supabase.from('work_sites').update({ active }).eq('id', site.id);
    if (updateError) setError(orSuspended(updateError, 'Could not update the site. Please try again.'));
    await latest(fetchSites(), apply);
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setDraft(EMPTY)} className="min-h-11 flex items-center gap-2 px-4 rounded-lg bg-brand text-white text-sm font-medium">
        <Plus size={16} aria-hidden /> Add site
      </button>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      {!sites && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" aria-label="Loading sites" /></div>}
      {sites?.length === 0 && <p className="text-gray-500 text-center py-8">No sites yet. Add the places where your staff work.</p>}

      <ul className="grid sm:grid-cols-2 gap-3">
        {sites?.map((s) => (
          <li key={s.id} className={`bg-white rounded-xl border border-gray-200 p-4 ${s.active ? '' : 'opacity-60'}`}>
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 flex items-center gap-1.5"><MapPin size={16} className="text-brand shrink-0" aria-hidden /> {s.name}</p>
                {s.address && <p className="text-xs text-gray-500 truncate">{s.address}</p>}
                <p className="text-xs text-gray-500 mt-1">
                  Radius {s.radius_m} m · <a href={mapLink(s.latitude, s.longitude)} target="_blank" rel="noreferrer" className="underline">{s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}</a>
                  {!s.active && <span className="ml-1 font-semibold text-red-700">· inactive</span>}
                </p>
              </div>
              <button onClick={() => setDraft({ id: s.id, name: s.name, address: s.address ?? '', latitude: String(s.latitude), longitude: String(s.longitude), radius_m: s.radius_m })}
                aria-label={`Edit ${s.name}`} className="min-h-11 min-w-11 inline-flex items-center justify-center h-fit rounded-lg text-gray-600 hover:bg-gray-100"><Pencil size={16} /></button>
            </div>
            <button onClick={() => setActive(s, !s.active)} className="mt-1 min-h-11 text-sm underline text-gray-600">
              {s.active ? `Deactivate ${s.name}` : `Reactivate ${s.name}`}
            </button>
          </li>
        ))}
      </ul>

      {draft && (
        <SiteDialog
          draft={draft}
          orgId={context.organization.id}
          userId={context.staff.user_id!}
          onClose={() => setDraft(null)}
          onSaved={async () => {
            setDraft(null);
            await latest(fetchSites(), apply);
          }}
        />
      )}
    </div>
  );
};

const SiteDialog = ({ draft: initial, orgId, userId, onClose, onSaved }: {
  draft: Draft; orgId: string; userId: string; onClose: () => void; onSaved: () => Promise<void>;
}) => {
  const [draft, setDraft] = useState(initial);
  const [showMap, setShowMap] = useState(!initial.id);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  useEscape(onClose);
  const titleRef = useFocusOnMount<HTMLHeadingElement>();

  const lat = draft.latitude.trim() === '' ? null : Number(draft.latitude);
  const lng = draft.longitude.trim() === '' ? null : Number(draft.longitude);
  const validCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const useCurrentLocation = async () => {
    setLocating(true);
    setError('');
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000 });
      setDraft((d) => ({ ...d, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
      setInfo(`Location set (accurate to about ${Math.round(pos.coords.accuracy)} m). Stand at the centre of the site for best results.`);
    } catch {
      setError('Could not get your location. Allow location access, or set the site on the map or by typing coordinates.');
    } finally {
      setLocating(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (draft.name.trim().length < 2) return setError('Enter a site name.');
    if (!validCoords) return setError('Set the site location: tap the map, use your current location, or type valid coordinates.');
    if (draft.radius_m < 20 || draft.radius_m > 5000) return setError('Radius must be between 20 and 5000 metres.');
    setBusy(true);
    setError('');
    const fields = { name: draft.name.trim(), address: draft.address.trim() || null, latitude: lat!, longitude: lng!, radius_m: Math.round(draft.radius_m) };
    const { error: saveError } = draft.id
      ? await supabase.from('work_sites').update(fields).eq('id', draft.id)
      : await supabase.from('work_sites').insert({ ...fields, organization_id: orgId, active: true, created_by: userId });
    setBusy(false);
    if (saveError) return setError(orSuspended(saveError, 'Could not save the site. Please try again.'));
    await onSaved();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="site-dialog-title">
      <form onSubmit={save} className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[95vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 id="site-dialog-title" ref={titleRef} tabIndex={-1} className="text-lg font-bold text-gray-900 outline-none">{draft.id ? 'Edit site' : 'Add site'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 inline-flex items-center justify-center text-gray-500"><X size={20} /></button>
        </div>
        <label className="block text-sm font-medium text-gray-700">Site name
          <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-gray-700">Address or description (optional)
          <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className={inputClass} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Location</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={useCurrentLocation} disabled={locating} className="min-h-11 px-3 rounded-lg border text-sm flex items-center gap-1.5 disabled:opacity-60">
              {locating ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <LocateFixed size={14} aria-hidden />} Use my current location
            </button>
            <button type="button" onClick={() => setShowMap(!showMap)} className="min-h-11 px-3 rounded-lg border text-sm flex items-center gap-1.5">
              <MapIcon size={14} aria-hidden /> {showMap ? 'Hide map' : 'Pick on map'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-gray-700">Latitude
              <input inputMode="decimal" value={draft.latitude} onChange={(e) => setDraft({ ...draft, latitude: e.target.value })} placeholder="e.g. 11.8311" className={inputClass} />
            </label>
            <label className="text-sm text-gray-700">Longitude
              <input inputMode="decimal" value={draft.longitude} onChange={(e) => setDraft({ ...draft, longitude: e.target.value })} placeholder="e.g. 13.1510" className={inputClass} />
            </label>
          </div>
          {showMap && (
            <Suspense fallback={<div className="h-72 flex items-center justify-center bg-gray-100 rounded-lg"><Loader2 className="animate-spin text-gray-400" aria-label="Loading map" /></div>}>
              <SiteMap latitude={validCoords ? lat : null} longitude={validCoords ? lng : null} radiusM={draft.radius_m}
                onPick={(la, ln) => setDraft((d) => ({ ...d, latitude: String(la), longitude: String(ln) }))} />
              <p className="text-xs text-gray-500">Tap the map to place the site. The blue circle shows the radius.</p>
            </Suspense>
          )}
        </fieldset>

        <label className="block text-sm font-medium text-gray-700">Radius: {draft.radius_m} m
          <input type="range" min={20} max={2000} step={10} value={Math.min(draft.radius_m, 2000)} onChange={(e) => setDraft({ ...draft, radius_m: Number(e.target.value) })} className="mt-2 block w-full" />
          <span className="block text-xs text-gray-500 font-normal">Clock-ins further than this from the location are flagged (or blocked, if your settings say so). Remote sites with weak GPS need a bigger radius.</span>
        </label>

        {info && <p role="status" className="text-sm text-green-800 bg-green-50 rounded-lg p-3">{info}</p>}
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
        <button type="submit" disabled={busy} className="w-full py-3 rounded-lg bg-brand text-white font-medium disabled:opacity-60">
          {busy ? 'Saving…' : 'Save site'}
        </button>
      </form>
    </div>
  );
};
