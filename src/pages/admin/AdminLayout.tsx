import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ClipboardCheck, FileSpreadsheet, Lock, LogOut, MapPin, Settings, UserMinus, Users } from 'lucide-react';
import type { StaffContext } from '../../context/useStaff';
import { SUPPORT_EMAIL, suspensionOf } from '../../lib/support';
import { signOut } from '../../lib/signOut';

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
  const suspension = suspensionOf(context.organization);
  const logOut = async () => {
    if (await signOut()) return;
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
          <button onClick={logOut} aria-label="Log out" className="min-h-11 min-w-11 inline-flex items-center justify-center text-gray-500 hover:text-red-600"><LogOut size={20} /></button>
        </div>
        {/* Phones: two rows of three, so no section is hidden off-screen. */}
        <nav aria-label="Admin sections" className="max-w-5xl mx-auto px-2 grid grid-cols-3 sm:flex sm:gap-1">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `min-h-11 flex items-center justify-center sm:justify-start gap-1.5 px-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                isActive ? 'border-brand text-brand-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
              <Icon size={16} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      {suspension && (
        <div role="alert" className="bg-red-50 border-b border-red-200">
          <p className="max-w-5xl mx-auto px-4 py-3 text-sm text-red-900 flex items-start gap-2">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong>This organisation's subscription is suspended.</strong> You can still view and export records, but changes are turned off.{' '}
              {suspension.clockInsBlocked
                ? 'Clock-ins are no longer accepted.'
                : `Workers can clock in until ${suspension.graceEnds.toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })}.`}{' '}
              Contact <a className="underline font-medium" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </span>
          </p>
        </div>
      )}
      <main className="max-w-5xl mx-auto p-4">{children}</main>
    </div>
  );
};
