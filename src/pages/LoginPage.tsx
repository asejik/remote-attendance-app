import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Loader2, Shield } from 'lucide-react'; // Added Shield
import { supabase } from '../lib/supabase';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(false); // Toggle
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Authenticate
      const { data: { user }, error: authError } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (authError) throw authError;
      if (!user) throw new Error('No user found');

      // 2. Routing Logic
      if (isAdminLogin) {
        // Check if they are ACTUALLY an admin
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') {
          throw new Error('Access Denied. You are not an Admin.');
        }
        navigate('/admin');
      } else {
        // Normal Staff Login
        navigate('/dashboard');
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-center px-6 py-12">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center mb-10">
        <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center text-white mb-4 ${isAdminLogin ? 'bg-gray-800' : 'bg-blue-600'}`}>
          {isAdminLogin ? <Shield size={32} /> : <MapPin size={32} />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          {isAdminLogin ? 'Admin Portal' : 'ABC Attendance'}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {isAdminLogin ? 'Restricted Access for HQ' : (isSignUp ? 'Create a new account' : 'Sign in to remote system')}
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleAuth}>
        {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-100">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-900">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Password</label>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3" />
        </div>

        <button type="submit" disabled={loading} className={`flex w-full justify-center items-center rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${isAdminLogin ? 'bg-gray-800 hover:bg-gray-700' : 'bg-blue-600 hover:bg-blue-500'}`}>
          {loading && <Loader2 className="animate-spin mr-2" size={16} />}
          {isSignUp ? 'Create Account' : 'Sign in'}
        </button>

        <div className="flex flex-col items-center space-y-4 pt-4">
          {!isAdminLogin && (
            <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-sm font-semibold text-blue-600 hover:text-blue-500">
              {isSignUp ? 'Already have an account? Sign in' : 'No account? Create one'}
            </button>
          )}

          {/* TOGGLE BETWEEN ADMIN AND STAFF */}
          <button
            type="button"
            onClick={() => { setIsAdminLogin(!isAdminLogin); setIsSignUp(false); setError(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {isAdminLogin ? '← Back to Staff Login' : 'Login to Admin Dashboard'}
          </button>
        </div>
      </form>
    </div>
  );
};