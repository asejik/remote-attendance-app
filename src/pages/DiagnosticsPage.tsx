import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import * as faceapi from 'face-api.js';
import { ArrowLeft } from 'lucide-react';
import { queue, subscribeQueue, type QueuedEvent } from '../lib/queue';
import { getStorageInfo, requestPersistentStorage, type StorageInfo } from '../lib/storage';
import { getLastSyncReport, getLastSyncTrigger } from '../lib/sync';

// M1 spike screen: shows the numbers we need from a real phone. Not for launch.

const formatBytes = (bytes: number | null | undefined) =>
  bytes == null ? 'unknown' : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const formatAge = (iso: string | undefined) => {
  if (!iso) return 'none';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-gray-100 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-900 text-right break-all">{value}</span>
  </div>
);

export const DiagnosticsPage = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [modelResult, setModelResult] = useState('not tested');
  const [gpsResult, setGpsResult] = useState('not tested');
  const lastSync = getLastSyncReport();
  const lastTrigger = getLastSyncTrigger();

  // Every user's waiting records on this device (oldest first), and the photo
  // sizes of the newest one that still has photos.
  const [pending, setPending] = useState<QueuedEvent[]>([]);
  const [photoSizes, setPhotoSizes] = useState<{ face?: number; site?: number }>({});
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const waiting = await queue.allPending();
      const newest = waiting.at(-1);
      const [face, site] = newest ? await Promise.all([queue.getPhoto(newest.id, 'face'), queue.getPhoto(newest.id, 'site')]) : [null, null];
      if (!cancelled) {
        setPending(waiting);
        setPhotoSizes({ face: face?.size, site: site?.size });
      }
    };
    read();
    const unsubscribe = subscribeQueue(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    getStorageInfo().then(setStorage);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const protectStorage = async () => {
    await requestPersistentStorage();
    setStorage(await getStorageInfo());
  };

  const testModels = async () => {
    setModelResult('loading...');
    const start = performance.now();
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceExpressionNet.loadFromUri('/models'),
      ]);
      setModelResult(`loaded in ${Math.round(performance.now() - start)} ms`);
    } catch (e) {
      setModelResult(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const testGps = () => {
    setGpsResult('waiting for fix...');
    const start = performance.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsResult(`±${Math.round(pos.coords.accuracy)} m in ${((performance.now() - start) / 1000).toFixed(1)} s`),
      (err) => setGpsResult(`FAILED: ${err.message}`),
      { enableHighAccuracy: true, timeout: 60000 },
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/home" aria-label="Back to home" className="p-2 -ml-2 text-gray-600"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold text-gray-800">Device diagnostics</h1>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <Row label="App version" value={__APP_VERSION__} />
          <Row label="Platform" value={Capacitor.getPlatform()} />
          <Row label="Network" value={online ? 'online' : 'OFFLINE'} />
          <Row label="Offline app (service worker)" value={Capacitor.isNativePlatform() ? 'not needed (native)' : navigator.serviceWorker?.controller ? 'active' : 'not active yet'} />
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <Row label="Storage protected" value={storage?.persisted == null ? 'unknown' : storage.persisted ? 'yes' : 'NO'} />
          <Row label="Storage used / available" value={`${formatBytes(storage?.usageBytes)} / ${formatBytes(storage?.quotaBytes)}`} />
          {storage?.persisted === false && (
            <button onClick={protectStorage} className="mt-3 w-full py-2 rounded-lg bg-brand text-white text-sm font-medium">Protect storage</button>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <Row label="Waiting to upload" value={String(pending.length)} />
          <Row label="Oldest waiting" value={formatAge(pending[0]?.capturedAt)} />
          <Row label="Last upload run" value={lastSync ? `${formatAge(lastSync.finishedAt)} ago: ${lastSync.synced} sent, ${lastSync.errors} failed` : 'never'} />
          {pending.some((r) => r.lastError) && (
            <Row
              label="Last upload error"
              value={(() => {
                const failed = pending.filter((r) => r.lastError).at(-1)!;
                return `${failed.lastError} (${failed.attempts ?? 0} tries)`;
              })()}
            />
          )}
          <Row label="Last upload trigger" value={lastTrigger ? `${lastTrigger.reason}, ${formatAge(lastTrigger.at)} ago` : 'none'} />
          <Row label="Newest waiting face photo" value={formatBytes(photoSizes.face)} />
          <Row label="Newest waiting site photo" value={formatBytes(photoSizes.site)} />
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <Row label="Face models" value={modelResult} />
          <button onClick={testModels} className="w-full py-2 rounded-lg border border-gray-300 text-sm font-medium">Test face model load</button>
          <Row label="GPS" value={gpsResult} />
          <button onClick={testGps} className="w-full py-2 rounded-lg border border-gray-300 text-sm font-medium">Test GPS fix</button>
        </section>
      </div>
    </div>
  );
};
