import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CloudCheck, CloudOff, Loader2, LogOut, MapPin, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { queue, subscribeQueue, type EventType, type QueuedEvent } from '../lib/queue';
import { startAutoSync, syncPendingRecords } from '../lib/sync';
import { dataUrlToBlob, shrinkPhoto } from '../lib/image';
import { distanceM, outsideSite, type Fix } from '../lib/geo';
import { DIAGNOSTICS } from '../lib/buildFlags';
import { getStorageInfo } from '../lib/storage';
import { SUPPORT_EMAIL, suspensionOf } from '../lib/support';
import type { StaffContext } from '../context/useStaff';
import { signOut } from '../lib/signOut';
import { timeAgo } from '../lib/time';
import { Alert, LogoMark } from '../components/ui';
import { button, eyebrow } from '../components/classes';
import { ClockSteps, StepRing } from '../components/worker/ClockSteps';
import { SitePicker } from '../components/worker/SitePicker';
import { RecentList, type HistoryItem } from '../components/worker/RecentList';
import { ProofSlip, type Slip } from '../components/worker/ProofSlip';

// The face camera (face-api.js + TensorFlow) is the largest part of the app;
// load it only when a clock-in starts. It is precached for offline use.
const LivenessCamera = lazy(() => import('../components/LivenessCamera').then((m) => ({ default: m.LivenessCamera })));

