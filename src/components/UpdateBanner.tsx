import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { checkForUpdate, type UpdateStatus } from '../lib/appUpdate';

// Android release builds: tells the worker a newer APK exists (see appUpdate.ts).
export const UpdateBanner = () => {
  const [update, setUpdate] = useState<{ status: UpdateStatus; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((result) => {
      if (!cancelled) setUpdate(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || update.status === 'none') return null;
  const required = update.status === 'required';
  return (
    <div role={required ? 'alert' : 'status'}
      className={`px-4 py-3 text-sm flex items-center justify-between gap-3 ${required ? 'bg-red-600 text-white' : 'bg-blue-50 text-blue-900 border-b border-blue-100'}`}>
      <span>{required ? 'This app version is too old. Please update now.' : 'A new version of the app is available.'}</span>
      <a href={update.url} target="_blank" rel="noopener noreferrer"
        className={`shrink-0 px-3 py-1.5 rounded-full font-medium flex items-center gap-1 ${required ? 'bg-white text-red-700' : 'bg-blue-600 text-white'}`}>
        <Download size={14} aria-hidden /> Update
      </a>
    </div>
  );
};
