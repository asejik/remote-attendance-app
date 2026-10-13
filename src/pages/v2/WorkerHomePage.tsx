import { LogOut, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { StaffContext } from '../../context/useStaff';

// Placeholder home for the new accounts; clock-in moves here in M4.
export const WorkerHomePage = ({ context }: { context: StaffContext }) => {
  const navigate = useNavigate();
  const logOut = async () => {
    await supabase.auth.signOut();
    navigate('/v2/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{context.staff.full_name}</h1>
          <p className="text-xs text-gray-500">{context.organization.name} · {context.staff.staff_code}</p>
        </div>
        <button onClick={logOut} aria-label="Log out" className="p-2 text-gray-500 hover:text-red-600"><LogOut size={20} /></button>
      </header>
      <main className="p-4 max-w-md mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center space-y-2">
          <MapPin className="mx-auto text-blue-600" size={32} aria-hidden />
          <p className="font-semibold text-gray-900">You&apos;re logged in.</p>
          <p className="text-sm text-gray-600">Clock-in on the new system is coming in the next update.</p>
        </div>
      </main>
    </div>
  );
};
