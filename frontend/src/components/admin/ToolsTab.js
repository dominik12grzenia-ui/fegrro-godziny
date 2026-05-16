import React, { useState, useEffect } from 'react';
import { api } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import {
  RefreshCw, AlertTriangle, Link as LinkIcon,
  Copy, ExternalLink, Warehouse, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTH_NAMES = [
  'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien',
];

const WarehouseKeepersCard = () => {
  const [keepers, setKeepers] = useState([]);
  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');

  const fetchKeepers = async () => {
    try {
      const r = await api.get('/warehouse-keepers');
      setKeepers(r.data || []);
    } catch (_e) { /* ignore */ }
  };
  useEffect(() => { fetchKeepers(); }, []);

  const create = async () => {
    if (!name.trim() || !pwd || pwd.length < 4) {
      toast.error('Podaj nazwe i haslo (min. 4 znaki)');
      return;
    }
    try {
      const r = await api.post('/warehouse-keepers', { full_name: name.trim(), password: pwd });
      toast.success(r.data.message);
      setName(''); setPwd('');
      fetchKeepers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const remove = async (id, n) => {
    if (!window.confirm(`Usunac konto magazyniera "${n}"?`)) return;
    try {
      await api.delete(`/warehouse-keepers/${id}`);
      toast.success('Usunieto');
      fetchKeepers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  return (
    <Card className="bg-[#2A384C] border-[#334155]" data-testid="warehouse-keepers-card">
      <CardHeader>
        <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-[#E8B76A]" />
          Konta magazynierów (panel /magazynier)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[#94A3B8]">
          Magazynier wchodzi przez <strong>jeden link</strong> (poniżej) - bez wpisywania hasła.
          Widzi sprzęt, materiały, odzież i BHP - może wydawać i przypisywać. Każda akcja wymaga potwierdzenia.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input
            placeholder="Nazwa uzytkownika (np. Jan)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
            data-testid="warehouse-keeper-name-input"
          />
          <Input
            type="password"
            placeholder="Haslo (zapasowe logowanie)"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
            data-testid="warehouse-keeper-password-input"
          />
          <Button
            onClick={create}
            className="bg-[#E8B76A] hover:bg-[#C79B58] text-[#1E293B] font-bold"
            data-testid="warehouse-keeper-create-btn"
          >
            Dodaj / zmień hasło
          </Button>
        </div>
        {keepers.length === 0 ? (
          <p className="text-xs text-[#64748B]">Brak kont magazynierów. Dodaj pierwsze powyżej.</p>
        ) : (
          <div className="space-y-2">
            {keepers.map((k) => {
              const url = k.public_token
                ? `${window.location.origin}/magazynier/${k.public_token}`
                : null;
              return (
                <div
                  key={k.id}
                  className="bg-[#1E293B] rounded p-3 border border-[#334155] space-y-2"
                  data-testid={`warehouse-keeper-${k.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[#CBD5E1] font-medium">{k.full_name}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!window.confirm(`Wygenerować nowy link dla ${k.full_name}? Stary natychmiast przestanie działać.`)) return;
                          try {
                            await api.post(`/warehouse-keepers/${k.id}/rotate-token`);
                            toast.success('Nowy link wygenerowany');
                            fetchKeepers();
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Blad');
                          }
                        }}
                        className="text-[#E8B76A] hover:bg-[#E8B76A]/20 text-xs h-7"
                        data-testid={`warehouse-keeper-rotate-${k.id}`}
                        title="Wygeneruj nowy link"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(k.id, k.full_name)}
                        className="text-[#E8836A] hover:bg-[#7F2D2D]/30 text-xs h-7"
                        data-testid={`warehouse-keeper-delete-${k.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {url ? (
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 text-xs text-[#94A3B8] bg-[#0F172A] p-2 rounded break-all">{url}</code>
                      <Button
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          toast.success('Skopiowano link');
                        }}
                        className="bg-[#5F7151] hover:bg-[#4A5A41] text-white shrink-0"
                        data-testid={`warehouse-keeper-copy-${k.id}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#64748B]">Brak linku - kliknij ikonę odświeżania aby wygenerować.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const ToolsTab = ({
  syncing, setSyncing,
  generatingPdf, setGeneratingPdf,
  syncLogs,
  publicLinks, setPublicLinks,
  generatingLinks, setGeneratingLinks,
  fetchData,
}) => {
  return (
    <div className="space-y-4">
      {/* Shareable system links */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-[#5F7151]" />
            Linki dostępowe
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Link administratora', path: '/login', testid: 'copy-admin-link' },
            { label: 'Link brygadzisty', path: '/foreman', testid: 'copy-foreman-link' },
          ].map((item) => {
            const fullUrl = `${window.location.origin}${item.path}`;
            return (
              <div key={item.path} className="bg-[#1E293B] p-3 rounded-lg border border-[#334155]">
                <p className="text-[#CBD5E1] font-semibold text-sm mb-2">{item.label}</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs text-[#94A3B8] bg-[#0F172A] p-2 rounded break-all">{fullUrl}</code>
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(fullUrl);
                      toast.success('Skopiowano');
                    }}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white shrink-0"
                    data-testid={item.testid}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-[#64748B]">
            Te linki są stałe. Każdy brygadzista logujący się przez swój link zobaczy tylko panel brygadzisty - nie ma przełącznika do panelu admina.
          </p>
        </CardContent>
      </Card>

      <WarehouseKeepersCard />

      {/* Rotate worker tokens */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-[#E8836A]" />
            Unieważnij wszystkie linki pracowników
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#94A3B8] mb-3">
            Wygeneruje nowe tokeny dla <strong>wszystkich</strong> pracowników. Stare linki natychmiast przestaną działać.
            Po tym wejdź w zakładkę Pracownicy i wyślij nowe linki wybranym osobom.
          </p>
          <Button
            onClick={async () => {
              if (!window.confirm('Unieważnic wszystkie aktualne linki pracowników? Tej operacji nie da się cofnąć - stare linki staną się nieaktywne, trzeba będzie wysłać nowe.')) return;
              try {
                const res = await api.post('/employees/rotate-tokens');
                toast.success(res.data.message);
                fetchData();
              } catch (err) {
                toast.error(err.response?.data?.detail || 'Blad');
              }
            }}
            className="bg-[#7F2D2D] hover:bg-[#5C1F1F] text-white"
            data-testid="rotate-worker-tokens-btn"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Unieważnij i wygeneruj nowe tokeny
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ToolsTab;
