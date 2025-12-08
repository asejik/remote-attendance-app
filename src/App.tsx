import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MobileLayout } from './components/MobileLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage'; // Ensure this is imported
import { AuthProvider, useAuth } from './context/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Loader2 } from 'lucide-react';

// 1. Admin Protected Route
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const checkRole = async () => {
      if (!user) return;
      // Check the profiles table for role
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      setIsAdmin(data?.role === 'admin');
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