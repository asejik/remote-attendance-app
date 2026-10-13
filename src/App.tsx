import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MobileLayout } from './components/MobileLayout';
import { AuthProvider } from './context/AuthContext';
import type { StaffContext } from './context/useStaff';
import { StaffRoute } from './pages/StaffRoute';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { ConsentPage } from './pages/ConsentPage';
import { WorkerHomePage } from './pages/WorkerHomePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { ReviewPage } from './pages/admin/ReviewPage';
import { AbsentPage } from './pages/admin/AbsentPage';
import { SitesPage } from './pages/admin/SitesPage';
import { StaffPage } from './pages/admin/StaffPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { SettingsPage } from './pages/admin/SettingsPage';

const mobile = (node: ReactNode) => <MobileLayout>{node}</MobileLayout>;
const admin = (page: (c: StaffContext) => ReactNode) => (
  <StaffRoute require="admin">{(c) => <AdminLayout context={c}>{page(c)}</AdminLayout>}</StaffRoute>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={mobile(<StaffLoginPage />)} />
          <Route path="/reset-password" element={mobile(<ResetPasswordPage />)} />
          <Route path="/consent" element={mobile(<StaffRoute require="member">{(c, reload) => <ConsentPage context={c} reload={reload} />}</StaffRoute>)} />
          <Route path="/home" element={mobile(<StaffRoute require="member">{(c) => <WorkerHomePage context={c} />}</StaffRoute>)} />
          <Route path="/diagnostics" element={mobile(<StaffRoute require="member">{() => <DiagnosticsPage />}</StaffRoute>)} />

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
