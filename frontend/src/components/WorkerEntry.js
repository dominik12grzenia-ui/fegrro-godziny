import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageToggle } from './LanguageToggle';

export const WorkerEntry = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { registerForeman } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError(t('worker.enter_name'));
      return;
    }

    setLoading(true);
    const fullName = `${capitalize(firstName.trim())} ${capitalize(lastName.trim())}`;
    const result = await registerForeman(fullName);

    if (result.success) {
      toast.success(result.message || 'OK');
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
          <CardDescription className="text-[#94A3B8]">{t('login.full_name')}</CardDescription>
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
            {error && (
              <div className="text-red-400 text-sm bg-red-900/30 p-3 rounded-lg border border-red-800" data-testid="foreman-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-[#4F6343] hover:bg-[#3F5235] text-white h-12 text-lg font-semibold"
              disabled={loading}
              data-testid="foreman-register-btn"
            >
              {loading ? `${t('common.loading')}` : t('login.foreman_register')}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-[#5F7552] hover:underline text-sm font-medium"
              data-testid="admin-login-link"
            >
              {t('login.have_account') /* tymczasowo link do admina */}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
