import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import { verifiedTotpFactor, verifyTotp } from '../lib/mfa';
import { button } from '../components/classes';

// Landing page for the admin password-reset email link. Supabase signs the user
// in from the link; they then choose a new password.
export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Supabase requires two-step login before a password change when it is set up.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 12) return setError('Use at least 12 characters. A short sentence is easy to remember.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    if (needCode) {
      const factor = await verifiedTotpFactor().catch(() => null);
      const problem = factor ? await verifyTotp(factor.id, code) : 'Could not check the code. Please try again.';
      if (problem) {
        setBusy(false);
        return setError(problem);
      }
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError?.code === 'insufficient_aal') {
      setNeedCode(true);
      return setError('Enter the 6-digit code from your authenticator app, then save again.');
    }
    if (updateError) return setError('Could not change the password. The link may have expired; request a new one.');
    navigate('/admin/overview', { replace: true });
  };

  return (
    <main className="min-h-screen flex flex-col justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm mx-auto rounded-card border border-gray-200 bg-white p-6 shadow-raised space-y-4">
        <h1 className="font-display text-2xl font-extrabold text-gray-900">Choose a new password</h1>
        {!user ? (
          <p className="text-sm text-gray-600">This link is invalid or has expired. Go back to the login page and use “Forgot password?” again.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              New password
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                className="mt-1 block w-full min-h-11 rounded-control border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Repeat new password
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
                className="mt-1 block w-full min-h-11 rounded-control border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25" />
            </label>
            {needCode && (
              <label className="block text-sm font-medium text-gray-700">
                6-digit code from your authenticator app
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
                  autoComplete="one-time-code" required className="mt-1 block w-full min-h-11 rounded-control border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25 font-mono tracking-[0.3em]" />
              </label>
            )}
            {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
            <button type="submit" disabled={busy} className={`${button.primary} w-full min-h-12`}>
              {busy ? <Loader2 className="animate-spin" size={20} aria-label="Saving" /> : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
};
