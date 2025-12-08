import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Loader2, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(false);

  // Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let authResponse;

      if (isSignUp) {
        // REGISTER: Include Metadata for the Profile Trigger
        authResponse = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: `${firstName} ${lastName}`.trim(), // Combine names
              role: 'staff' // Default role
            }
          }
        });
      } else {
        // LOGIN
        authResponse = await supabase.auth.signInWithPassword({ email, password });
      }

      const { data: { user }, error: authError } = authResponse;

      if (authError) throw authError;
      if (!user) throw new Error('No user found');

      // Check Role in Database
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const userRole = profile?.role || 'staff';

      // ROUTING LOGIC (STRICT)
      if (isAdminLogin) {
        // Trying to access Admin Portal
        if (userRole !== 'admin') {
          await supabase.auth.signOut(); // Force logout
          throw new Error('Access Denied. You are not an Admin.');
        }
        navigate('/admin');
      } else {
        // Trying to access Staff App
        if (userRole === 'admin') {
          await supabase.auth.signOut(); // Force logout
          throw new Error('Admins must use the Admin Portal.');
        }
        navigate('/dashboard');
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-center px-6 py-12 bg-gray-50 min-h-screen">
      <div className="sm:mx-auto sm:w-full sm:max-w-md bg-white p-8 shadow-lg rounded-2xl">
        <div className="text-center mb-8">
          <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center text-white mb-4 ${isAdminLogin ? 'bg-gray-800' : 'bg-blue-600'}`}>
            {isAdminLogin ? <Shield size={32} /> : <MapPin size={32} />}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            {isAdminLogin ? 'Admin Portal' : 'Staff Access'}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {isAdminLogin ? 'HQ Management System' : (isSignUp ? 'Register New Staff' : 'Remote Field Login')}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleAuth}>
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-100">{error}</div>}

          {/* NAME FIELDS (Only for Sign Up) */}
          {isSignUp && !isAdminLogin && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input required type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input required type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3 border" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Company Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3 border" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3 border" />
          </div>

          <button type="submit" disabled={loading} className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white ${isAdminLogin ? 'bg-gray-800 hover:bg-gray-700' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {loading && <Loader2 className="animate-spin mr-2" size={16} />}
            {isSignUp ? 'Create Staff Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Options</span></div>
          </div>

          <div className="mt-6 flex flex-col items-center space-y-4">
            {!isAdminLogin && (
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-sm font-medium text-blue-600 hover:text-blue-500">
                {isSignUp ? 'Already have an account? Sign in' : 'Register New Staff Account'}
              </button>
            )}

            <button
              type="button"
              onClick={() => { setIsAdminLogin(!isAdminLogin); setIsSignUp(false); setError(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              {isAdminLogin ? '← Back to Staff Login' : 'Login to Admin Dashboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};