import React, { useState, useEffect } from 'react';
import { api } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import {
  RefreshCw, AlertTriangle, Link as LinkIcon,
  Copy, ExternalLink, Warehouse, Trash2, Key, Save,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTH_NAMES = [
  'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien',
];

const FakturowniaActions = ({ onChange }) => {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.post('/finance/test-fakturownia');
      setTestResult(r.data);
      if (r.data.ok) toast.success(`Polaczenie OK: ${r.data.company_name || r.data.prefix}`);
      else toast.error(r.data.error);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad testu');
    } finally { setTesting(false); }
  };

  const sync = async () => {
    if (!window.confirm(
      'Pobrac WSZYSTKIE faktury kosztowe z Fakturowni od stycznia 2026 do biezacego miesiaca?\n\n' +
      'Pierwszy import moze potrwac kilkanascie sekund. ' +
      'Idempotentnie - powtarzanie nie dubluje istniejacych pozycji.'
    )) return;
    setSyncing(true);
    try {
      const r = await api.post('/finance/sync-from-fakturownia?from_year=2026&from_month=1');
      toast.success(`Pobrano ${r.data.invoices_fetched} faktur z ${r.data.months_processed} miesiecy: ${r.data.positions_created} nowych + ${r.data.positions_updated} zaktualizowanych`);
      onChange && onChange();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad pobierania');
    } finally { setSyncing(false); }
  };

  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-[#334155] mt-2">
      <Button onClick={test} disabled={testing} variant="outline"
        className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] hover:text-white"
        data-testid="fakturownia-test-btn">
        {testing ? 'Testowanie...' : 'Test polaczenia'}
      </Button>
      <Button onClick={sync} disabled={syncing}
        className="bg-[#E8B76A] hover:bg-[#D9A656] text-[#1E293B] font-semibold"
        data-testid="fakturownia-sync-btn">
        {syncing ? 'Pobieranie...' : 'Pobierz faktury (od stycznia 2026)'}
      </Button>
      {testResult && testResult.ok && (
        <span className="text-xs text-[#5F7151] self-center ml-2">✓ {testResult.company_name || testResult.prefix}</span>
      )}
      {testResult && !testResult.ok && (
        <span className="text-xs text-[#DC2626] self-center ml-2">✗ {testResult.error}</span>
      )}
    </div>
  );
};

