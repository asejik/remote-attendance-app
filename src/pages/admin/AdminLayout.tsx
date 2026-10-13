import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ClipboardCheck, FileSpreadsheet, LogOut, MapPin, Settings, UserMinus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { StaffContext } from '../../context/useStaff';

const TABS = [
  { to: '/admin/review', label: 'Review', icon: ClipboardCheck },
  { to: '/admin/absent', label: 'Absent', icon: UserMinus },
  { to: '/admin/sites', label: 'Sites', icon: MapPin },
  { to: '/admin/staff', label: 'Staff', icon: Users },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

// Wider, laptop-friendly frame for admin screens (still usable on a phone).
export const AdminLayout = ({ context, children }: { context: StaffContext; children: ReactNode }) => {
  const navigate = useNavigate();
  const logOut = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 pt-3 flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500">Admin</p>
            <h1 className="text-lg font-bold text-gray-900">{context.organization.name}</h1>
          </div>
          <button onClick={logOut} aria-label="Log out" className="p-2 text-gray-500 hover:text-red-600"><LogOut size={20} /></button>
        </div>
        <nav aria-label="Admin sections" className="max-w-5xl mx-auto px-2 flex gap-1 overflow-x-auto">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 ${
                isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
              <Icon size={16} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto p-4">{children}</main>
    </div>
  );
};
