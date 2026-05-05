import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

export const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAdmin, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Stary PWA kafelek pracownika prowadzi do /login - przekieruj do godzin
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
    const workerToken = localStorage.getItem('fegrro_worker_token');
    if (isStandalone && workerToken) {
      navigate(`/hours/${workerToken}`, { replace: true });
      return;
    }
    if (!authLoading && user && user.role === 'admin') {
      navigate('/admin/dashboard');
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await loginAdmin(email, password);
    
    if (result.success) {
      navigate('/admin/dashboard');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="login-bg flex items-center justify-center p-6">
      <Card className="w-full max-w-md glass-card shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img 
              src="https://fegrro.pl/wp-content/uploads/2020/02/LOGO-4.svg" 
              alt="FeGrro Logo" 
              className="h-16"
            />
          </div>
          <CardTitle className="text-3xl font-bold text-[#6B8E4E]">Panel Administratora</CardTitle>
          <CardDescription>Zaloguj się do systemu</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@fegrro.pl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="admin-email-input"
                className="touch-target text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Hasło</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="admin-password-input"
                className="touch-target text-base"
              />
            </div>
            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg" data-testid="login-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full btn-primary"
              disabled={loading}
              data-testid="admin-login-btn"
            >
              {loading ? 'Logowanie...' : 'Zaloguj się'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