const EmployeeLinksCard = () => {
  const [employees, setEmployees] = useState([]);
  const [showOnlyWithToken, setShowOnlyWithToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const r = await api.get('/employees?include_archived=false');
      setEmployees(r.data || []);
    } catch (_e) {
      toast.error('Blad pobierania pracownikow');
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchEmployees(); }, []);

  const generateAll = async () => {
    const missing = employees.filter(e => !e.public_token);
    if (missing.length === 0) {
      toast.info('Wszyscy pracownicy maja juz aktywne linki - nie ma czego generowac.');
      return;
    }
    if (!window.confirm(
      `Wygenerowac linki dla ${missing.length} pracownikow bez linku?\n\n` +
      `Istniejacych ${employees.length - missing.length} linkow NIE rusze ` +
      `— pracownicy ktorzy juz dostali link beda mogli z niego dalej korzystac.\n\n` +
      `Aby zrotowac konkretny link (uniewaznic stary), klikaj "Nowy link" przy danym pracowniku.`
    )) return;
    setBusy('all');
    try {
      let ok = 0, fail = 0;
      for (const emp of missing) {
        try { await api.post(`/employees/${emp.id}/rotate-token?force=false`); ok++; }
        catch { fail++; }
      }
      toast.success(`Wygenerowano ${ok} nowych linkow${fail > 0 ? `, blad: ${fail}` : ''}`);
      fetchEmployees();
    } finally { setBusy(null); }
  };

  const generateLink = async (emp) => {
    // Pojedynczo: rotacja (force=true), wymaga potwierdzenia jezeli juz ma link
    if (emp.public_token && !window.confirm(
      `${emp.full_name} ma juz aktywny link. Wygenerowac NOWY?\n\n` +
      `Stary link przestanie dzialac - pracownik dostanie nowy do wyslania.\n` +
      `(Przypisania ubran, BHP i godziny zostana zachowane.)`
    )) return;
    setBusy(emp.id);
    try {
      const r = await api.post(`/employees/${emp.id}/rotate-token?force=true`);
      toast.success(emp.public_token ? `Zrotowano link dla ${emp.full_name}` : `Wygenerowano link dla ${emp.full_name}`);
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, public_token: r.data.token } : e));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    } finally { setBusy(null); }
  };

  const revokeLink = async (emp) => {
    if (!window.confirm(`Uniewaznic link dla ${emp.full_name}?\n\nLink przestanie dzialac do czasu wygenerowania nowego.`)) return;
    setBusy(emp.id);
    try {
      await api.post(`/employees/${emp.id}/revoke-token`);
      toast.success(`Uniewazniono link ${emp.full_name}`);
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, public_token: null } : e));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    } finally { setBusy(null); }
  };

  const revokeAll = async () => {
    if (!window.confirm('Uniewaznic linki WSZYSTKICH pracownikow?\n\nDo czasu wygenerowania nowych nikt nie wejdzie przez stary link.')) return;
    setBusy('all-revoke');
    try {
      let ok = 0;
      for (const emp of employees) {
        if (emp.public_token) {
          try { await api.post(`/employees/${emp.id}/revoke-token`); ok++; } catch { /* skip */ }
        }
      }
      toast.success(`Uniewazniono ${ok} linkow`);
      fetchEmployees();
    } finally { setBusy(null); }
  };

  const copyLink = (emp) => {
    const url = `${window.location.origin}/worker/${emp.public_token}`;
    navigator.clipboard.writeText(url);
    toast.success('Skopiowano link do schowka');
  };

  const filtered = showOnlyWithToken ? employees.filter(e => e.public_token) : employees;
  const withTokenCount = employees.filter(e => e.public_token).length;

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
          <LinkIcon className="h-5 w-5 text-[#5F7151]" />
          Linki dla pracownikow ({withTokenCount} z {employees.length})
        </CardTitle>
        <div className="flex gap-2">
          <Button onClick={generateAll} disabled={busy === 'all'}
            className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="generate-all-links-btn">
            {busy === 'all' ? 'Generowanie...' : 'Generuj brakujace linki'}
          </Button>
          <Button onClick={revokeAll} disabled={busy === 'all-revoke' || withTokenCount === 0}
            variant="outline" className="border-[#DC2626] text-[#DC2626] hover:bg-[#7F1D1D] hover:text-white"
            data-testid="revoke-all-links-btn">
            {busy === 'all-revoke' ? '...' : 'Uniewaznij wszystkie'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 py-2 border-b border-[#334155]">
          <label className="flex items-center gap-2 text-xs text-[#94A3B8] cursor-pointer">
            <input type="checkbox" checked={showOnlyWithToken} onChange={(e) => setShowOnlyWithToken(e.target.checked)}
              className="accent-[#5F7151]" data-testid="links-filter-checkbox" />
            Pokaz tylko z aktywnym linkiem
          </label>
        </div>
        {loading ? <div className="p-4 text-[#94A3B8]">Ladowanie...</div> :
        filtered.length === 0 ? <div className="p-4 text-[#94A3B8]">{showOnlyWithToken ? 'Zaden pracownik nie ma jeszcze linku' : 'Brak aktywnych pracownikow'}</div> :
        <table className="w-full text-sm">
          <thead className="bg-[#1E293B] text-[#94A3B8] text-xs">
            <tr>
              <th className="p-2 text-left">Pracownik</th>
              <th className="p-2 text-center">Status linku</th>
              <th className="p-2 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id} className="border-t border-[#334155] hover:bg-[#1E293B]/50" data-testid={`emp-link-row-${emp.id}`}>
                <td className="p-2 text-white">{emp.full_name}</td>
                <td className="p-2 text-center">
                  {emp.public_token ? (
                    <span className="text-[#5F7151] text-xs">● Aktywny</span>
                  ) : (
                    <span className="text-[#94A3B8] text-xs">○ Brak</span>
                  )}
                </td>
                <td className="p-2 text-right">
                  <div className="flex gap-1 justify-end">
                    {emp.public_token && (
                      <Button onClick={() => copyLink(emp)} size="sm" variant="outline"
                        className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] hover:text-white h-7 px-2"
                        data-testid={`emp-copy-link-${emp.id}`}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                    <Button onClick={() => generateLink(emp)} disabled={busy === emp.id} size="sm"
                      className="bg-[#5F7151] hover:bg-[#4A5A41] text-white h-7 px-2 text-xs"
                      data-testid={`emp-generate-link-${emp.id}`}>
                      {busy === emp.id ? '...' : (emp.public_token ? 'Nowy link' : 'Generuj')}
                    </Button>
                    {emp.public_token && (
                      <Button onClick={() => revokeLink(emp)} disabled={busy === emp.id} size="sm" variant="outline"
                        className="border-[#DC2626] text-[#DC2626] hover:bg-[#7F1D1D] hover:text-white h-7 px-2 text-xs"
                        data-testid={`emp-revoke-link-${emp.id}`}>
                        Uniewaznij
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </CardContent>
    </Card>
  );
};

const FakturowniaApiCard = () => {
  const [settings, setSettings] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    try {
      const r = await api.get('/finance/settings');
      setSettings(r.data);
      setDomain(r.data.fakturownia_domain || '');
    } catch (_e) { /* ignore */ }
  };
  useEffect(() => { fetchSettings(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (apiKey.trim()) payload.fakturownia_api_key = apiKey.trim();
      payload.fakturownia_domain = domain.trim();  // zawsze wysylam, naprawia race przy 1szym setup
      await api.put('/finance/settings', payload);
      toast.success('Zapisano. Klikam Test polaczenia...');
      setApiKey('');
      // Auto-test po zapisaniu
      try {
        const t = await api.post('/finance/test-fakturownia');
        if (t.data.ok) toast.success(`Polaczenie OK: ${t.data.company_name || t.data.prefix}`);
        else toast.error(`Test nieudany: ${t.data.error}`);
      } catch (e2) {
        toast.error(e2.response?.data?.detail || 'Blad testu polaczenia');
      }
      fetchSettings();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader>
        <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
          <Key className="h-5 w-5 text-[#E8B76A]" />
          Fakturownia - API key
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[#94A3B8]">
          Klucz API z Fakturowni — uzywany do automatycznego pobierania kosztow i sprzedazy (faktury wchodzace i wychodzace).
          Auto-sync co 30 min od stycznia 2026.
          Wygeneruj na <a href="https://app.fakturownia.pl" target="_blank" rel="noreferrer" className="text-[#5F7151] underline">app.fakturownia.pl → Ustawienia → API</a>.
        </p>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">Subdomena (np. "mojafirma" dla mojafirma.fakturownia.pl)</label>
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mojafirma"
            className="bg-[#1E293B] border-[#334155] text-white" data-testid="fakturownia-domain-input" />
        </div>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1">
            Klucz API {settings?.fakturownia_api_key_set && <span className="text-[#5F7151]">(zapisany: {settings.fakturownia_api_key_preview})</span>}
          </label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.fakturownia_api_key_set ? "Wpisz nowy aby zaktualizowac" : "Wklej klucz API"}
            className="bg-[#1E293B] border-[#334155] text-white" data-testid="fakturownia-api-input" />
        </div>
        <Button onClick={save} disabled={saving} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
          data-testid="fakturownia-save-btn">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Zapisywanie...' : 'Zapisz + Test'}
        </Button>
        <FakturowniaActions onChange={fetchSettings} />
        {settings?.last_fakturownia_sync_at && (
          <p className="text-xs text-[#94A3B8] mt-2 pt-2 border-t border-[#334155]">
            Ostatni auto-sync z Fakturowni: <span className="text-[#CBD5E1]">{settings.last_fakturownia_sync_at.slice(0, 16).replace('T', ' ')}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
};

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
      <FakturowniaApiCard />
      <EmployeeLinksCard />

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
