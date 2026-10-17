import { useEffect, useRef } from 'react';
import { Check, CheckCircle, CloudOff, XCircle } from 'lucide-react';
import { useEscape } from '../../hooks/useEscape';
import { button } from '../classes';

// The receipt a worker sees after every clock-in (docs/DESIGN.md, "proof slip"):
// what was recorded, where, and whether it has reached the organisation yet.
// The stamp shows only the phone's own check; the server makes the final one.
export interface Slip {
  id: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  at: string;
  siteName: string | null;
  distanceM: number | null; // phone's estimate; null without GPS or site
  radiusM: number | null;
  accuracyM: number | null;
  livenessPassed: boolean;
  workerName: string;
  staffCode: string;
  facePhotoUrl: string;
  sitePhotoUrl: string | null;
}

type Upload = 'pending' | 'synced' | 'failed';

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export const ProofSlip = ({ slip, upload, statusText, onDone }: { slip: Slip; upload: Upload; statusText: string; onDone: () => void }) => {
  useEscape(onDone);
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), []);
  const at = new Date(slip.at);
  const onSite = slip.distanceM !== null && slip.radiusM !== null && slip.distanceM <= slip.radiusM;
  const label = slip.type === 'CLOCK_IN' ? 'Clocked in' : 'Clocked out';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50" role="dialog" aria-modal="true" aria-labelledby="slip-title">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-5 py-7">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-brand-700"><CheckCircle size={20} aria-hidden /> {label}</p>
          <h2 id="slip-title" className="font-display text-3xl font-extrabold leading-tight">Your proof is saved</h2>
        </div>

        <article aria-label="Proof slip" className="animate-rise rounded-b-card rounded-t bg-white shadow-raised">
          <div aria-hidden className="h-3 bg-[radial-gradient(circle_at_8px_0,var(--color-gray-50)_6px,transparent_6.5px)] bg-[length:16px_12px] bg-repeat-x" />
          <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-gray-600">Proof of presence</p>
                <p className="font-mono text-[3.25rem] font-medium leading-none tracking-tight tabular-nums">
                  {at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-sm text-gray-600">{at.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              {slip.distanceM !== null && (
                <div aria-hidden className={`flex h-24 w-24 shrink-0 animate-stamp items-center justify-center rounded-full border-[3px] ${onSite ? 'border-brand text-brand' : 'border-amber-700 text-amber-800'}`}>
                  <div className={`flex h-20 w-20 flex-col items-center justify-center rounded-full border ${onSite ? 'border-brand' : 'border-amber-700'} leading-tight`}>
                    <span className="font-display text-[13px] font-extrabold tracking-wide">{onSite ? 'ON SITE' : 'AWAY'}</span>
                    <span className="font-mono text-[11px] font-medium">{metres(slip.distanceM)}</span>
                  </div>
                </div>
              )}
            </div>

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t-[1.5px] border-dashed border-gray-300 pt-3 text-base">
              <dt className="text-gray-600">Site</dt>
              <dd className="font-semibold">
                {slip.siteName ?? 'No site'}
                {slip.distanceM !== null && <span className="font-normal text-gray-600"> · about {metres(slip.distanceM)} away</span>}
              </dd>
              <dt className="text-gray-600">Location</dt>
              <dd className="font-semibold">{slip.accuracyM !== null ? `GPS ±${Math.round(slip.accuracyM)} m` : 'No GPS location'}</dd>
              <dt className="text-gray-600">Worker</dt>
              <dd className="font-semibold">{slip.workerName} <span className="font-mono font-medium text-gray-600">{slip.staffCode}</span></dd>
              <dt className="text-gray-600">Record</dt>
              <dd className="font-mono font-medium uppercase">{slip.id.slice(0, 4)}-{slip.id.slice(4, 8)}</dd>
            </dl>

            <div className="flex gap-2.5">
              <figure className="flex-1">
                <img src={slip.facePhotoUrl} alt="Your face photo" className="h-24 w-full rounded-control object-cover" />
                <figcaption className="mt-1 text-xs text-gray-600">Face photo{slip.livenessPassed ? ' · smile seen' : ''}</figcaption>
              </figure>
              {slip.sitePhotoUrl && (
                <figure className="flex-1">
                  <img src={slip.sitePhotoUrl} alt="Your site photo" className="h-24 w-full rounded-control object-cover" />
                  <figcaption className="mt-1 text-xs text-gray-600">Site photo</figcaption>
                </figure>
              )}
            </div>

            <ol aria-label="Upload progress" className="flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white"><Check size={14} strokeWidth={3} aria-hidden /></span>
                Saved on this phone
              </li>
              <li className="flex items-center gap-2.5">
                {upload === 'synced' ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white"><Check size={14} strokeWidth={3} aria-hidden /></span>
                ) : upload === 'failed' ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-700 text-white"><XCircle size={14} aria-hidden /></span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 text-gray-500"><CloudOff size={12} aria-hidden /></span>
                )}
                {upload === 'synced' ? 'Sent to your organisation' : upload === 'failed' ? 'Not accepted by the server' : 'Waiting to send'}
              </li>
            </ol>
            <p role="status" className="text-sm text-gray-700">{statusText}</p>
          </div>
        </article>

        <button ref={done} type="button" onClick={onDone} className={`${button.primary} mt-auto min-h-14 w-full font-display text-xl`}>Done</button>
      </div>
    </div>
  );
};
