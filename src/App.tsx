import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MobileLayout } from './components/MobileLayout';
import { AuthProvider } from './context/AuthContext';
import type { StaffContext } from './context/useStaff';
import { StaffRoute } from './pages/StaffRoute';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { ConsentPage } from './pages/ConsentPage';
import { WorkerHomePage } from './pages/WorkerHomePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { DIAGNOSTICS } from './lib/buildFlags';
import { Loader2 } from 'lucide-react';

// Test builds only; it imports face-api, so keep it out of the main bundle.
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage })));
import { AdminLayout } from './pages/admin/AdminLayout';

// Admin screens load on demand, so workers' phones never download them.
const ReviewPage = lazy(() => import('./pages/admin/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const AbsentPage = lazy(() => import('./pages/admin/AbsentPage').then((m) => ({ default: m.AbsentPage })));
const SitesPage = lazy(() => import('./pages/admin/SitesPage').then((m) => ({ default: m.SitesPage })));
const StaffPage = lazy(() => import('./pages/admin/StaffPage').then((m) => ({ default: m.StaffPage })));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const mobile = (node: ReactNode) => <MobileLayout>{node}</MobileLayout>;
const loading = <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" aria-label="Loading" /></div>;
const admin = (page: (c: StaffContext) => ReactNode) => (
  <StaffRoute require="admin">{(c) => <AdminLayout context={c}><Suspense fallback={loading}>{page(c)}</Suspense></AdminLayout>}</StaffRoute>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={mobile(<StaffLoginPage />)} />
          <Route path="/reset-password" element={mobile(<ResetPasswordPage />)} />
          <Route path="/privacy" element={mobile(<PrivacyPage />)} />
          <Route path="/consent" element={mobile(<StaffRoute require="member">{(c, reload) => <ConsentPage context={c} reload={reload} />}</StaffRoute>)} />
          <Route path="/home" element={mobile(<StaffRoute require="member">{(c) => <WorkerHomePage context={c} />}</StaffRoute>)} />
          {DIAGNOSTICS && <Route path="/diagnostics" element={mobile(<StaffRoute require="member">{() => <Suspense fallback={null}><DiagnosticsPage /></Suspense>}</StaffRoute>)} />}

          <Route path="/admin/review" element={admin((c) => <ReviewPage context={c} />)} />
          <Route path="/admin/absent" element={admin((c) => <AbsentPage context={c} />)} />
          <Route path="/admin/sites" element={admin((c) => <SitesPage context={c} />)} />
          <Route path="/admin/staff" element={admin((c) => <StaffPage context={c} />)} />
          <Route path="/admin/reports" element={admin((c) => <ReportsPage context={c} />)} />
          <Route path="/admin/settings" element={admin((c) => <SettingsPage context={c} />)} />
          <Route path="/admin" element={<Navigate to="/admin/review" replace />} />

          {/* Old links (M3 preview paths and the prototype) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
