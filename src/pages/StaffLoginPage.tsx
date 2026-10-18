import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLastOrgSlug, staffLogin } from '../lib/staffAuth';
import { useStaff } from '../context/useStaff';
import { useAuth } from '../context/useAuth';
import { SUPPORT_EMAIL } from '../lib/support';
import { signOut } from '../lib/signOut';
import { Alert, LogoMark, Splash, Wordmark } from '../components/ui';
import { button, card, field, label } from '../components/classes';

export const StaffLoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { context, loading } = useStaff();
  const [mode, setMode] = useState<'worker' | 'admin'>('worker');
  const [org, setOrg] = useState(getLastOrgSlug);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    (location.state as { notice?: string } | null)?.notice === 'no_staff' ? 'This account has no active staff record.' : '',
  );
  const [info, setInfo] = useState('');

  // Already signed in as staff: go straight in.
  useEffect(() => {
    if (context) navigate(context.staff.role === 'admin' ? '/admin/overview' : '/home', { replace: true });
  }, [context, navigate]);

  // Signed in already: show the launch screen until we know where to go, never the form.
  const redirecting = !!user && (loading || !!context);

  const workerLogin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const message = await staffLogin(org, code, pin);
    setBusy(false);
    if (message) {
      setError(message);
      setPin('');
    }
  };

  const adminLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) return setError("You're offline. Connect to the internet to log in.");
    setBusy(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.user) {
      setBusy(false);
      return setError(authError?.message === 'Invalid login credentials' ? 'Email or password is not correct.'
        : authError?.name === 'AuthRetryableFetchError' ? "Couldn't reach the server. Check your internet connection and try again."
        : 'Could not log in. Please try again.');
    }
    const { data: staff, error: staffError } = await supabase.from('staff').select('role').eq('user_id', data.user.id).maybeSingle();
    setBusy(false);
    if (staffError) {
      await signOut();
      return setError("Couldn't reach the server. Check your internet connection and try again.");
    }
    if (staff?.role !== 'admin') {
      await signOut();
      setError('This login is for organisation admins. Workers log in with a staff code and PIN.');
    }
  };

  const forgotPassword = async () => {
    if (!email.trim()) return setError('Enter your email address first.');
    setError('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setInfo(resetError ? '' : 'If that email belongs to an admin, a reset link is on its way.');
    if (resetError) setError('Could not send the reset email. Please try again later.');
  };

  if (redirecting) return <Splash />;

  return (
    <main className="flex min-h-screen flex-col justify-center bg-gray-50 px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <p className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark size={40} />
          <Wordmark className="text-[1.75rem]" />
        </p>
        <div className={`${card} p-6 shadow-raised`}>
          <h1 className="font-display text-[1.75rem] font-extrabold leading-tight">{mode === 'admin' ? 'Admin login' : 'Worker login'}</h1>
          <p className="mt-1 mb-5 text-gray-600">
            {mode === 'admin' ? 'For organisation admins. You will also need your authenticator app.' : 'Use the codes and PIN your admin gave you.'}
          </p>

          {mode === 'worker' ? (
            <form onSubmit={workerLogin} className="space-y-4">
              <label className={label}>
                Organisation code
                <input required value={org} onChange={(e) => setOrg(e.target.value)} autoCapitalize="none" autoComplete="organization" className={field} />
              </label>
              <label className={label}>
                Staff code
                <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="username" className={`${field} font-mono`} />
              </label>
              <label className={label}>
                PIN (6 digits)
                <input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="current-password" className={`${field} font-mono tracking-[0.3em]`} />
              </label>
              <SubmitButton busy={busy} label="Log in" />
            </form>
          ) : (
            <form onSubmit={adminLogin} className="space-y-4">
              <label className={label}>
                Email
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
              </label>
              <label className={label}>
                Password
                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={field} />
              </label>
              <SubmitButton busy={busy} label="Log in" />
              <button type="button" onClick={forgotPassword} className={`${button.link} w-full text-sm`}>Forgot password?</button>
            </form>
          )}

          {error && <Alert tone="error" className="mt-4">{error}</Alert>}
          {info && <Alert tone="success" className="mt-4">{info}</Alert>}

          <div className="mt-5 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => { setMode(mode === 'worker' ? 'admin' : 'worker'); setError(''); setInfo(''); }}
              className={`${button.link} w-full text-sm text-gray-700`}
            >
              {mode === 'worker' ? 'Organisation admin? Log in here' : '← Back to worker login'}
            </button>
          </div>
        </div>
        <p className="mt-4 flex flex-wrap justify-center gap-x-4 text-center text-sm text-gray-600">
          <Link to="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-2">Privacy notice</Link>
          <span>Help: <a className="inline-flex min-h-11 items-center underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></span>
        </p>
      </div>
    </main>
  );
};

const SubmitButton = ({ busy, label: text }: { busy: boolean; label: string }) => (
  <button type="submit" disabled={busy} className={`${button.primary} w-full min-h-12 text-lg`}>
    {busy ? <Loader2 className="animate-spin" size={20} aria-label="Logging in" /> : text}
  </button>
);
