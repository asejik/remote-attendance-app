import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { AlertTriangle, ArrowRight, Camera, CheckCircle, Clock, Cloud, CloudOff, HardDrive, History, Loader2, LogOut, MapPin, RefreshCw, XCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { queue, subscribeQueue, type EventType, type QueuedEvent } from '../lib/queue';
import { startAutoSync, syncPendingRecords } from '../lib/sync';
import { dataUrlToBlob, shrinkPhoto } from '../lib/image';
import { distanceM, outsideSite, type Fix } from '../lib/geo';
import { flagLabel } from '../lib/reports';
import { DIAGNOSTICS } from '../lib/buildFlags';
import { getStorageInfo } from '../lib/storage';
import { suspensionOf } from '../lib/support';
import type { StaffContext } from '../context/useStaff';

// The face camera (face-api.js + TensorFlow) is the largest part of the app;
// load it only when a clock-in starts. It is precached for offline use.
const LivenessCamera = lazy(() => import('../components/LivenessCamera').then((m) => ({ default: m.LivenessCamera })));

interface Site { id: string; name: string; latitude: number; longitude: number; radius_m: number }
interface OrgSettings { site_photo_required: boolean; geofence_mode: 'flag' | 'block' }
interface ServerEvent { id: string; type: EventType; captured_at: string; site_name_snapshot: string | null; flags: string[] }


// Small per-organisation cache so the screen works offline after one online visit.
const cacheKey = (orgId: string, what: string) => `v2:${orgId}:${what}`;
const readCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeCache = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache is a convenience.
  }
};

const getFix = async (): Promise<Fix | null> => {
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy };
  } catch (err) {
    console.error('GPS failed', err);
    return null;
  }
};

// Warn when browser storage (where queued photos wait on the web) is this full.
const STORAGE_LOW_RATIO = 0.8;

type Step = 'idle' | 'locating' | 'face' | 'site-instruction' | 'saving';

