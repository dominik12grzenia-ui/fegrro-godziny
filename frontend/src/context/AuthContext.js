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

  const registerForeman = async (fullName) => {
    try {
      const response = await axios.post(`${API}/auth/worker/register`, {
        full_name: fullName,
        role: 'foreman'
      });
      const { access_token, user_id, full_name, role, assigned_sites, message } = response.data;
      const userData = {
        id: user_id,
        full_name: full_name,
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
        error: error.response?.data?.detail || 'Rejestracja nie powiodla sie'
      };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  const value = {
    user,
    token,
    loading,
    loginAdmin,
    registerForeman,
    logout,
    isAdmin: user?.role === 'admin',
    isForeman: user?.role === 'foreman'
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
