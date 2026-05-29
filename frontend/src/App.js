import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import ErrorBoundary from './components/ErrorBoundary';
import { AdminLogin } from './components/AdminLogin';
import { WorkerEntry } from './components/WorkerEntry';
import { ForemanEntry } from './components/ForemanEntry';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { PushPermissionGate } from './components/PushPermissionGate';
import { PublicPushGate } from './components/PublicPushGate';
import { Toaster } from './components/ui/sonner';
import '@/App.css';

// iter95bb: code-splitting — ciężkie komponenty (AdminDashboard, HoursTable, WorkerDashboard, WarehouseDashboard, AssignmentManager) ładowane on-demand.
// Eager-loaded zostają tylko: AdminLogin, WorkerEntry, ForemanEntry, push gates — minimalna pulpit ekrany start.
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AssignmentManager = lazy(() => import('./components/AssignmentManager').then((m) => ({ default: m.AssignmentManager })));
const HoursTable = lazy(() => import('./components/HoursTable').then((m) => ({ default: m.HoursTable })));
const PublicHours = lazy(() => import('./components/PublicHours').then((m) => ({ default: m.PublicHours })));
const WorkerDashboard = lazy(() => import('./components/WorkerDashboard').then((m) => ({ default: m.WorkerDashboard })));
const WarehouseLogin = lazy(() => import('./components/WarehouseLogin'));
const WarehouseDashboard = lazy(() => import('./components/WarehouseDashboard'));
const WarehouseTokenEntry = lazy(() => import('./components/WarehouseTokenEntry'));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0B1120]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#9DBC85]"></div>
  </div>
);

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
  
  return <PushPermissionGate>{children}</PushPermissionGate>;
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
  
  return <PushPermissionGate>{children}</PushPermissionGate>;
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
 * Public hours view (`/hours/:token`) opakowane w bramke push - pracownik
 * musi zaakceptowac powiadomienia zeby otrzymywac informacje o statusie
 * zamowien (BHP/odziez/sprzet).
 */
function PublicHoursWithPushGate() {
  const { token } = useParams();
  return (
    <PublicPushGate token={token}>
      <PublicHours />
    </PublicPushGate>
  );
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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/worker-entry" element={<WorkerEntry />} />
        <Route path="/foreman" element={<ForemanEntry />} />
        <Route path="/magazynier" element={<WarehouseLogin />} />
        <Route path="/magazynier/dashboard" element={<WarehouseDashboard />} />
        <Route path="/magazynier/:token" element={<WarehouseTokenEntry />} />
        <Route path="/hours/:token" element={<PublicHoursWithPushGate />} />

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
      </Suspense>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <div className="App">
            <AppRoutes />
            <PWAInstallPrompt />
            <Toaster position="top-center" richColors />
          </div>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