type Tables = Database['public']['Tables'];
type Site = Pick<Tables['work_sites']['Row'], 'id' | 'name' | 'latitude' | 'longitude' | 'radius_m'>;
type OrgSettings = Pick<Tables['organizations']['Row'], 'site_photo_required' | 'geofence_mode'>;
type ServerEvent = Pick<Tables['attendance_events']['Row'], 'id' | 'type' | 'captured_at' | 'site_name_snapshot' | 'flags'>;


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
// Errors, or the clock-in just saved (its text follows the record's upload state).
type Message = { kind: 'error'; text: string } | { kind: 'saved'; id: string; label: string; noGps: boolean };

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
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState<{ fix: Fix | null; face: Blob; livenessPassed: boolean } | null>(null);
  const [fixForCapture, setFixForCapture] = useState<Fix | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [storageLow, setStorageLow] = useState(false);
  const [slip, setSlip] = useState<Slip | null>(null);

  // Organisation settings, sites and the server's recent events (cached for offline).
  const loadFromServer = useCallback(() => Promise.all([
      supabase.from('organizations').select('site_photo_required, geofence_mode').eq('id', organization.id).maybeSingle(),
      supabase.from('work_sites').select('id, name, latitude, longitude, radius_m').order('name'),
      supabase.from('attendance_events').select('id, type, captured_at, site_name_snapshot, flags')
        .eq('staff_id', staff.id).order('captured_at', { ascending: false }).limit(5),
  ]), [organization.id, staff.id]);
  const applyFromServer = useCallback(([orgRes, sitesRes, eventsRes]: Awaited<ReturnType<typeof loadFromServer>>) => {
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
  const refreshFromServer = useCallback(async () => applyFromServer(await loadFromServer()), [loadFromServer, applyFromServer]);

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
    loadFromServer().then((result) => {
      if (!cancelled) applyFromServer(result);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      stopSync();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [userId, loadFromServer, applyFromServer]);

  // History: this device's records plus the server's, newest first, no duplicates.
  const localIds = new Set(local.map((e) => e.id));
  const history: HistoryItem[] = [
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
  const oldestWaiting = waiting.reduce<string | null>((oldest, e) => (!oldest || e.capturedAt < oldest ? e.capturedAt : oldest), null);
  const saved = message?.kind === 'saved' ? local.find((e) => e.id === message.id) : undefined;
  const messageText = message?.kind === 'error' ? message.text : message && `${message.label}${message.noGps ? ' (no GPS location)' : ''}. ${
    saved?.status === 'synced' ? 'Uploaded.'
      : saved?.status === 'failed' ? 'It was not accepted; see above.'
      : online ? 'Uploading…' : 'Saved on this phone; it will upload when you are online.'}`;
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
      setMessage({ kind: 'saved', id, label: type === 'CLOCK_IN' ? 'Clocked in' : 'Clocked out', noGps: !fix });
      setSlip({
        id, type, at: new Date().toISOString(), siteName: site?.name ?? null,
        distanceM: fix && site ? distanceM(fix.latitude, fix.longitude, site.latitude, site.longitude) : null,
        radiusM: site?.radius_m ?? null, accuracyM: fix?.accuracyM ?? null, livenessPassed,
        workerName: staff.full_name, staffCode: staff.staff_code,
        facePhotoUrl: URL.createObjectURL(face), sitePhotoUrl: sitePhoto ? URL.createObjectURL(sitePhoto) : null,
      });
      if (navigator.onLine) syncPendingRecords().then(refreshFromServer).catch(() => undefined);
    } catch (err) {
      console.error(err);
      setMessage({ kind: 'error', text: 'Could not save on this phone. Free some storage and try again.' });
    } finally {
      setStep('idle');
      setPending(null);
    }
  };

  const closeSlip = () => {
    if (slip) {
      URL.revokeObjectURL(slip.facePhotoUrl);
      if (slip.sitePhotoUrl) URL.revokeObjectURL(slip.sitePhotoUrl);
    }
    setSlip(null);
    setMessage(null);
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
    if (await signOut()) return;
    navigate('/', { replace: true });
  };

  const steps = settings.site_photo_required;
  const stepCount = steps ? 3 : 2;
  const savedUpload = saved?.status ?? 'pending';
  const lastTime = last ? new Date(last.at) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {step === 'face' && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black flex items-center justify-center"><Loader2 className="animate-spin text-white" size={32} aria-label="Opening camera" /></div>}>
          <LivenessCamera onCapture={onFace} onCancel={() => setStep('idle')} stepLabel={`Step 2 of ${stepCount} · Face photo`} />
        </Suspense>
      )}
      {(step === 'locating' || step === 'saving') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50/95 px-5" role="dialog" aria-modal="true" aria-labelledby="busy-title">
          <div className="w-full max-w-sm space-y-6 text-center">
            {step === 'locating' && <ClockSteps current={0} withSitePhoto={steps} />}
            <div className="flex justify-center">
              <StepRing current={step === 'locating' ? 0 : stepCount} withSitePhoto={steps}>
                {step === 'locating' ? <MapPin size={40} className="text-brand" aria-hidden /> : <Loader2 size={40} className="animate-spin text-brand" aria-hidden />}
              </StepRing>
            </div>
            <div>
              <h2 id="busy-title" className="font-display text-2xl font-extrabold">{step === 'locating' ? 'Getting your location…' : 'Saving on this phone…'}</h2>
              {step === 'locating' && <p className="mt-1 text-gray-600">Stay outdoors or near a window. This takes up to 20 seconds.</p>}
            </div>
          </div>
        </div>
      )}
      {step === 'site-instruction' && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50 px-5 py-6" role="dialog" aria-modal="true" aria-labelledby="site-photo-title">
          <div className="mx-auto flex min-h-full max-w-sm flex-col gap-6">
            <ClockSteps current={2} withSitePhoto />
            <div className="flex justify-center">
              <StepRing current={2} withSitePhoto><Camera size={40} className="text-brand" aria-hidden /></StepRing>
            </div>
            <div className="text-center">
              <h2 id="site-photo-title" className="font-display text-3xl font-extrabold">Photo of the site</h2>
              <p className="mt-1 text-gray-600">Point the camera at where you are working, so your admin can see the site.</p>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <button autoFocus onClick={takeSitePhoto} className={`${button.primary} min-h-14 font-display text-xl`}>
                <Camera size={22} aria-hidden /> Open camera
              </button>
              <button onClick={() => { setStep('idle'); setPending(null); }} className={button.link}>Cancel · nothing is saved yet</button>
            </div>
          </div>
        </div>
      )}
      {slip && <ProofSlip slip={slip} upload={savedUpload} statusText={messageText ?? ''} onDone={closeSlip} />}

      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <LogoMark size={36} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-bold leading-tight">{staff.full_name}</h1>
            <p className="truncate text-sm text-gray-600"><span className="font-mono">{staff.staff_code}</span> · {organization.name}</p>
          </div>
          <button onClick={logOut} aria-label="Log out" className={`${button.icon} border border-gray-200`}><LogOut size={20} aria-hidden /></button>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-5 p-4">
        {!online && <Alert tone="info">Offline. Clock-ins are saved on this phone.</Alert>}
        {clockInsBlocked && <Alert tone="error">{organization.name}&apos;s account is suspended, so clock-ins are not being accepted. Please tell your admin.</Alert>}
        {failed.length > 0 && (
          <Alert tone="error">
            <p className="font-semibold">{failed.length} record{failed.length > 1 ? 's' : ''} not accepted</p>
            <p>{failed[0].failReason} Show this screen to your supervisor or admin.</p>
            <button onClick={retryFailed} disabled={syncing || !online} className={`${button.secondary} mt-2 min-h-11 border-red-300 text-red-900`}>
              {syncing ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <RefreshCw size={16} aria-hidden />} Try again
            </button>
          </Alert>
        )}
        {storageLow && <Alert tone="warning">Phone storage is nearly full. Connect to the internet so your records upload, and free up some space.</Alert>}

        {waiting.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-amber-200 bg-amber-50 p-3" role="status">
            <div className="min-w-[10rem] flex-1">
              <p className="flex items-center gap-2 font-semibold text-amber-950"><CloudOff size={18} aria-hidden /> {waiting.length} waiting to upload</p>
              {oldestWaiting && <p className="mt-0.5 text-sm text-amber-950">Oldest: {timeAgo(oldestWaiting)} ago</p>}
            </div>
            <button onClick={syncNow} disabled={syncing || !online} className={`${button.secondary} shrink-0 border-amber-300 px-4`}>
              {syncing ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <RefreshCw size={16} aria-hidden />} Upload now
            </button>
          </div>
        ) : failed.length === 0 && (
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700" role="status">
            <CloudCheck size={20} aria-hidden /> All records uploaded
          </p>
        )}

        <section aria-label="Current status">
          <p className={eyebrow}>You are</p>
          <p className="font-display text-[min(2.75rem,11vw)] font-extrabold leading-none tracking-tight">{clockedIn ? 'Clocked in' : 'Clocked out'}</p>
          <p className="mt-1 text-gray-600">
            {lastTime
              ? <>since {lastTime.toLocaleDateString('en-GB', { weekday: 'short' })} <span className="font-mono tabular-nums">{lastTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>{last?.site ? ` at ${last.site}` : ''}</>
              : 'No clock-ins yet'}
          </p>
        </section>

        <SitePicker sites={sites} value={siteId} onChange={setSiteId} />

        {message?.kind === 'error' && <Alert tone="error">{message.text}</Alert>}

        <button onClick={start} disabled={step !== 'idle' || clockInsBlocked}
          className={`flex min-h-20 w-full items-center gap-4 rounded-[1.125rem] px-5 text-left text-white shadow-raised transition duration-150 ease-out-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand ${clockedIn ? 'bg-gray-900 hover:bg-gray-800' : 'bg-brand hover:bg-brand-700'}`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-white/15">
            {step === 'idle' ? <Camera size={26} aria-hidden /> : <Loader2 className="animate-spin" size={26} aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-[min(1.65rem,8vw)] font-extrabold leading-tight">
              {clockInsBlocked ? 'Clock-ins paused' : step === 'locating' ? 'Getting location…' : step === 'saving' ? 'Saving…' : clockedIn ? 'Clock out' : 'Clock in'}
            </span>
            <span className="text-[15px]">{steps ? 'Location, face photo and site photo' : 'Location and face photo'}</span>
          </span>
        </button>

        <RecentList items={history.slice(0, 5)} />

        <p className="flex flex-wrap justify-center gap-x-4 pb-4 text-center text-sm text-gray-600">
          <Link to="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-2">Privacy notice</Link>
          <span>Help: ask your admin, or <a className="inline-flex min-h-11 items-center underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></span>
          {DIAGNOSTICS && <Link to="/diagnostics" className="inline-flex min-h-11 items-center underline underline-offset-2">Device diagnostics</Link>}
        </p>
      </main>
    </div>
  );
};
