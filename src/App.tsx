import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MobileLayout } from './components/MobileLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage'; // Ensure this is imported
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { StaffRoute } from './pages/v2/StaffRoute';
import { StaffLoginPage } from './pages/v2/StaffLoginPage';
import { ConsentPage } from './pages/v2/ConsentPage';
import { WorkerHomePage } from './pages/v2/WorkerHomePage';
import { AdminStaffPage } from './pages/v2/AdminStaffPage';
import { ResetPasswordPage } from './pages/v2/ResetPasswordPage';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { useEffect, useState } from 'react';
import { getRole } from './lib/role';
import { Loader2 } from 'lucide-react';

// 1. Admin Protected Route
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const checkRole = async () => {
      if (!user) return;
      setIsAdmin((await getRole(user.id)) === 'admin');
    };
    checkRole();
  }, [user]);

  if (!user) return <Navigate to="/" replace />;
  if (isAdmin === null) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin"/></div>;

  // If not admin, kick back to dashboard
  if (isAdmin === false) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

// 2. Staff Protected Route
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <MobileLayout>
          <Routes>
            {/* Main Login Page (Handles both) */}
            <Route path="/" element={<LoginPage />} />

            {/* Staff Dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            {/* New organisation-based accounts (M3); legacy routes above stay until M4 */}
            <Route path="/v2/login" element={<StaffLoginPage />} />
            <Route path="/v2/reset-password" element={<ResetPasswordPage />} />
            <Route path="/v2/consent" element={<StaffRoute require="member">{(c, reload) => <ConsentPage context={c} reload={reload} />}</StaffRoute>} />
            <Route path="/v2/home" element={<StaffRoute require="member">{(c) => <WorkerHomePage context={c} />}</StaffRoute>} />
            <Route path="/v2/admin/staff" element={<StaffRoute require="admin">{(c) => <AdminStaffPage context={c} />}</StaffRoute>} />

            {/* M1 spike: device diagnostics */}
            <Route
              path="/diagnostics"
              element={
                <ProtectedRoute>
                  <DiagnosticsPage />
                </ProtectedRoute>
              }
            />

            {/* Secure Admin Dashboard */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
          </Routes>
        </MobileLayout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;