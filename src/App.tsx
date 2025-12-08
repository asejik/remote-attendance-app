import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MobileLayout } from './components/MobileLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

function App() {
  return (
    <BrowserRouter>
      <MobileLayout>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MobileLayout>
    </BrowserRouter>
  );
}

export default App;