import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MobileLayout } from './components/MobileLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminPage } from './pages/AdminPage';

// Protected Route Component
// If not logged in, kick them back to Login page
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
            <Route path="/" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          </Routes>
        </MobileLayout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;