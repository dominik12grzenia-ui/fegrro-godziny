import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { AssignmentManager } from './components/AssignmentManager';
import { HoursTable } from './components/HoursTable';
import { PublicHours } from './components/PublicHours';
import { WorkerEntry } from './components/WorkerEntry';
import { ForemanEntry } from './components/ForemanEntry';
import { WorkerDashboard } from './components/WorkerDashboard';
import WarehouseLogin from './components/WarehouseLogin';
import WarehouseDashboard from './components/WarehouseDashboard';
import WarehouseTokenEntry from './components/WarehouseTokenEntry';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { Toaster } from './components/ui/sonner';
import '@/App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Protected Route Components
const ProtectedAdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
      </div>
    );
  }
  
  if (!user || user.role !== 'admin') {
    return <Navigate to="/login" />;
  }
  
  return children;
};

const ProtectedWorkerRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1E293B]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5F7151]"></div>
      </div>
    );
  }
  
  if (!user || (user.role !== 'worker' && user.role !== 'foreman')) {
    return <Navigate to="/worker-entry" />;
  }
  
  return children;
};

const Home = () => <Navigate to="/foreman" replace />;

/**
 * Stare/legacy linki publiczne dla pracownikow (np. /worker/:token,
 * /foreman/:token, /pracownik/:token) - byly wysylane wczesniej i sa
 * "w terenie". Mapujemy na aktualna sciezke /hours/:token bez utraty tokenu.
 */
function LegacyHoursRedirect() {
  const { token } = useParams();
  if (!token) return <Navigate to="/" replace />;
  return <Navigate to={`/hours/${token}`} replace />;
}

/**
 * Listens to messages from the service worker (push-notification clicks) and
 * navigates the SPA accordingly. Without this, SW.client.navigate() can't
 * cross the SPA route boundary on iOS/Safari standalone.
 */
function SwNavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      const data = event.data;
      if (data && data.type === 'NAVIGATE' && data.url) {
        try { navigate(data.url, { replace: false }); }
        catch (_e) { window.location.href = data.url; }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <SwNavigationBridge />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/worker-entry" element={<WorkerEntry />} />
        <Route path="/foreman" element={<ForemanEntry />} />
        <Route path="/magazynier" element={<WarehouseLogin />} />
        <Route path="/magazynier/dashboard" element={<WarehouseDashboard />} />
        <Route path="/magazynier/:token" element={<WarehouseTokenEntry />} />
        <Route path="/hours/:token" element={<PublicHours />} />

        {/* Legacy redirects: jezeli pracownicy maja juz wyslane linki typu
            /worker/{token} albo /foreman/{token} (starsze nazewnictwo), przekieruj
            ich automatycznie na biezacy publiczny widok /hours/{token}.
            Dzieki temu wszystkie wczesniej wyslane linki nadal dzialaja. */}
        <Route path="/worker/:token" element={<LegacyHoursRedirect />} />
        <Route path="/foreman/:token" element={<LegacyHoursRedirect />} />
        <Route path="/pracownik/:token" element={<LegacyHoursRedirect />} />
        
        {/* Worker Routes */}
        <Route 
          path="/worker/dashboard" 
          element={
            <ProtectedWorkerRoute>
              <WorkerDashboard />
            </ProtectedWorkerRoute>
          } 
        />
        
        {/* Admin Routes */}
        <Route 
          path="/admin/dashboard" 
          element={
            <ProtectedAdminRoute>
              <AdminDashboard />
            </ProtectedAdminRoute>
          } 
        />
        <Route 
          path="/admin/assignments" 
          element={
            <ProtectedAdminRoute>
              <AssignmentManager />
            </ProtectedAdminRoute>
          } 
        />
        <Route 
          path="/admin/hours-table" 
          element={
            <ProtectedAdminRoute>
              <HoursTable />
            </ProtectedAdminRoute>
          } 
        />
        
        {/* Worker Route - Hours Table */}
        <Route 
          path="/worker/hours-table" 
          element={
            <ProtectedWorkerRoute>
              <HoursTable />
            </ProtectedWorkerRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <div className="App">
          <AppRoutes />
          <PWAInstallPrompt />
          <Toaster position="top-center" richColors />
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
