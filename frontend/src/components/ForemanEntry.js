import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { toast } from 'sonner';
import { LanguageToggle } from './LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';

export const ForemanEntry = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginForeman, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    if (!authLoading && user && user.role === 'foreman') {
      navigate('/worker/dashboard');
    }
  }, [user, authLoading, navigate]);

  // Dynamiczny manifest PWA: gdy ktos doda /foreman do ekranu glownego,
  // ikonka ma otwierac /foreman a NIE /login (admin)
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const original = link.getAttribute('href');
    const m = {
      name: 'FeGrro Brygadzista',
      short_name: 'FeGrro Brygadzista',
      description: 'Panel brygadzisty - FeGrro',
      start_url: '/foreman',
      scope: '/',
      display: 'standalone',
      background_color: '#0B1120',
      theme_color: '#0B1120',
      orientation: 'any',
      icons: [
        { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    };
    const blob = new Blob([JSON.stringify(m)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    return () => {
      URL.revokeObjectURL(url);
      if (original) link.setAttribute('href', original);
    };
  }, []);

  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim() || !password) {
      setError('Podaj imię, nazwisko oraz hasło');
      return;
    }

    setLoading(true);
    const fullName = `${capitalize(firstName.trim())} ${capitalize(lastName.trim())}`;
    const result = await loginForeman(fullName, password);

    if (result.success) {
      toast.success(result.message || 'Zalogowano');
      navigate('/worker/dashboard');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#131C2F] flex items-center justify-center p-6">
      <div className="absolute top-4 right-4"><LanguageToggle /></div>
      <Card className="w-full max-w-md bg-[#19243C] border-[#2A3B59] shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src="https://fegrro.pl/wp-content/uploads/2020/02/LOGO-4.svg"
              alt="FeGrro Logo"
              className="h-16"
            />
          </div>
          <CardTitle className="text-2xl font-bold text-[#5F7552]">{t('login.foreman_title')}</CardTitle>
          <CardDescription className="text-[#94A3B8]">{t('login.full_name')} + {t('login.password')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-[#CBD5E1]">{t('login.first_name')}</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="Jan"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))}
                required
                data-testid="foreman-first-name"
                className="bg-[#131C2F] border-[#2A3B59] text-white placeholder:text-[#64748B] text-lg h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-[#CBD5E1]">{t('login.last_name')}</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Kowalski"
                value={lastName}
                onChange={(e) => setLastName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))}
                required
                data-testid="foreman-last-name"
                className="bg-[#131C2F] border-[#2A3B59] text-white placeholder:text-[#64748B] text-lg h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#CBD5E1]">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="foreman-password"
                className="bg-[#131C2F] border-[#2A3B59] text-white placeholder:text-[#64748B] text-lg h-12"
              />
            </div>
            {error && (
              <div className="text-red-400 text-sm bg-red-900/30 p-3 rounded-lg border border-red-800" data-testid="foreman-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-[#4F6343] hover:bg-[#3F5235] text-white h-12 text-lg font-semibold"
              disabled={loading}
              data-testid="foreman-login-btn"
            >
              {loading ? t('common.loading') : t('login.sign_in')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
