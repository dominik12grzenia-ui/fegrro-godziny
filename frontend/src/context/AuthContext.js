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
  // Lazy initial state - read cached user BEFORE first render so any
  // ProtectedRoute sees correct role immediately (no flicker, no redirect to
  // registration screen). Stored in localStorage (not sessionStorage) because
  // Safari PWA standalone scope isolates sessionStorage across reloads.
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_user');
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
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      setUser(response.data);
      try {
        localStorage.setItem('cached_user', JSON.stringify(response.data));
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
        password,
      }, { timeout: 15000 });
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', userData?.full_name || 'Admin');
      localStorage.setItem('cached_user', JSON.stringify(userData));
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
      // Uzyj klienta `api` z timeoutem 15s zeby logowanie nigdy nie wisialo.
      const response = await api.post('/auth/foreman/login', {
        email: fullName,  // backend reads from .email field
        password,
      }, { timeout: 15000 });
      const { access_token, user_id, full_name, role, assigned_sites, message } = response.data;
      const userData = {
        id: user_id,
        full_name,
        role: role || 'foreman',
        assigned_sites: assigned_sites || []
      };
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', full_name || 'Brygadzista');
      localStorage.setItem('cached_user', JSON.stringify(userData));
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
    localStorage.removeItem('cached_user');
    // Czysc takze backup admin tokena (impersonacja) - nadal w sessionStorage
    // (ginie po zamknięciu PWA, co jest porządanym zachowaniem dla impersonacji)
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
        timeout: 15000,
      });
      const { access_token, user_id, full_name, role, assigned_sites } = response.data;
      const userData = {
        id: user_id,
        full_name,
        role: role || 'foreman',
        assigned_sites: assigned_sites || [],
        impersonated: true,
      };
      // Write to storage SYNCHRONOUSLY so AuthProvider can hydrate from
      // localStorage on next mount/reload (Safari PWA-safe).
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_name', full_name || 'Brygadzista');
      localStorage.setItem('cached_user', JSON.stringify(userData));
      // DO NOT call setUser/setToken here - that flips user.role to 'foreman'
      // BEFORE the route changes, causing ProtectedAdminRoute on the current
      // /admin/dashboard view to bounce us to /login. Instead, return the data
      // and let the caller navigate first, then trigger a full reload that
      // rehydrates from localStorage.
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
      // Restore admin token+user to localStorage. Caller does a hard reload
      // so AuthProvider rehydrates from localStorage cleanly.
      localStorage.setItem('token', adminToken);
      localStorage.setItem('user_name', adminUser.full_name || 'Admin');
      localStorage.setItem('cached_user', JSON.stringify(adminUser));
      sessionStorage.removeItem('admin_backup_token');
      sessionStorage.removeItem('admin_backup_user');
      return { success: true, user: adminUser };
    } catch (_e) {
      return { success: false, error: 'Błąd odczytu danych admina' };
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
  baseURL: API,
  // Globalny timeout: zadne wywolanie nie moze wisiec dluzej niz 15s.
  // Bez tego na slabym sygnale (np. brygadzista na budowie) Promise.all
  // moze nigdy sie nie zakonczyc, ekran utknie na spinnerze.
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* =========================================================================
 *  FAST-PATH: in-memory cache + request deduplication for read-only GETs.
 *
 *  Goal: zakladka Finanse i przelaczanie miesiecy nie powinno re-pobierac
 *  tych samych "rzadko zmieniajacych sie" zasobow (kody kosztow, budowy,
 *  ustawienia, kontrahenci) co 200ms. Stale-while-revalidate: pierwszy
 *  request laduje sie z sieci, kolejne w ciagu TTL wracaja natychmiast
 *  z cache; rownolegle duplikaty (np. 3 komponenty pobieraja /finance/kody)
 *  sa zlewane do jednego requestu i wynik dostaje kazdy subscriber.
 *
 *  TTL osobno per prefix. Mutacje (POST/PUT/PATCH/DELETE) na danym prefixie
 *  automatycznie invaliduja cache calego prefixu.
 * ===================================================================== */
const _getCache = new Map(); // url -> { ts, data, status, headers }
const _inflight = new Map(); // url -> Promise

// Mapa prefix -> TTL ms. Co nie pasuje = nie cachujemy.
const CACHEABLE_TTL = [
  // Slowniki (rzadkie zmiany)
  ['/finance/kody', 60_000],
  ['/finance/budowy', 30_000],
  ['/finance/settings', 60_000],
  // Lekkie podsumowania
  ['/payroll/year-totals', 30_000],
  // Listy uzywane czesto miedzy zakladkami
  ['/sites', 30_000],
  ['/construction-sites', 30_000],
  ['/employees', 30_000],
  ['/foremen', 30_000],
  // BHP/alerty/odzywka admin (admin pobierze raz na X)
  ['/bhp/alerts', 60_000],
  ['/clothing/types', 60_000],
];

function _matchTtl(url) {
  for (const [prefix, ttl] of CACHEABLE_TTL) {
    if (url.startsWith(prefix)) return ttl;
  }
  return 0;
}

function _purgePrefix(prefix) {
  for (const k of Array.from(_getCache.keys())) {
    if (k.startsWith(prefix)) _getCache.delete(k);
  }
  for (const k of Array.from(_inflight.keys())) {
    if (k.startsWith(prefix)) _inflight.delete(k);
  }
}

// Wrapper na metodach GET. Zamieniamy zwracajac z cache jezeli swieze.
const _origGet = api.get.bind(api);
api.get = (url, config = {}) => {
  // Skip-cache: gdy uzywamy { skipCache: true }
  if (config && config.skipCache) return _origGet(url, config);
  const ttl = _matchTtl(url);
  if (!ttl) return _origGet(url, config);
  const now = Date.now();
  const cached = _getCache.get(url);
  if (cached && now - cached.ts < ttl) {
    // Natychmiast zwroc kopie odpowiedzi
    return Promise.resolve({ data: cached.data, status: cached.status, headers: cached.headers });
  }
  // Deduplikacja: jezeli rownolegle juz leci - zwroc to samo Promise
  if (_inflight.has(url)) return _inflight.get(url);
  const p = _origGet(url, config)
    .then((r) => {
      _getCache.set(url, {
        ts: Date.now(), data: r.data, status: r.status, headers: r.headers,
      });
      _inflight.delete(url);
      return r;
    })
    .catch((e) => {
      _inflight.delete(url);
      throw e;
    });
  _inflight.set(url, p);
  return p;
};

// Auto-invalidate po mutacjach. Wyciagamy prefix z URL i czyscimy.
function _invalidateOnMutation(url) {
  if (!url) return;
  // url moze byc np. '/finance/budowy/abc/archive' - cleanup '/finance/budowy'
  for (const [prefix] of CACHEABLE_TTL) {
    if (url.startsWith(prefix)) {
      _purgePrefix(prefix);
    }
  }
  // Po edycji wyplat / godzin / zaliczek - invaliduj /payroll/year-totals
  if (url.startsWith('/payroll') || url.startsWith('/hours') ||
      url.startsWith('/advances') || url.startsWith('/penalties')) {
    _purgePrefix('/payroll/year-totals');
  }
}

['post', 'put', 'patch', 'delete'].forEach((method) => {
  const orig = api[method].bind(api);
  api[method] = (url, ...rest) => {
    _invalidateOnMutation(url);
    return orig(url, ...rest);
  };
});

// Eksport - rzadko potrzebne, ale przydatne po mass-sync
export const invalidateApiCache = (prefix) => _purgePrefix(prefix);
export const clearAllApiCache = () => { _getCache.clear(); _inflight.clear(); };
