import React, { useState, useEffect } from 'react';
import { api } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import {
  RefreshCw, Download, FileText, AlertTriangle, Link as LinkIcon,
  Copy, ExternalLink, Clock, Warehouse, Trash2,
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
          Widzi sprzęt, materiały, ubrania i BHP - może wydawać i przypisywać. Każda akcja wymaga potwierdzenia.
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

      {/* OneDrive Excel Sync */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-[#5F7151]" />
            Synchronizacja Excel (OneDrive)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#94A3B8] mb-4">
            Pobierz liste pracownikow i budow z pliku "Wyplaty glowny.xlsx" na OneDrive.
            Wybierz miesiac odpowiadajacy arkuszowi w Excelu.
          </p>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select
              id="sync-month"
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              defaultValue={new Date().getMonth() + 1}
              data-testid="sync-month-select"
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              id="sync-year"
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              defaultValue={new Date().getFullYear()}
              data-testid="sync-year-select"
            >
              {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={async () => {
                setSyncing(true);
                const month = document.getElementById('sync-month').value;
                const year = document.getElementById('sync-year').value;
                try {
                  await api.post(`/sync/excel?month=${month}&year=${year}`);
                  toast.success('Synchronizacja rozpoczeta');
                  fetchData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad synchronizacji');
                } finally {
                  setSyncing(false);
                }
              }}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              disabled={syncing}
              data-testid="sync-excel-btn"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronizacja...' : 'Pobierz z Excela'}
            </Button>
          </div>

          {syncLogs.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-[#94A3B8]">Ostatnie synchronizacje:</p>
              {syncLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-xs p-2 bg-[#1E293B] rounded border border-[#334155]">
                  <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-[#5F7151]' : log.status === 'local_only' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                  <span className="text-[#94A3B8]">{log.type}</span>
                  <span className="text-[#CBD5E1] font-medium">{log.file_name || '-'}</span>
                  {log.new_employees > 0 && <span className="text-[#5F7151]">+{log.new_employees} nowych prac.</span>}
                  {log.new_sites > 0 && <span className="text-[#5F7151]">+{log.new_sites} nowych budow</span>}
                  {log.written > 0 && <span className="text-[#5F7151]">{log.written} komorek zapisanych</span>}
                  {log.skipped > 0 && <span className="text-yellow-400">{log.skipped} pominieto</span>}
                  {log.error && <span className="text-red-400 truncate max-w-[200px]">{log.error}</span>}
                  <span className="ml-auto text-[#64748B]">{new Date(log.synced_at).toLocaleString('pl-PL')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Write Hours to Excel */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#5F7151]" />
            Zapisz godziny do Excela
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#94A3B8] mb-4">
            Zapisz sumy godzin pracownikow (per budowa) do kolumn S-Z lub zaliczki do kolumny G w pliku Excel na OneDrive.
          </p>
          <div className="bg-[#92400E]/20 border border-[#F59E0B] rounded-lg p-3 mb-4 flex items-start gap-2" data-testid="excel-warning-banner">
            <AlertTriangle className="h-5 w-5 text-[#F59E0B] shrink-0 mt-0.5" />
            <p className="text-[#FCD34D] text-sm">
              <strong>Zamknij plik Excel przed zapisem!</strong> Jesli plik "Wyplaty glowny.xlsx" jest otwarty na komputerze, zamknij go przed kliknieciem przycisku zapisu. W przeciwnym razie OneDrive zglosi konflikt.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select
              id="write-month"
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              defaultValue={new Date().getMonth() + 1}
              data-testid="write-month-select"
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              id="write-year"
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              defaultValue={new Date().getFullYear()}
              data-testid="write-year-select"
            >
              {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={async () => {
                const month = document.getElementById('write-month').value;
                const year = document.getElementById('write-year').value;
                try {
                  const res = await api.post(`/sync/write-hours?month=${month}&year=${year}`);
                  toast.success(res.data.message);
                  fetchData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad zapisu do Excela');
                }
              }}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white w-full sm:w-auto"
              data-testid="write-hours-btn"
            >
              <FileText className="h-4 w-4 mr-2" />
              Zapisz sumy do Excela
            </Button>
            <Button
              onClick={async () => {
                const month = document.getElementById('write-month').value;
                const year = document.getElementById('write-year').value;
                try {
                  const res = await api.post(`/advances/sync-excel?month=${month}&year=${year}`);
                  toast.success(res.data.message);
                  fetchData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad zapisu zaliczek do Excela');
                }
              }}
              className="bg-[#E8836A] hover:bg-[#D06B52] text-white w-full sm:w-auto"
              data-testid="write-advances-btn"
            >
              <FileText className="h-4 w-4 mr-2" />
              Zaliczki do Excela
            </Button>
            <Button
              onClick={async () => {
                const month = document.getElementById('write-month').value;
                const year = document.getElementById('write-year').value;
                try {
                  const res = await api.post(`/penalties/sync-excel?month=${month}&year=${year}`);
                  toast.success(res.data.message);
                  fetchData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad zapisu kar do Excela');
                }
              }}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white w-full sm:w-auto"
              data-testid="write-penalties-btn"
            >
              <FileText className="h-4 w-4 mr-2" />
              Kary do Excela
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PDF Generation */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Download className="h-5 w-5 text-[#5F7151]" />
            Raport PDF
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#94A3B8] mb-4">
            Wygeneruj raport godzin za wybrany miesiac. PDF zostanie zapisany w folderze "Archiwizacja" na OneDrive.
          </p>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select
              id="pdf-month"
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              defaultValue={new Date().getMonth() + 1}
              data-testid="pdf-month-select"
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              id="pdf-year"
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              defaultValue={new Date().getFullYear()}
              data-testid="pdf-year-select"
            >
              {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={async () => {
                setGeneratingPdf(true);
                const month = document.getElementById('pdf-month').value;
                const year = document.getElementById('pdf-year').value;
                try {
                  await api.post(`/reports/pdf?month=${month}&year=${year}`);
                  toast.success('PDF generowany i wysylany na OneDrive');
                  fetchData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad generowania PDF');
                } finally {
                  setGeneratingPdf(false);
                }
              }}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white w-full sm:w-auto"
              disabled={generatingPdf}
              data-testid="generate-pdf-btn"
            >
              {generatingPdf ? 'Generowanie...' : 'Generuj i wyslij na OneDrive'}
            </Button>
            <Button
              onClick={async () => {
                const month = document.getElementById('pdf-month').value;
                const year = document.getElementById('pdf-year').value;
                try {
                  const response = await api.get(`/reports/pdf/download?month=${month}&year=${year}`, {
                    responseType: 'blob',
                  });
                  const url = window.URL.createObjectURL(new Blob([response.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `Raport_${month}_${year}.pdf`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  toast.success('PDF pobrany');
                } catch (err) {
                  toast.error('Blad pobierania PDF');
                }
              }}
              variant="outline"
              className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] w-full sm:w-auto"
              data-testid="download-pdf-btn"
            >
              <Download className="h-4 w-4 mr-1" />
              Pobierz lokalnie
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Public Links for Employees */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-[#5F7151]" />
            Linki publiczne dla pracownikow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#94A3B8] mb-4">
            Wygeneruj stale linki do wgladu godzin. Wyslij link raz — pracownik ma dostep do swoich godzin na zawsze, z nawigacja po miesiacach.
          </p>
          <Button
            onClick={async () => {
              setGeneratingLinks(true);
              try {
                const res = await api.post('/employees/generate-all-links');
                setPublicLinks(res.data);
                toast.success(`Wygenerowano ${res.data.length} linkow`);
              } catch (err) {
                toast.error('Blad generowania linkow');
              } finally {
                setGeneratingLinks(false);
              }
            }}
            className="bg-[#5F7151] hover:bg-[#4A5A41] text-white mb-4"
            disabled={generatingLinks}
            data-testid="generate-links-btn"
          >
            <LinkIcon className="h-4 w-4 mr-2" />
            {generatingLinks ? 'Generowanie...' : 'Generuj linki dla wszystkich'}
          </Button>

          {publicLinks.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              <div className="flex justify-end mb-2">
                <Button
                  onClick={() => {
                    const baseUrl = window.location.origin;
                    const text = publicLinks.map((p) =>
                      `${p.full_name}${p.phone_number ? ' (' + p.phone_number + ')' : ''}: ${baseUrl}/hours/${p.token}`
                    ).join('\n');
                    navigator.clipboard.writeText(text);
                    toast.success('Skopiowano wszystkie linki');
                  }}
                  variant="outline"
                  size="sm"
                  className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
                  data-testid="copy-all-links-btn"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Kopiuj wszystkie
                </Button>
              </div>
              {publicLinks.map((link) => {
                const url = `${window.location.origin}/hours/${link.token}`;
                return (
                  <div key={link.employee_id} className="flex items-center justify-between bg-[#1E293B] rounded-lg px-3 py-2 border border-[#334155]">
                    <div className="flex-1 min-w-0">
                      <span className="text-[#CBD5E1] text-sm font-medium block truncate">{link.full_name}</span>
                      {link.phone_number && (
                        <span className="text-[#64748B] text-xs">{link.phone_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          toast.success(`Skopiowano link: ${link.full_name}`);
                        }}
                        variant="ghost"
                        size="sm"
                        className="text-[#94A3B8] hover:text-white hover:bg-[#334155] h-8 w-8 p-0"
                        data-testid={`copy-link-${link.employee_id}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        onClick={() => window.open(url, '_blank')}
                        variant="ghost"
                        size="sm"
                        className="text-[#94A3B8] hover:text-white hover:bg-[#334155] h-8 w-8 p-0"
                        data-testid={`open-link-${link.employee_id}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automatic Cron Status */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#5F7151]" />
            Automatyczny zapis (Cron)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#94A3B8] mb-4">
            Harmonogram automatyczny:<br/>
            - Codzienny sync pracownikow i budow z Excela o 06:00<br/>
            - Zapis godzin do Excela 2. dnia kazdego miesiaca o 02:00<br/>
            - Podsumowanie dnia (email do biuro@fegrro.pl) o 18:00
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 flex-wrap">
            <Button
              onClick={async () => {
                try {
                  const res = await api.get('/cron/status');
                  const d = res.data;
                  if (d.active && d.jobs) {
                    const msgs = d.jobs.map((j) =>
                      `${j.description}: ${new Date(j.next_run).toLocaleString('pl-PL')}`
                    ).join('\n');
                    toast.success(msgs, { duration: 6000 });
                  } else {
                    toast.error('Cron nie jest aktywny');
                  }
                } catch (err) {
                  toast.error('Nie mozna sprawdzic statusu crona');
                }
              }}
              variant="outline"
              className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
              data-testid="cron-status-btn"
            >
              <Clock className="h-4 w-4 mr-2" />
              Sprawdz status
            </Button>
            <Button
              onClick={async () => {
                try {
                  const res = await api.post('/cron/trigger');
                  toast.success(res.data.message);
                  fetchData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad uruchomienia crona');
                }
              }}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              data-testid="cron-trigger-btn"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Wymus zapis godzin
            </Button>
            <Button
              onClick={async () => {
                try {
                  const month = document.getElementById('write-month').value;
                  const year = document.getElementById('write-year').value;
                  await api.post(`/sync/excel?month=${month}&year=${year}`);
                  toast.success('Sync pracownikow i budow uruchomiony');
                  fetchData();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad synca');
                }
              }}
              variant="outline"
              className="border-[#5F7151] text-[#5F7151] hover:bg-[#5F7151] hover:text-white"
              data-testid="cron-sync-btn"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Wymus sync pracownikow
            </Button>
            <Button
              onClick={async () => {
                try {
                  const res = await api.post('/cron/daily-summary');
                  toast.success(`Podsumowanie wyslane (${res.data.result?.total_today ?? 0} zamowien dzis)`);
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Blad wysylki podsumowania');
                }
              }}
              className="bg-[#E8B76A] hover:bg-[#C79B58] text-[#1E293B] font-bold"
              data-testid="cron-summary-btn"
            >
              <FileText className="h-4 w-4 mr-2" />
              Wyslij podsumowanie teraz
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ToolsTab;
