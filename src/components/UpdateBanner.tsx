import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { checkForUpdate, dismiss, isDismissed, type UpdateNotice } from '../lib/appUpdate';
import { button } from './classes';

// Android builds: tells the worker or admin a newer APK exists (see appUpdate.ts).
// Checked on open and whenever the app comes back to the front.
export const UpdateBanner = () => {
  const [update, setUpdate] = useState<UpdateNotice | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      checkForUpdate().then((result) => {
        if (cancelled) return;
        setUpdate(result);
        setHidden(result ? isDismissed(result) : false);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!update || update.status === 'none' || hidden) return null;
  const required = update.status === 'required';
  const later = () => {
    dismiss(update);
    setHidden(true);
  };
  return (
    <div role={required ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm ${required ? 'bg-red-700 text-white' : 'border-b border-brand-100 bg-brand-50 text-brand-900'}`}>
      <p className="min-w-0 flex-1 basis-48 font-semibold">
        {required ? 'This app version is too old. Please update now.' : `A new version of SiteProof is available (${update.label}).`}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {!required && (
          <button type="button" onClick={later} className={`${button.link} min-h-11 px-2 text-brand-900`}>Later</button>
        )}
        <a href={update.url} target="_blank" rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-4 font-semibold ${required ? 'bg-white text-red-800' : 'bg-brand text-white'}`}>
          <Download size={16} aria-hidden /> Download
        </a>
      </div>
    </div>
  );
};
