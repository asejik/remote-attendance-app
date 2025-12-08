import React, { useEffect } from 'react'; // Add useEffect
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Import client

export const LoginPage = () => {
  const navigate = useNavigate();

  // TEMPORARY: Test connection on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Supabase Error:', error);
      else console.log('Supabase Connected:', data);
    });
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Add real authentication logic later
    navigate('/dashboard');
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
          Sign in to access remote verification
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleLogin}>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-900">
            Email address
          </label>
          <div className="mt-2">
            <input
              id="email"
              name="email"
              type="email"
              required
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6"
              placeholder="engineer@abccompany.com"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
};