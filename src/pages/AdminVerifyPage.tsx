import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useStaff } from '../context/useStaff';
import { startTotpEnrolment, verifiedTotpFactor, verifyTotp } from '../lib/mfa';
import { signOut } from '../lib/signOut';
import { SUPPORT_EMAIL } from '../lib/support';
import { button } from '../components/classes';

type Mode =
  | { kind: 'loading' }
  | { kind: 'code'; factorId: string }
  | { kind: 'enrol'; factorId: string; qrCode: string; secret: string }
  | { kind: 'failed' };

// Admin two-step login: after the password, either set up an authenticator app
// (first time) or enter its 6-digit code. Until then the database gives the
// admin no access (migration 20261015150000).
export const AdminVerifyPage = () => {
  const navigate = useNavigate();
  const { user, aal } = useAuth();
  const { context, loading } = useStaff();
  const [mode, setMode] = useState<Mode>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = context?.staff.role === 'admin';

  useEffect(() => {
    if (!isAdmin || aal === 'aal2' || context?.adminLocked) return;
    let cancelled = false;
    (async () => {
      try {
        const factor = await verifiedTotpFactor();
        const next: Mode = factor ? { kind: 'code', factorId: factor.id } : { kind: 'enrol', ...(await startTotpEnrolment()) };
        if (!cancelled) setMode(next);
      } catch {
        if (!cancelled) setMode({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, aal, context?.adminLocked]);

  if (!user) return <Navigate to="/" replace />;
  if (loading) return <div className="h-screen flex items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-gray-400" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  if (context.adminLocked) return <LockedNotice />;
  if (aal === 'aal2') return <Navigate to="/admin/review" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode.kind !== 'code' && mode.kind !== 'enrol') return;
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    setError('');
    const problem = await verifyTotp(mode.factorId, code);
    setBusy(false);
    if (problem) {
      setCode('');
      return setError(problem);
    }
    navigate('/admin/review', { replace: true });
  };

  const logOut = async () => {
    if (await signOut()) return;
    navigate('/', { replace: true });
  };

  return (
    <main className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gray-50">
      <div className="w-full max-w-sm mx-auto rounded-card border border-gray-200 bg-white p-6 shadow-raised space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-brand" size={28} aria-hidden />
          <h1 className="font-display text-2xl font-extrabold text-gray-900">{mode.kind === 'enrol' ? 'Set up two-step login' : 'Two-step login'}</h1>
        </div>

        {mode.kind === 'loading' && <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" aria-label="Loading" /></div>}
        {mode.kind === 'failed' && (
          <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">Could not start two-step login. Check your connection and reload the page.</p>
        )}

        {mode.kind === 'enrol' && (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Admins can see every worker&apos;s photos and locations, so admin logins need a second step.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar).</li>
              <li>In the app, add an account and scan this code.</li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <img src={mode.qrCode} alt="QR code for your authenticator app" className="mx-auto w-48 h-48 border rounded-control" />
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer">Can&apos;t scan? Type this key instead</summary>
              <p className="mt-1 font-mono break-all select-all" data-testid="totp-secret">{mode.secret}</p>
            </details>
          </div>
        )}
        {mode.kind === 'code' && <p className="text-sm text-gray-700">Open your authenticator app and type the 6-digit code for SiteProof.</p>}

        {(mode.kind === 'code' || mode.kind === 'enrol') && (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              6-digit code
              <div className="relative mt-1">
                <input autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
                  autoComplete="one-time-code" required className="block w-full min-h-11 rounded-control border border-gray-300 bg-white pl-3 pr-10 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25 font-mono tracking-[0.3em] text-lg" />
                <KeyRound className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={16} aria-hidden />
              </div>
            </label>
            {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
            <button type="submit" disabled={busy} className={`${button.primary} w-full min-h-12`}>
              {busy ? <Loader2 className="animate-spin" size={20} aria-label="Checking" /> : mode.kind === 'enrol' ? 'Finish set-up' : 'Continue'}
            </button>
          </form>
        )}

        <p className="text-xs text-gray-500">
          Lost your phone? Email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> to have two-step login reset.
        </p>
        <button type="button" onClick={logOut} className="w-full min-h-11 text-sm text-gray-600 underline">Log out</button>
      </div>
    </main>
  );
};

// Too many wrong codes (migration 20261015170000): admin access stays off until
// the platform owner unlocks it, even if a later code is right.
const LockedNotice = () => {
  const navigate = useNavigate();
  const logOut = async () => {
    if (await signOut()) return;
    navigate('/', { replace: true });
  };
  return (
    <main className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gray-50">
      <div className="w-full max-w-sm mx-auto rounded-card border border-gray-200 bg-white p-6 shadow-raised space-y-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-red-600" size={28} aria-hidden />
          <h1 className="font-display text-2xl font-extrabold text-gray-900">Admin access locked</h1>
        </div>
        <p role="alert" className="text-sm text-red-800 bg-red-50 rounded-control p-3">
          Too many wrong two-step codes were entered for this account, so admin access is locked to protect your workers&apos; data.
        </p>
        <p className="text-sm text-gray-700">
          Email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> to unlock it. If you didn&apos;t enter those codes,
          someone may know your password: you will be asked to change it.
        </p>
        <button type="button" onClick={logOut} className="w-full min-h-11 text-sm text-gray-600 underline">Log out</button>
      </div>
    </main>
  );
};
