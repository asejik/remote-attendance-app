import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MobileLayout } from './components/MobileLayout';
import { AuthProvider } from './context/AuthContext';
import { StaffRoute } from './pages/StaffRoute';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { ConsentPage } from './pages/ConsentPage';
import { WorkerHomePage } from './pages/WorkerHomePage';
import { AdminStaffPage } from './pages/AdminStaffPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <MobileLayout>
          <Routes>
            <Route path="/" element={<StaffLoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/consent" element={<StaffRoute require="member">{(c, reload) => <ConsentPage context={c} reload={reload} />}</StaffRoute>} />
            <Route path="/home" element={<StaffRoute require="member">{(c) => <WorkerHomePage context={c} />}</StaffRoute>} />
            <Route path="/admin/staff" element={<StaffRoute require="admin">{(c) => <AdminStaffPage context={c} />}</StaffRoute>} />
            <Route path="/diagnostics" element={<StaffRoute require="member">{() => <DiagnosticsPage />}</StaffRoute>} />
            {/* Old links (M3 preview paths and the prototype) */}
            <Route path="/v2/*" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MobileLayout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
