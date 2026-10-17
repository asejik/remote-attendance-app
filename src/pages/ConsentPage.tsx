import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { StaffContext } from '../context/useStaff';
import { PRIVACY_NOTICE_VERSION, SUPPORT_EMAIL } from '../lib/support';
import { signOut } from '../lib/signOut';

// First-login privacy notice for workers and supervisors (Nigeria Data
// Protection Act 2023: tell people what is collected, why, who sees it and for
// how long). Acceptance and the notice version are recorded (accept_consent);
// raising PRIVACY_NOTICE_VERSION shows this screen again.
export const ConsentPage = ({ context, reload }: { context: StaffContext; reload: () => Promise<void> }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('accept_consent', { p_version: PRIVACY_NOTICE_VERSION });
    if (rpcError) {
      setBusy(false);
      return setError(navigator.onLine ? 'Could not save. Please try again.' : "You're offline. Connect to the internet to continue.");
    }
    await reload();
    navigate('/home', { replace: true });
  };

  const decline = async () => {
    if (await signOut()) return;
    navigate('/', { replace: true });
  };

  return (
    <main className="min-h-screen bg-gray-50 px-5 py-8">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow p-6 space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-brand" size={28} aria-hidden />
          <h1 className="text-xl font-bold text-gray-900">{context.staff.consent_accepted_at ? 'Our privacy notice has changed' : 'Before you start'}</h1>
        </div>
        <p className="text-gray-700">
          <strong>{context.organization.name}</strong> uses this app to record attendance. When you clock in or out, the app collects:
        </p>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          <li>a photo of your face, to confirm it is you;</li>
          <li>a photo of the site (if your organisation requires it);</li>
          <li>your location (GPS) and the time.</li>
        </ul>
        <p className="text-gray-700">
          Only your organisation&apos;s admins and supervisors can see these records. Photos are deleted automatically after{' '}
          {context.organization.photo_retention_days ? `${context.organization.photo_retention_days} days` : 'a set period'}; the attendance
          times and places are kept for payroll and project records. There is no face recognition and no tracking between clock-ins.
        </p>
        <p className="text-gray-700">
          You can ask your admin for a copy of your records, or to correct them. Questions: ask your admin or write to{' '}
          <a className="text-brand-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.{' '}
          <Link to="/privacy" className="text-brand-700 underline">Read the full privacy notice</Link>.
        </p>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
        <button onClick={accept} disabled={busy} className="w-full py-3 rounded-lg bg-brand text-white font-medium disabled:opacity-60 flex justify-center">
          {busy ? <Loader2 className="animate-spin" size={20} aria-label="Saving" /> : 'I understand and agree'}
        </button>
        <button onClick={decline} className="w-full min-h-11 text-sm text-gray-600 underline">I don&apos;t agree (log out)</button>
      </div>
    </main>
  );
};
