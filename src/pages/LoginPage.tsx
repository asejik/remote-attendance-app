import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // Toggle between Login/Register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // Register Logic
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Account created! You are now logged in.');
      } else {
        // Login Logic
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      // If successful, the AuthContext detects the change and App.tsx redirects us?
      // Actually, we should manually navigate to be safe/fast.
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-center px-6 py-12">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center mb-10">
        <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center text-white mb-4">
          <MapPin size={32} />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          ABC Attendance
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {isSignUp ? 'Create a new account' : 'Sign in to access remote verification'}
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleAuth}>
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-100">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-900">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 outline-gray-300 focus:outline-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 outline-gray-300 focus:outline-blue-600"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full justify-center items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:bg-blue-300"
        >
          {loading && <Loader2 className="animate-spin mr-2" size={16} />}
          {isSignUp ? 'Create Account' : 'Sign in'}
        </button>

        <div className="text-center text-sm">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="font-semibold text-blue-600 hover:text-blue-500"
          >
            {isSignUp ? 'Already have an account? Sign in' : 'No account? Create one'}
          </button>
        </div>
      </form>
      <div className="mt-8 text-center">
        <a href="/admin" className="text-xs text-gray-300 hover:text-gray-500">
          Admin Portal Access
        </a>
      </div>
    </div>
  );
};