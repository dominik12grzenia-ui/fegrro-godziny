import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  // Lazy initial state - read once on mount.
  // If a freshly-impersonated user payload exists in sessionStorage,
  // hydrate from it immediately so ProtectedWorkerRoute doesn't redirect
  // while we wait for the /auth/me roundtrip.
  const [user, setUser] = useState(() => {
    try {
      const cached = sessionStorage.getItem('cached_user');
      if (cached) return JSON.parse(cached);
    } catch (_e) {
      // ignore
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
      // Refresh cached payload so subsequent reloads stay consistent
      try {
        sessionStorage.setItem('cached_user', JSON.stringify(response.data));
      } catch (_e) { /* ignore */ }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const loginAdmin = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/admin/login`, {
        email,
        password
      });
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', userData?.full_name || 'Admin');
      sessionStorage.setItem('cached_user', JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Login failed'
      };
    }
  };

  const loginForeman = async (fullName, password) => {
    try {
      const response = await axios.post(`${API}/auth/foreman/login`, {
        email: fullName,  // backend reads from .email field
        password,
      });
      const { access_token, user_id, full_name, role, assigned_sites, message } = response.data;
      const userData = {
        id: user_id,
        full_name,
        role: role || 'foreman',
        assigned_sites: assigned_sites || []
      };
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', full_name || 'Brygadzista');
      sessionStorage.setItem('cached_user', JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      return { success: true, user: userData, message };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Logowanie nie powiodlo sie'
      };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    sessionStorage.removeItem('cached_user');
    // Czysc takze backup admin tokena (impersonacja)
    sessionStorage.removeItem('admin_backup_token');
    sessionStorage.removeItem('admin_backup_user');
  };

  const impersonateForeman = async (foremanId) => {
    try {
      // Backup obecnego admin tokena/usera, zeby mozna bylo wrocic.
      // WAZNE: backup tylko gdy aktualnie zalogowany user to admin —
      // jak admin juz impersonuje brygadziste i przelacza na innego,
      // nie chcemy nadpisac backup admina tokenem brygadzisty.
      if (token && user && user.role === 'admin' && !user.impersonated) {
        sessionStorage.setItem('admin_backup_token', token);
        sessionStorage.setItem('admin_backup_user', JSON.stringify(user));
      }
      const response = await axios.post(`${API}/foremen/${foremanId}/impersonate`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { access_token, user_id, full_name, role, assigned_sites } = response.data;
      const userData = {
        id: user_id,
        full_name,
        role: role || 'foreman',
        assigned_sites: assigned_sites || [],
        impersonated: true,
      };
      // Write to localStorage SYNCHRONOUSLY before any reload.
      // This is what AuthProvider reads on next mount.
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', full_name || 'Brygadzista');
      // Pre-populate the user payload so AuthProvider can hydrate without
      // waiting for /auth/me roundtrip - avoids any flicker through
      // ProtectedWorkerRoute's redirect-when-not-foreman branch.
      sessionStorage.setItem('cached_user', JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Nie udalo sie wcielic',
      };
    }
  };

  const stopImpersonation = () => {
    const adminToken = sessionStorage.getItem('admin_backup_token');
    const adminUserRaw = sessionStorage.getItem('admin_backup_user');
    if (!adminToken || !adminUserRaw) {
      return { success: false, error: 'Brak danych admina' };
    }
    try {
      const adminUser = JSON.parse(adminUserRaw);
      localStorage.setItem('token', adminToken);
      localStorage.setItem('user_name', adminUser.full_name || 'Admin');
      sessionStorage.setItem('cached_user', JSON.stringify(adminUser));
      sessionStorage.removeItem('admin_backup_token');
      sessionStorage.removeItem('admin_backup_user');
      setToken(adminToken);
      setUser(adminUser);
      return { success: true, user: adminUser };
    } catch (_e) {
      return { success: false, error: 'Blad odczytu danych admina' };
    }
  };

  const value = {
    user,
    token,
    loading,
    loginAdmin,
    loginForeman,
    impersonateForeman,
    stopImpersonation,
    logout,
    isAdmin: user?.role === 'admin',
    isForeman: user?.role === 'foreman',
    isImpersonating: !!user?.impersonated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const api = axios.create({
  baseURL: API
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
