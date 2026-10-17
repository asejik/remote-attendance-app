import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ClipboardCheck, FileSpreadsheet, Lock, LogOut, MapPin, Settings, UserMinus, Users } from 'lucide-react';
import type { StaffContext } from '../../context/useStaff';
import { SUPPORT_EMAIL, suspensionOf } from '../../lib/support';
import { signOut } from '../../lib/signOut';
import { LogoMark } from '../../components/ui';
import { button } from '../../components/classes';

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
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3">
          <LogoMark size={34} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-extrabold leading-tight text-gray-900">{context.organization.name}</h1>
            <p className="text-xs font-semibold text-gray-600">SiteProof · Admin</p>
          </div>
          <button onClick={logOut} className={`${button.secondary} min-h-10 px-3 text-sm`}><LogOut size={16} aria-hidden /> Log out</button>
        </div>
        {/* Phones: two rows of three, so no section is hidden off-screen. */}
        <nav aria-label="Admin sections" className="mx-auto mt-1 grid max-w-6xl grid-cols-3 px-2 sm:flex sm:gap-1">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 text-sm transition duration-150 sm:justify-start ${
                isActive ? 'border-brand font-bold text-gray-900' : 'border-transparent font-semibold text-gray-600 hover:text-gray-900'}`}>
              <Icon size={16} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      {suspension && (
        <div role="alert" className="bg-red-50 border-b border-red-200">
          <p className="max-w-6xl mx-auto px-4 py-3 text-sm text-red-900 flex items-start gap-2">
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
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
};
