import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Warehouse, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageToggle } from './LanguageToggle';

const API = process.env.REACT_APP_BACKEND_URL;

export default function WarehouseLogin() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('user_role');
    if (token && role === 'warehouse') {
      navigate('/magazynier/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !password) {
      toast.error(t('wh_login.error_creds'));
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
      toast.success(`${t('common.welcome') || 'Witaj'}, ${full_name}`);
      navigate('/magazynier/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || t('login.error_generic') || 'Błąd');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4"><LanguageToggle /></div>
      <Card className="w-full max-w-md bg-[#131C2F] border-[#2A3B59]" data-testid="warehouse-login-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-16 h-16 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
            <Warehouse className="h-8 w-8 text-[#D4AF37]" />
          </div>
          <CardTitle className="text-[#D4AF37] text-2xl font-bold">FeGrro - {t('wh_login.title') || 'Magazynier'}</CardTitle>
          <p className="text-sm text-[#94A3B8] mt-1">{t('wh_login.subtitle') || 'Logowanie'}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">{t('wh_login.username')}</label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="np. Jan Kowalski"
                className="bg-[#0B1120] border-[#2A3B59] text-[#CBD5E1] placeholder:text-[#2A3B59]"
                data-testid="warehouse-login-name"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">{t('wh_login.password')}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('wh_login.password')}
                className="bg-[#0B1120] border-[#2A3B59] text-[#CBD5E1] placeholder:text-[#2A3B59]"
                data-testid="warehouse-login-password"
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-[#D4AF37] hover:bg-[#B8941F] text-[#131C2F] font-bold"
              data-testid="warehouse-login-submit"
            >
              <LogIn className="h-4 w-4 mr-2" />
              {busy ? t('common.loading_dots') : t('login.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