export const WorkerHomePage = ({ context }: { context: StaffContext }) => {
  const navigate = useNavigate();
  const { staff, organization } = context;
  const userId = staff.user_id!;

  const [sites, setSites] = useState<Site[]>(() => readCache<Site[]>(cacheKey(organization.id, 'sites')) ?? []);
  const [settings, setSettings] = useState<OrgSettings>(
    () => readCache<OrgSettings>(cacheKey(organization.id, 'settings')) ?? { site_photo_required: true, geofence_mode: 'flag' },
  );
  const [serverEvents, setServerEvents] = useState<ServerEvent[]>(() => readCache<ServerEvent[]>(cacheKey(staff.id, 'recent')) ?? []);
  const [local, setLocal] = useState<QueuedEvent[]>([]);
  const [siteId, setSiteId] = useState(() => readCache<string>(cacheKey(staff.id, 'site')) ?? '');
  const [step, setStep] = useState<Step>('idle');
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<{ fix: Fix | null; face: Blob; livenessPassed: boolean } | null>(null);
  const [fixForCapture, setFixForCapture] = useState<Fix | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [storageLow, setStorageLow] = useState(false);

  // Organisation settings, sites and the server's recent events (cached for offline).
  const refreshFromServer = useCallback(async () => {
    const [orgRes, sitesRes, eventsRes] = await Promise.all([
      supabase.from('organizations').select('site_photo_required, geofence_mode').eq('id', organization.id).maybeSingle(),
      supabase.from('work_sites').select('id, name, latitude, longitude, radius_m').order('name'),
      supabase.from('attendance_events').select('id, type, captured_at, site_name_snapshot, flags')
        .eq('staff_id', staff.id).order('captured_at', { ascending: false }).limit(5),
    ]);
    if (orgRes.data) {
      setSettings(orgRes.data);
      writeCache(cacheKey(organization.id, 'settings'), orgRes.data);
    }
    if (sitesRes.data) {
      setSites(sitesRes.data);
      writeCache(cacheKey(organization.id, 'sites'), sitesRes.data);
    }
    if (eventsRes.data) {
      setServerEvents(eventsRes.data);
      writeCache(cacheKey(staff.id, 'recent'), eventsRes.data);
    }
  }, [organization.id, staff.id]);

  useEffect(() => {
    let cancelled = false;
    const readQueue = () => queue.forUser(userId).then((events) => {
      if (!cancelled) setLocal(events);
    });
    // Web only: queued photos live in browser storage, which has a quota.
    const checkStorage = async () => {
      if (Capacitor.isNativePlatform()) return;
      const { usageBytes, quotaBytes } = await getStorageInfo();
      if (!cancelled) setStorageLow(!!usageBytes && !!quotaBytes && usageBytes / quotaBytes > STORAGE_LOW_RATIO);
    };
    checkStorage();
    readQueue();
    const unsubscribe = subscribeQueue(() => {
      readQueue();
      checkStorage();
    });
    const stopSync = startAutoSync();
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    refreshFromServer();
    return () => {
      cancelled = true;
      unsubscribe();
      stopSync();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [userId, refreshFromServer]);

  // History: this device's records plus the server's, newest first, no duplicates.
  const localIds = new Set(local.map((e) => e.id));
  const history = [
    ...local.map((e) => ({ id: e.id, type: e.type, at: e.capturedAt, site: e.siteName, flags: e.flags ?? [], state: e.status })),
    ...serverEvents.filter((e) => !localIds.has(e.id))
      .map((e) => ({ id: e.id, type: e.type, at: e.captured_at, site: e.site_name_snapshot, flags: e.flags, state: 'synced' as const })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  // A record the server refused doesn't count towards clocked in/out.
  const last = history.find((h) => h.state !== 'failed');
  const clockedIn = last?.type === 'CLOCK_IN';
  const waiting = local.filter((e) => e.status === 'pending');
  const failed = local.filter((e) => e.status === 'failed');
  const clockInsBlocked = suspensionOf(organization)?.clockInsBlocked ?? false;
  const site = sites.find((s) => s.id === siteId);

  const start = async () => {
    setMessage(null);
    if (!site) return setMessage({ kind: 'error', text: 'Choose the site you are at first.' });
    setStep('locating');
    const fix = await getFix();
    if (settings.geofence_mode === 'block' && fix && outsideSite(fix, site)) {
      setStep('idle');
      const metres = Math.round(distanceM(fix.latitude, fix.longitude, site.latitude, site.longitude));
      return setMessage({ kind: 'error', text: `You are about ${metres} m from ${site.name}. Clock-in is only allowed at the site.` });
    }
    setFixForCapture(fix);
    setStep('face');
  };

  const onFace = async (imageSrc: string, livenessPassed: boolean) => {
    const face = dataUrlToBlob(imageSrc);
    if (settings.site_photo_required) {
      setPending({ fix: fixForCapture, face, livenessPassed });
      setStep('site-instruction');
    } else {
      await save(fixForCapture, face, null, livenessPassed);
    }
  };

  const takeSitePhoto = async () => {
    if (!pending) return;
    try {
      const image = await CapacitorCamera.getPhoto({
        quality: 70, width: 1280, allowEditing: false, resultType: CameraResultType.Uri, source: CameraSource.Camera,
      });
      if (!image.webPath) throw new Error('No photo taken');
      const sitePhoto = await shrinkPhoto(await (await fetch(image.webPath)).blob());
      await save(pending.fix, pending.face, sitePhoto, pending.livenessPassed);
    } catch (err) {
      console.error(err);
      setStep('idle');
      setPending(null);
      setMessage({ kind: 'error', text: 'Site photo cancelled. Nothing was saved.' });
    }
  };

  const save = async (fix: Fix | null, face: Blob, sitePhoto: Blob | null, livenessPassed: boolean) => {
    setStep('saving');
    const type: EventType = clockedIn ? 'CLOCK_OUT' : 'CLOCK_IN';
    const id = crypto.randomUUID();
    try {
      await queue.add({
        id, userId, organizationId: organization.id, staffId: staff.id,
        siteId: site?.id ?? null, siteName: site?.name ?? null, type, capturedAt: new Date().toISOString(),
        latitude: fix?.latitude ?? null, longitude: fix?.longitude ?? null, accuracyM: fix ? Math.round(fix.accuracyM) : null,
        livenessPassed, hasFacePhoto: true, hasSitePhoto: sitePhoto !== null, status: 'pending', attempts: 0,
      }, { face, site: sitePhoto });
      writeCache(cacheKey(staff.id, 'site'), site?.id);
      setMessage({
        kind: 'ok',
        text: `${type === 'CLOCK_IN' ? 'Clocked in' : 'Clocked out'}${fix ? '' : ' (no GPS location)'}. ${navigator.onLine ? 'Uploading…' : 'Saved on this phone; it will upload when you are online.'}`,
      });
      if (navigator.onLine) {
        syncPendingRecords()
          .then(refreshFromServer)
          .then(async () => {
            const saved = (await queue.forUser(userId)).find((e) => e.id === id);
            const label = type === 'CLOCK_IN' ? 'Clocked in' : 'Clocked out';
            setMessage(saved?.status === 'synced'
              ? { kind: 'ok', text: `${label}. Uploaded.` }
              : { kind: 'ok', text: `${label}. Saved on this phone; the upload will be retried automatically.` });
          })
          .catch(() => undefined);
      }
    } catch (err) {
      console.error(err);
      setMessage({ kind: 'error', text: 'Could not save on this phone. Free some storage and try again.' });
    } finally {
      setStep('idle');
      setPending(null);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    await syncPendingRecords().catch(() => undefined);
    await refreshFromServer();
    setSyncing(false);
  };

  const retryFailed = async () => {
    for (const e of failed) await queue.retry(e.id);
    await syncNow();
  };

  const logOut = async () => {
    const unsent = waiting.length + failed.length;
    if (unsent && !window.confirm(`${unsent} record(s) haven't uploaded yet. They stay on this phone until you log in again. Log out?`)) return;
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {step === 'face' && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black flex items-center justify-center"><Loader2 className="animate-spin text-white" size={32} aria-label="Opening camera" /></div>}>
          <LivenessCamera onCapture={onFace} onCancel={() => setStep('idle')} />
        </Suspense>
      )}
      {step === 'site-instruction' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" role="dialog" aria-modal="true" aria-labelledby="site-photo-title">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <Camera className="mx-auto text-blue-600" size={36} aria-hidden />
            <h2 id="site-photo-title" className="text-xl font-bold text-gray-900">Now a photo of the site</h2>
            <p className="text-gray-600">Take a clear picture of where you are working, so your admin can see the site.</p>
            <button onClick={takeSitePhoto} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
              Open camera <ArrowRight size={20} aria-hidden />
            </button>
            <button onClick={() => { setStep('idle'); setPending(null); }} className="text-gray-500 text-sm underline">Cancel</button>
          </div>
        </div>
      )}

      <header className="bg-white border-b px-4 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{staff.full_name}</h1>
          <p className="text-xs text-gray-500">{organization.name} · {staff.staff_code}</p>
        </div>
        <button onClick={logOut} aria-label="Log out" className="p-2 text-gray-500 hover:text-red-600"><LogOut size={20} /></button>
      </header>

      <main className="p-4 max-w-md mx-auto flex flex-col items-center gap-5">
        {!online && (
          <p className="w-full text-sm bg-gray-800 text-white rounded-lg px-3 py-2 flex items-center gap-2" role="status">
            <CloudOff size={16} aria-hidden /> Offline. Clock-ins are saved on this phone.
          </p>
        )}

        <label className="w-full text-sm font-medium text-gray-700">
          Your site
          <div className="relative mt-1">
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
              className="block w-full appearance-none rounded-lg border border-gray-300 bg-white py-3 pl-3 pr-10 text-gray-900">
              <option value="">Choose site…</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <MapPin className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={16} aria-hidden />
          </div>
          {!sites.length && <span className="block mt-1 text-xs text-amber-700">No sites yet. Connect to the internet, or ask your admin to add your site.</span>}
        </label>

        {clockInsBlocked && (
          <p role="alert" className="w-full text-sm bg-red-50 border border-red-200 text-red-900 rounded-xl p-3">
            {organization.name}&apos;s account is suspended, so clock-ins are not being accepted. Please tell your admin.
          </p>
        )}

        {failed.length > 0 && (
          <div className="w-full bg-red-50 border border-red-200 rounded-xl p-3 space-y-2" role="alert">
            <p className="flex items-center gap-2 text-red-800 text-sm font-semibold">
              <XCircle size={18} aria-hidden /> {failed.length} record{failed.length > 1 ? 's' : ''} not accepted
            </p>
            <p className="text-sm text-red-800">{failed[0].failReason} Show this screen to your supervisor or admin.</p>
            <button onClick={retryFailed} disabled={syncing || !online} className="text-xs bg-red-100 text-red-900 px-3 py-1.5 rounded-full flex items-center gap-1 disabled:opacity-50">
              {syncing ? <Loader2 className="animate-spin" size={12} aria-hidden /> : <RefreshCw size={12} aria-hidden />} Try again
            </button>
          </div>
        )}

        {storageLow && (
          <p className="w-full text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 flex items-start gap-2" role="status">
            <HardDrive size={16} className="mt-0.5 shrink-0" aria-hidden /> Phone storage is nearly full. Connect to the internet so your records upload, and free up some space.
          </p>
        )}

        {waiting.length > 0 ? (
          <div className="w-full bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between" role="status">
            <span className="flex items-center gap-2 text-orange-800 text-sm font-semibold">
              <CloudOff size={18} aria-hidden /> {waiting.length} waiting to upload
            </span>
            <button onClick={syncNow} disabled={syncing || !online} className="text-xs bg-orange-100 text-orange-900 px-3 py-1.5 rounded-full flex items-center gap-1 disabled:opacity-50">
              {syncing ? <Loader2 className="animate-spin" size={12} aria-hidden /> : <RefreshCw size={12} aria-hidden />} Upload now
            </button>
          </div>
        ) : failed.length === 0 && (
          <p className="w-full bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-center gap-2 text-green-800 text-sm font-semibold" role="status">
            <Cloud size={16} aria-hidden /> All records uploaded
          </p>
        )}

        <div className={`w-full rounded-xl border p-5 text-center ${clockedIn ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
          <p className="text-sm text-gray-500">Current status</p>
          <p className={`text-3xl font-bold ${clockedIn ? 'text-green-700' : 'text-gray-800'}`}>{clockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}</p>
          {last && (
            <p className="mt-1 text-xs text-gray-500 flex items-center justify-center gap-1">
              <Clock size={12} aria-hidden /> {last.site ?? 'No site'} · {new Date(last.at).toLocaleString('en-NG', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>

        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'}
            className={`w-full text-sm rounded-lg p-3 ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
            {message.text}
          </p>
        )}

        <button onClick={start} disabled={step !== 'idle'}
          className={`flex flex-col items-center justify-center w-48 h-48 border-4 rounded-full shadow-lg active:scale-95 disabled:opacity-70 ${clockedIn ? 'bg-red-50 border-red-100' : 'bg-white border-blue-100'}`}>
          <span className={`p-4 rounded-full text-white mb-2 ${clockedIn ? 'bg-red-500' : 'bg-blue-600'}`}>
            {step === 'idle' ? <Camera size={40} aria-hidden /> : <Loader2 className="animate-spin" size={40} aria-hidden />}
          </span>
          <span className={`font-bold ${clockedIn ? 'text-red-700' : 'text-gray-800'}`}>
            {step === 'locating' ? 'Getting location…' : step === 'saving' ? 'Saving…' : clockedIn ? 'Tap to clock OUT' : 'Tap to clock IN'}
          </span>
        </button>

        <section className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden" aria-labelledby="history-title">
          <h2 id="history-title" className="bg-gray-50 px-4 py-3 border-b text-sm font-bold text-gray-700 flex items-center gap-2">
            <History size={16} aria-hidden /> Recent activity
          </h2>
          {history.length === 0 && <p className="px-4 py-6 text-sm text-gray-500 text-center">No clock-ins yet.</p>}
          <ul className="divide-y divide-gray-100">
            {history.slice(0, 5).map((h) => (
              <li key={h.id} className="px-4 py-3 flex justify-between items-start gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{h.type === 'CLOCK_IN' ? 'Clock in' : 'Clock out'} · {h.site ?? 'No site'}</p>
                  <p className="text-xs text-gray-500">{new Date(h.at).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  {h.flags.length > 0 && (
                    <p className="mt-1 text-xs text-amber-800 flex items-center gap-1">
                      <AlertTriangle size={12} aria-hidden /> {h.flags.map(flagLabel).join(', ')}
                    </p>
                  )}
                </div>
                <span className={`text-xs font-medium whitespace-nowrap flex items-center gap-1 ${h.state === 'failed' ? 'text-red-700' : h.state === 'pending' ? 'text-orange-700' : 'text-green-700'}`}>
                  {h.state === 'failed' ? <><XCircle size={12} aria-hidden /> Not accepted</>
                    : h.state === 'pending' ? <><CloudOff size={12} aria-hidden /> Waiting</>
                    : <><CheckCircle size={12} aria-hidden /> Uploaded</>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {DIAGNOSTICS && <Link to="/diagnostics" className="text-xs text-gray-400 underline pb-6">Device diagnostics</Link>}
      </main>
    </div>
  );
};
