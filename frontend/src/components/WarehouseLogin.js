import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Warehouse, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

export default function WarehouseLogin() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If already logged-in as warehouse, jump straight to dashboard
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('user_role');
    if (token && role === 'warehouse') {
      navigate('/magazynier/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !password) {
      toast.error('Podaj nazwe użytkownika i hasło');
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post(`${API}/api/auth/warehouse/login`, {
        email: fullName.trim(),
        password,
      });
      const { access_token, user_id, full_name, role } = res.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user_id', user_id);
      localStorage.setItem('user_name', full_name);
      localStorage.setItem('user_role', role);
      toast.success(`Witaj, ${full_name}`);
      navigate('/magazynier/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd logowania');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#1E293B] border-[#334155]" data-testid="warehouse-login-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-16 h-16 rounded-full bg-[#E8B76A]/20 flex items-center justify-center">
            <Warehouse className="h-8 w-8 text-[#E8B76A]" />
          </div>
          <CardTitle className="text-[#E8B76A] text-2xl font-bold">FeGrro - Magazynier</CardTitle>
          <p className="text-sm text-[#94A3B8] mt-1">Logowanie do panelu magazyniera</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">Nazwa użytkownika</label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="np. Jan Kowalski"
                className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] placeholder:text-[#475569]"
                data-testid="warehouse-login-name"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">Hasło</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Hasło"
                className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] placeholder:text-[#475569]"
                data-testid="warehouse-login-password"
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-[#E8B76A] hover:bg-[#C79B58] text-[#1E293B] font-bold"
              data-testid="warehouse-login-submit"
            >
              <LogIn className="h-4 w-4 mr-2" />
              {busy ? 'Logowanie...' : 'Zaloguj sie'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
