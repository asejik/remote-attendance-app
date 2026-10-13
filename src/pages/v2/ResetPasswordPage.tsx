import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/useAuth';

// Landing page for the admin password-reset email link. Supabase signs the user
// in from the link; they then choose a new password.
export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError('Could not change the password. The link may have expired; request a new one.');
    navigate('/v2/admin/staff', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm mx-auto bg-white p-6 shadow-lg rounded-2xl space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Choose a new password</h1>
        {!user ? (
          <p className="text-sm text-gray-600">This link is invalid or has expired. Go back to the login page and use “Forgot password?” again.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              New password
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                className="mt-1 block w-full rounded-lg border border-gray-300 py-2.5 px-3" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Repeat new password
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
                className="mt-1 block w-full rounded-lg border border-gray-300 py-2.5 px-3" />
            </label>
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
            <button type="submit" disabled={busy} className="w-full py-3 rounded-lg bg-gray-800 text-white font-medium flex justify-center disabled:opacity-60">
              {busy ? <Loader2 className="animate-spin" size={20} aria-label="Saving" /> : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
