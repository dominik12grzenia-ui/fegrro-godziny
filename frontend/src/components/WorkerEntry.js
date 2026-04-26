import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { toast } from 'sonner';

export const WorkerEntry = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { registerForeman } = useAuth();
  const navigate = useNavigate();

  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Podaj imie i nazwisko');
      return;
    }

    setLoading(true);
    const fullName = `${capitalize(firstName.trim())} ${capitalize(lastName.trim())}`;
    const result = await registerForeman(fullName);
    
    if (result.success) {
      toast.success(result.message || 'Zarejestrowano!');
      navigate('/worker/dashboard');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#1E293B] flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-[#2A384C] border-[#334155] shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img 
              src="https://fegrro.pl/wp-content/uploads/2020/02/LOGO-4.svg" 
              alt="FeGrro Logo" 
              className="h-16"
            />
          </div>
          <CardTitle className="text-2xl font-bold text-[#6B8E4E]">Rejestracja Brygadzisty</CardTitle>
          <CardDescription className="text-[#94A3B8]">Podaj swoje imie i nazwisko</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-[#CBD5E1]">Imie</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="Jan"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))}
                required
                data-testid="foreman-first-name"
                className="bg-[#1E293B] border-[#334155] text-white placeholder:text-[#64748B] text-lg h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-[#CBD5E1]">Nazwisko</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Kowalski"
                value={lastName}
                onChange={(e) => setLastName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))}
                required
                data-testid="foreman-last-name"
                className="bg-[#1E293B] border-[#334155] text-white placeholder:text-[#64748B] text-lg h-12"
              />
            </div>
            {error && (
              <div className="text-red-400 text-sm bg-red-900/30 p-3 rounded-lg border border-red-800" data-testid="foreman-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-[#5F7151] hover:bg-[#4A5A41] text-white h-12 text-lg font-semibold"
              disabled={loading}
              data-testid="foreman-register-btn"
            >
              {loading ? 'Rejestracja...' : 'Zarejestruj sie'}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-[#6B8E4E] hover:underline text-sm font-medium"
              data-testid="admin-login-link"
            >
              Panel administratora
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
