import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useStaff, type StaffContext } from '../context/useStaff';
import { PRIVACY_NOTICE_VERSION } from '../lib/support';
import { Splash } from '../components/ui';

interface StaffRouteProps {
  // 'admin': organisation admins only. 'member': workers and supervisors, who
  // must accept the privacy notice first.
  require: 'admin' | 'member';
  children: (context: StaffContext, reload: () => Promise<void>) => ReactNode;
}

export const StaffRoute = ({ require, children }: StaffRouteProps) => {
  const { user, aal } = useAuth();
  const { context, loading, reload } = useStaff();
  const location = useLocation();

  if (!user) return <Navigate to="/" replace />;
  if (loading) return <Splash />;
  if (!context) return <Navigate to="/" replace state={{ notice: 'no_staff' }} />;

  const isAdmin = context.staff.role === 'admin';
  if (require === 'admin' && !isAdmin) return <Navigate to="/home" replace />;
  // Admins have no power until two-step login is done (the database enforces it).
  if (require === 'admin' && (aal !== 'aal2' || context.adminLocked)) return <Navigate to="/admin/verify" replace />;
  if (require === 'member' && isAdmin) return <Navigate to="/admin/overview" replace />;
  // First login: the notice must be accepted. A newer notice is shown again when
  // online (accepting needs the server), so offline clock-in is never blocked.
  const neverAccepted = !context.staff.consent_accepted_at;
  const outdated = (context.staff.consent_version ?? 0) < PRIVACY_NOTICE_VERSION && navigator.onLine;
  if (require === 'member' && (neverAccepted || outdated) && location.pathname !== '/consent') {
    return <Navigate to="/consent" replace />;
  }
  return <>{children(context, reload)}</>;
};
