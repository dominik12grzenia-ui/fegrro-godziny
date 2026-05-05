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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

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
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', userData?.full_name || 'Admin');
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
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', full_name || 'Brygadzista');
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
    // Czysc takze backup admin tokena (impersonacja)
    sessionStorage.removeItem('admin_backup_token');
    sessionStorage.removeItem('admin_backup_user');
  };

  const impersonateForeman = async (foremanId) => {
    try {
      // Backup obecnego admin tokena/usera, zeby mozna bylo wrocic
      if (token && user) {
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
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', full_name || 'Brygadzista');
      return { success: true, user: userData };
    } catch (error) {
      // Cleanup backup at failure
      sessionStorage.removeItem('admin_backup_token');
      sessionStorage.removeItem('admin_backup_user');
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
      setToken(adminToken);
      setUser(adminUser);
      localStorage.setItem('token', adminToken);
      localStorage.setItem('user_name', adminUser.full_name || 'Admin');
      sessionStorage.removeItem('admin_backup_token');
      sessionStorage.removeItem('admin_backup_user');
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
