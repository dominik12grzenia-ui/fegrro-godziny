import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { AssignmentManager } from './components/AssignmentManager';
import { HoursTable } from './components/HoursTable';
import { PublicHours } from './components/PublicHours';
import { WorkerEntry } from './components/WorkerEntry';
import { ForemanEntry } from './components/ForemanEntry';
import { WorkerDashboard } from './components/WorkerDashboard';
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

const Home = () => {
  // Stary PWA kafelek pracownika prowadzi do / - przekieruj do jego godzin,
  // ALE tylko gdy uzytkownik NIE jest zalogowany jako brygadzista/admin (ma JWT).
  if (typeof window !== 'undefined') {
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
    const workerToken = localStorage.getItem('fegrro_worker_token');
    const authToken = localStorage.getItem('token');
    if (isStandalone && workerToken && !authToken) return <Navigate to={`/hours/${workerToken}`} replace />;
  }
  return <Navigate to="/foreman" />;
};

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/worker-entry" element={<WorkerEntry />} />
        <Route path="/foreman" element={<ForemanEntry />} />
        <Route path="/hours/:token" element={<PublicHours />} />
        
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
    <AuthProvider>
      <div className="App">
        <AppRoutes />
        <PWAInstallPrompt />
        <Toaster position="top-center" richColors />
      </div>
    </AuthProvider>
  );
}

export default App;
