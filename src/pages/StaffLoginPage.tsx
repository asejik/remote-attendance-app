import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HardHat, Loader2, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLastOrgSlug, staffLogin } from '../lib/staffAuth';
import { useStaff } from '../context/useStaff';
import { SUPPORT_EMAIL } from '../lib/support';
import { signOut } from '../lib/signOut';

const inputClass = 'mt-1 block w-full min-h-11 rounded-lg border border-gray-300 py-2.5 px-3 text-gray-900 focus:border-blue-500 focus:ring-blue-500';

export const StaffLoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { context } = useStaff();
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
    if (context) navigate(context.staff.role === 'admin' ? '/admin/review' : '/home', { replace: true });
  }, [context, navigate]);

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
      return setError(authError?.message === 'Invalid login credentials' ? 'Email or password is not correct.' : 'Could not log in. Please try again.');
    }
    const { data: staff } = await supabase.from('staff').select('role').eq('user_id', data.user.id).maybeSingle();
    setBusy(false);
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

  return (
    <main className="min-h-screen flex flex-col justify-center px-6 py-12 bg-gray-50">
      <div className="w-full max-w-sm mx-auto bg-white p-6 shadow-lg rounded-2xl">
        <div className="text-center mb-6">
          <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center text-white mb-3 ${mode === 'admin' ? 'bg-gray-800' : 'bg-blue-600'}`}>
            {mode === 'admin' ? <Shield size={28} aria-hidden /> : <HardHat size={28} aria-hidden />}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{mode === 'admin' ? 'Admin login' : 'Worker login'}</h1>
        </div>

        {mode === 'worker' ? (
          <form onSubmit={workerLogin} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Organisation code
              <input required value={org} onChange={(e) => setOrg(e.target.value)} autoCapitalize="none" autoComplete="organization" className={inputClass} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Staff code
              <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="username" className={inputClass} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              PIN (6 digits)
              <input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="current-password" className={`${inputClass} tracking-widest`} />
            </label>
            <SubmitButton busy={busy} label="Log in" />
          </form>
        ) : (
          <form onSubmit={adminLogin} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Email
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputClass} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Password
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={inputClass} />
            </label>
            <SubmitButton busy={busy} label="Log in" dark />
            <button type="button" onClick={forgotPassword} className="w-full min-h-11 text-sm text-gray-600 underline">Forgot password?</button>
          </form>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
        {info && <p role="status" className="mt-4 text-sm text-green-800 bg-green-50 rounded-lg p-3">{info}</p>}

        <button
          type="button"
          onClick={() => { setMode(mode === 'worker' ? 'admin' : 'worker'); setError(''); setInfo(''); }}
          className="mt-4 w-full min-h-11 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          {mode === 'worker' ? 'Organisation admin? Log in here' : '← Back to worker login'}
        </button>
      </div>
      <p className="mt-6 text-center text-xs text-gray-500 space-x-3">
        <Link to="/privacy" className="underline">Privacy notice</Link>
        <span>Help: <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></span>
      </p>
    </main>
  );
};

const SubmitButton = ({ busy, label, dark = false }: { busy: boolean; label: string; dark?: boolean }) => (
  <button type="submit" disabled={busy}
    className={`w-full flex justify-center py-3 rounded-lg text-white font-medium disabled:opacity-60 ${dark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-blue-600 hover:bg-blue-500'}`}>
    {busy ? <Loader2 className="animate-spin" size={20} aria-label="Logging in" /> : label}
  </button>
);
