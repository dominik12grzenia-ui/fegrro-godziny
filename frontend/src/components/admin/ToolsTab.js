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
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

const FakturowniaActions = ({ onChange }) => {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const describeError = (e, fallback) => {
    if (e.response) {
      const det = e.response.data?.detail || e.response.data?.error;
      return `${fallback} (HTTP ${e.response.status}${det ? ': ' + det : ''})`;
    }
    if (e.request) return `${fallback} - brak odpowiedzi backendu (sprawdź polaczenie internetowe)`;
    return `${fallback}: ${e.message || e}`;
  };

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      // iter95dr: test moze potrwac do 30s (Fakturownia czasem zwolni przy pierwszym callu)
      const r = await api.post('/finance/test-fakturownia', null, { timeout: 60000 });
      setTestResult(r.data);
      if (r.data.ok) toast.success(`Polaczenie OK: ${r.data.company_name || r.data.prefix}`);
      else toast.error(r.data.error);
    } catch (e) {
      const msg = describeError(e, 'Błąd testu polaczenia');
      setTestResult({ ok: false, error: msg });
      toast.error(msg);
    } finally { setTesting(false); }
  };

  const sync = async () => {
    if (!window.confirm(
      'Pobrać WSZYSTKIE faktury kosztowe z Fakturowni od stycznia 2026 do biezacego miesiaca?\n\n' +
      'Pierwszy import moze potrwac kilkanascie sekund. ' +
      'Idempotentnie - powtarzanie nie dubluje istniejacych pozycji.'
    )) return;
    setSyncing(true);
    try {
      // iter95dr: sync 6+ miesiecy z Fakturowni moze trwac 10-60s. Globalny api timeout=15s
      // powoduje "brak odpowiedzi backendu" mimo ze backend nadal pracuje. Override 5 min.
      const r = await api.post('/finance/sync-from-fakturownia?from_year=2026&from_month=1', null, { timeout: 300000 });
      toast.success(`Pobrano ${r.data.invoices_fetched} faktur z ${r.data.months_processed} miesiecy: ${r.data.positions_created} nowych + ${r.data.positions_updated} zaktualizowanych`);
      onChange && onChange();
    } catch (e) {
      // iter95dr: timeout w przegladarce != porazka backendu
      if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message || '')) {
        toast.warning('Pobieranie trwa dłużej niż zwykle — sprawdź Zapisy za 1-2 minuty. Backend nadal pracuje w tle.');
      } else {
        toast.error(describeError(e, 'Błąd pobierania'));
      }
    } finally { setSyncing(false); }
  };

  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-[#3D5378] mt-2">
      <Button onClick={test} disabled={testing} variant="outline"
        className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378] hover:text-white"
        data-testid="fakturownia-test-btn">
        {testing ? 'Testowanie...' : 'Test polaczenia'}
      </Button>
      <Button onClick={sync} disabled={syncing}
        className="bg-[#D4AF37] hover:bg-[#D9A656] text-[#1E2A44] font-semibold"
        data-testid="fakturownia-sync-btn">
        {syncing ? 'Pobieranie...' : 'Pobierz faktury (od stycznia 2026)'}
      </Button>
      {testResult && testResult.ok && (
        <span className="text-xs text-[#4F6343] self-center ml-2">✓ {testResult.company_name || testResult.prefix}</span>
      )}
      {testResult && !testResult.ok && (
        <span className="text-xs text-[#9B2C2C] self-center ml-2">✗ {testResult.error}</span>
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
    try {
      const r = await api.get('/employees?include_archived=false');
      setEmployees(r.data || []);
    } catch (_e) {
      toast.error('Błąd pobierania pracownikow');
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
      `— pracownicy ktorzy juz dostali link będą mogli z niego dalej korzystac.\n\n` +
      `Aby zrotowac konkretny link (uniewaznic stary), klikaj "Nowy link" przy danym pracowniku.`
    )) return;
    setBusy('all');
    try {
      let ok = 0, fail = 0;
      for (const emp of missing) {
        try { await api.post(`/employees/${emp.id}/rotate-token?force=false`); ok++; }
        catch { fail++; }
      }
      toast.success(`Wygenerowano ${ok} nowych linkow${fail > 0 ? `, błąd: ${fail}` : ''}`);
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
      toast.error(e.response?.data?.detail || 'Błąd');
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
      toast.error(e.response?.data?.detail || 'Błąd');
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

  const toggleClothingBlock = async (emp) => {
    const newBlocked = !emp.clothing_orders_blocked;
    // Optymistyczny update + rollback przy bledzie
    setEmployees((prev) => prev.map((e) => e.id === emp.id ? { ...e, clothing_orders_blocked: newBlocked } : e));
    try {
      await api.patch(`/employees/${emp.id}/clothing-block?blocked=${newBlocked}`);
      toast.success(newBlocked
        ? `${emp.full_name} - zablokowano zamawianie odzieży`
        : `${emp.full_name} - odblokowano zamawianie odzieży`);
    } catch (e) {
      // Rollback
      setEmployees((prev) => prev.map((x) => x.id === emp.id ? { ...x, clothing_orders_blocked: !newBlocked } : x));
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const filtered = showOnlyWithToken ? employees.filter(e => e.public_token) : employees;
  const withTokenCount = employees.filter(e => e.public_token).length;

  return (
    <Card className="bg-[#243049] border-[#3D5378]">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
          <LinkIcon className="h-5 w-5 text-[#4F6343]" />
          Linki dla pracownikow ({withTokenCount} z {employees.length})
        </CardTitle>
        <div className="flex gap-2">
          <Button onClick={generateAll} disabled={busy === 'all'}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="generate-all-links-btn">
            {busy === 'all' ? 'Generowanie...' : 'Generuj brakujace linki'}
          </Button>
          <Button onClick={revokeAll} disabled={busy === 'all-revoke' || withTokenCount === 0}
            variant="outline" className="border-[#9B2C2C] text-[#9B2C2C] hover:bg-[#7F1D1D] hover:text-white"
            data-testid="revoke-all-links-btn">
            {busy === 'all-revoke' ? '...' : 'Uniewaznij wszystkie'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 py-2 border-b border-[#3D5378]">
          <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
            <input type="checkbox" checked={showOnlyWithToken} onChange={(e) => setShowOnlyWithToken(e.target.checked)}
              className="accent-[#4F6343]" data-testid="links-filter-checkbox" />
            Pokaż tylko z aktywnym linkiem
          </label>
        </div>
        {loading ? <div className="p-4 text-[#CBD5E1]">Ładowanie...</div> :
        filtered.length === 0 ? <div className="p-4 text-[#CBD5E1]">{showOnlyWithToken ? 'Zaden pracownik nie ma jeszcze linku' : 'Brak aktywnych pracownikow'}</div> :
        <table className="w-full text-sm">
          <thead className="bg-[#1E2A44] text-[#CBD5E1] text-xs">
            <tr>
              <th className="p-2 text-left">Pracownik</th>
              <th className="p-2 text-center">Status linku</th>
              <th className="p-2 text-center">Odzież</th>
              <th className="p-2 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id} className="border-t border-[#3D5378] hover:bg-[#1E2A44]/50" data-testid={`emp-link-row-${emp.id}`}>
                <td className="p-2 text-white">{emp.full_name}</td>
                <td className="p-2 text-center">
                  {emp.public_token ? (
                    <span className="text-[#4F6343] text-xs">● Aktywny</span>
                  ) : (
                    <span className="text-[#CBD5E1] text-xs">○ Brak</span>
                  )}
                </td>
                <td className="p-2 text-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer" title={emp.clothing_orders_blocked ? 'Pracownik NIE może zamawiać odzieży' : 'Pracownik może zamawiać odzież'}>
                    <input
                      type="checkbox"
                      checked={!!emp.clothing_orders_blocked}
                      onChange={() => toggleClothingBlock(emp)}
                      className="accent-[#9B2C2C] h-4 w-4"
                      data-testid={`emp-clothing-block-${emp.id}`}
                    />
                    <span className={`text-[10px] uppercase font-semibold ${emp.clothing_orders_blocked ? 'text-[#FCA5A5]' : 'text-[#CBD5E1]'}`}>
                      {emp.clothing_orders_blocked ? 'Zablokowane' : 'Dozwolone'}
                    </span>
                  </label>
                </td>
                <td className="p-2 text-right">
                  <div className="flex gap-1 justify-end">
                    {emp.public_token && (
                      <Button onClick={() => copyLink(emp)} size="sm" variant="outline"
                        className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378] hover:text-white h-7 px-2"
                        data-testid={`emp-copy-link-${emp.id}`}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                    <Button onClick={() => generateLink(emp)} disabled={busy === emp.id} size="sm"
                      className="bg-[#4F6343] hover:bg-[#3F5235] text-white h-7 px-2 text-xs"
                      data-testid={`emp-generate-link-${emp.id}`}>
                      {busy === emp.id ? '...' : (emp.public_token ? 'Nowy link' : 'Generuj')}
                    </Button>
                    {emp.public_token && (
                      <Button onClick={() => revokeLink(emp)} disabled={busy === emp.id} size="sm" variant="outline"
                        className="border-[#9B2C2C] text-[#9B2C2C] hover:bg-[#7F1D1D] hover:text-white h-7 px-2 text-xs"
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
        const det = e2.response?.data?.detail || e2.response?.data?.error;
        const status = e2.response?.status;
        const msg = status
          ? `Test nieudany (HTTP ${status}${det ? ': ' + det : ''})`
          : e2.request
            ? 'Test nieudany - brak odpowiedzi backendu'
            : `Test nieudany: ${e2.message || e2}`;
        toast.error(msg);
      }
      fetchSettings();
    } catch (e) {
      toast.error(e.response?.data?.detail || `Błąd zapisu (HTTP ${e.response?.status || '?'})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#243049] border-[#3D5378]">
      <CardHeader>
        <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
          <Key className="h-5 w-5 text-[#D4AF37]" />
          Fakturownia - API key
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[#CBD5E1]">
          Klucz API z Fakturowni — używany do automatycznego pobierania kosztów i sprzedaży (faktury wchodzace i wychodzace).
          Auto-sync co 30 min od stycznia 2026.
          Wygeneruj na <a href="https://app.fakturownia.pl" target="_blank" rel="noreferrer" className="text-[#4F6343] underline">app.fakturownia.pl → Ustawienia → API</a>.
        </p>
        <div>
          <label className="text-xs text-[#CBD5E1] block mb-1">Subdomena (np. "mojafirma" dla mojafirma.fakturownia.pl)</label>
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mojafirma"
            className="bg-[#1E2A44] border-[#3D5378] text-white" data-testid="fakturownia-domain-input" />
        </div>
        <div>
          <label className="text-xs text-[#CBD5E1] block mb-1">
            Klucz API {settings?.fakturownia_api_key_set && <span className="text-[#4F6343]">(zapisany: {settings.fakturownia_api_key_preview})</span>}
          </label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.fakturownia_api_key_set ? "Wpisz nowy aby zaktualizowac" : "Wklej klucz API"}
            className="bg-[#1E2A44] border-[#3D5378] text-white" data-testid="fakturownia-api-input" />
        </div>
        <Button onClick={save} disabled={saving} className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
          data-testid="fakturownia-save-btn">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Zapisywanie...' : 'Zapisz + Test'}
        </Button>
        <FakturowniaActions onChange={fetchSettings} />
        {settings?.last_fakturownia_sync_at && (
          <p className="text-xs text-[#CBD5E1] mt-2 pt-2 border-t border-[#3D5378]">
            Ostatni auto-sync z Fakturowni: <span className="text-[#F1F5F9]">{settings.last_fakturownia_sync_at.slice(0, 16).replace('T', ' ')}</span>
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
      toast.error('Podaj nazwe i hasło (min. 4 znaki)');
      return;
    }
    try {
      const r = await api.post('/warehouse-keepers', { full_name: name.trim(), password: pwd });
      toast.success(r.data.message);
      setName(''); setPwd('');
      fetchKeepers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const remove = async (id, n) => {
    if (!window.confirm(`Usunac konto magazyniera "${n}"?`)) return;
    try {
      await api.delete(`/warehouse-keepers/${id}`);
      toast.success('Usunieto');
      fetchKeepers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  return (
    <Card className="bg-[#243049] border-[#3D5378]" data-testid="warehouse-keepers-card">
      <CardHeader>
        <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-[#D4AF37]" />
          Konta magazynierów (panel /magazynier)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[#CBD5E1]">
          Magazynier wchodzi przez <strong>jeden link</strong> (poniżej) - bez wpisywania hasła.
          Widzi sprzęt, materiały, odzież i BHP - może wydawać i przypisywać. Każda akcja wymaga potwierdzenia.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input
            placeholder="Nazwa użytkownika (np. Jan)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]"
            data-testid="warehouse-keeper-name-input"
          />
          <Input
            type="password"
            placeholder="Hasło (zapasowe logowanie)"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]"
            data-testid="warehouse-keeper-password-input"
          />
          <Button
            onClick={create}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#1E2A44] font-bold"
            data-testid="warehouse-keeper-create-btn"
          >
            Dodaj / zmień hasło
          </Button>
        </div>
        {keepers.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">Brak kont magazynierów. Dodaj pierwsze powyżej.</p>
        ) : (
          <div className="space-y-2">
            {keepers.map((k) => {
              const url = k.public_token
                ? `${window.location.origin}/magazynier/${k.public_token}`
                : null;
              return (
                <div
                  key={k.id}
                  className="bg-[#1E2A44] rounded p-3 border border-[#3D5378] space-y-2"
                  data-testid={`warehouse-keeper-${k.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[#F1F5F9] font-medium">{k.full_name}</span>
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
                            toast.error(err.response?.data?.detail || 'Błąd');
                          }
                        }}
                        className="text-[#D4AF37] hover:bg-[#D4AF37]/20 text-xs h-7"
                        data-testid={`warehouse-keeper-rotate-${k.id}`}
                        title="Wygeneruj nowy link"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(k.id, k.full_name)}
                        className="text-[#DC4A3A] hover:bg-[#9B2C2C]/30 text-xs h-7"
                        data-testid={`warehouse-keeper-delete-${k.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {url ? (
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 text-xs text-[#CBD5E1] bg-[#152033] p-2 rounded break-all">{url}</code>
                      <Button
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          toast.success('Skopiowano link');
                        }}
                        className="bg-[#4F6343] hover:bg-[#3F5235] text-white shrink-0"
                        data-testid={`warehouse-keeper-copy-${k.id}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#94A3B8]">Brak linku - kliknij ikonę odświeżania aby wygenerować.</p>
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
      <Card className="bg-[#243049] border-[#3D5378]">
        <CardHeader>
          <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-[#4F6343]" />
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
              <div key={item.path} className="bg-[#1E2A44] p-3 rounded-lg border border-[#3D5378]">
                <p className="text-[#F1F5F9] font-semibold text-sm mb-2">{item.label}</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs text-[#CBD5E1] bg-[#152033] p-2 rounded break-all">{fullUrl}</code>
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(fullUrl);
                      toast.success('Skopiowano');
                    }}
                    className="bg-[#4F6343] hover:bg-[#3F5235] text-white shrink-0"
                    data-testid={item.testid}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-[#94A3B8]">
            Te linki są stałe. Każdy brygadzista logujący się przez swój link zobaczy tylko panel brygadzisty - nie ma przełącznika do panelu admina.
          </p>
        </CardContent>
      </Card>

      <WarehouseKeepersCard />
      <FakturowniaApiCard />
      <EmployeeLinksCard />
    </div>
  );
};

export default ToolsTab;
