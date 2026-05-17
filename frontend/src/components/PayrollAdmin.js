import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { ChevronDown, ChevronRight, ChevronLeft, FileText, Download, Search, UserPlus, Archive, ArchiveRestore, Trash2, Lock, Unlock, History, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { SkeletonTable } from './ui/skeletons';

const PL_MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];

const today = new Date();

export const PayrollAdmin = () => {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const nameInputRef = React.useRef(null);
  const phoneInputRef = React.useRef(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showBudowaBreakdown, setShowBudowaBreakdown] = useState(false);
  const [archived, setArchived] = useState([]);
  const [auditFor, setAuditFor] = useState(null);  // {emp_id, name}
  const [auditEntries, setAuditEntries] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);  // wynik /payroll/hours-diagnostics
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagAuto, setDiagAuto] = useState(null);  // auto-check w tle (tylko liczby) - {mismatch_count, type_issues}

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/payroll?year=${year}&month=${month}`);
      setData(res.data);
    } catch (e) {
      toast.error('Błąd pobierania wypłat');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  // Auto-check w tle: po zaladowaniu wyplat sprawdz czy sa rozbieznosci
  // (cichy fetch, tylko ustawia liczniki dla badge na kafelku).
  const checkDiagnosticsSilent = useCallback(async () => {
    try {
      const res = await api.get(`/payroll/hours-diagnostics?year=${year}&month=${month}`);
      setDiagAuto({
        mismatch_count: (res.data.mismatches || []).length,
        duplicate_count: (res.data.mismatches || []).filter(m => m.duplicate_dates.length > 0).length,
        type_issues: res.data.type_issues || 0,
        orphan_count: res.data.orphan_employee_entries || 0,
      });
    } catch {
      setDiagAuto(null);
    }
  }, [year, month]);

  const fetchArchived = useCallback(async () => {
    try {
      const res = await api.get('/employees?include_archived=true');
      setArchived(res.data.filter((e) => e.is_archived));
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchArchived(); }, [fetchArchived]);
  useEffect(() => { checkDiagnosticsSilent(); }, [checkDiagnosticsSilent]);

  const handleAdd = async () => {
    // Fallback do ref jezeli stan nie zsynchronizowany (race przy onClick)
    const name = (newName || nameInputRef.current?.value || '').trim();
    const phone = (newPhone || phoneInputRef.current?.value || '').trim();
    if (!name || name.split(/\s+/).length < 2) {
      toast.error('Podaj imię i nazwisko');
      return;
    }
    try {
      await api.post('/employees', { full_name: name, phone_number: phone || null });
      toast.success(`Dodano: ${name}`);
      setShowAdd(false); setNewName(''); setNewPhone('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd dodawania');
    }
  };

  const handleArchive = async (row) => {
    if (!window.confirm(`Zarchiwizowac ${row.full_name}?\n\nPracownik znika z aktywnych list ale jego dane pozostaja.`)) return;
    try {
      await api.post(`/employees/${row.employee_id}/archive`);
      toast.success(`Zarchiwizowano: ${row.full_name}`);
      fetchData(); fetchArchived();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd archiwizacji');
    }
  };

  const handleUnarchive = async (emp) => {
    try {
      await api.post(`/employees/${emp.id}/unarchive`);
      toast.success(`Przywrocono: ${emp.full_name}`);
      fetchData(); fetchArchived();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const handleHardDelete = async (emp) => {
    if (!window.confirm(
      `TRWALE usunac ${emp.full_name}?\n\n` +
      'Usunie wszystkie dane: godziny, zaliczki, kary, nieobecności, BHP, odzież, wypłaty.\n\n' +
      'Operacja NIEODWRACALNA.'
    )) return;
    try {
      const res = await api.delete(`/employees/${emp.id}`);
      toast.success(`Usunieto trwale: ${emp.full_name}`);
      fetchData(); fetchArchived();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd usuwania');
    }
  };

  const isLocked = !!data?.locked;
  const lockInfo = data?.lock_info;

  const handleLockToggle = async () => {
    try {
      if (isLocked) {
        if (!window.confirm(`Odblokować wypłatę za ${PL_MONTHS[month - 1]} ${year}? Pola znów będą edytowalne.`)) return;
        await api.post(`/payroll/unlock?year=${year}&month=${month}`);
        toast.success('Odblokowano - można edytować');
      } else {
        if (!window.confirm(
          `Zamknąć wypłatę za ${PL_MONTHS[month - 1]} ${year}?\n\n` +
          'Po zamknieciu pola będą tylko do odczytu - nikt nie zmodyfikuje danych. ' +
          'Mozesz w kazdej chwili odblokować.'
        )) return;
        await api.post(`/payroll/lock?year=${year}&month=${month}`);
        toast.success('Zamknieto - pola tylko do odczytu');
      }
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const openAudit = async (row) => {
    setAuditFor({ id: row.employee_id, name: row.full_name });
    setAuditEntries([]);
    try {
      const res = await api.get(`/payroll/${row.employee_id}/audit?year=${year}&month=${month}`);
      setAuditEntries(res.data.entries || []);
    } catch {
      toast.error('Błąd pobierania historii');
    }
  };

  const runDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const res = await api.get(`/payroll/hours-diagnostics?year=${year}&month=${month}`);
      setDiagnostics(res.data);
      // Zsynchronizuj badge na kafelku
      setDiagAuto({
        mismatch_count: (res.data.mismatches || []).length,
        duplicate_count: (res.data.mismatches || []).filter(m => m.duplicate_dates.length > 0).length,
        type_issues: res.data.type_issues || 0,
        orphan_count: res.data.orphan_employee_entries || 0,
      });
      const mismatch_count = (res.data.mismatches || []).length;
      if (mismatch_count === 0) {
        toast.success('Brak rozbieżności - godziny zgodne miedzy zakladkami');
      } else {
        toast.error(`Znaleziono ${mismatch_count} rozbieżności - sprawdź szczegóły`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd diagnostyki');
    } finally {
      setDiagLoading(false);
    }
  };

  const fixDuplicates = async () => {
    if (!window.confirm(
      'Naprawic duplikaty godzin w tym miesiącu?\n\n' +
      'Dla kazdego pracownika i daty zostanie zachowany TYLKO najnowszy wpis ' +
      '(po polu updated_at). Stare zostana usuniete. Operacja nieodwracalna.'
    )) return;
    setDiagLoading(true);
    try {
      const res = await api.post(`/payroll/hours-diagnostics/fix-duplicates?year=${year}&month=${month}`);
      toast.success(`Usunieto ${res.data.deleted_duplicates} duplikatow, naprawiono ${res.data.fixed_type_entries} bledow typu`);
      // Odswiez diagnostyke i dane wyplat
      await runDiagnostics();
      await fetchData();
      await checkDiagnosticsSilent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd naprawy');
    } finally {
      setDiagLoading(false);
    }
  };

  const deleteOrphans = async () => {
    if (!window.confirm(
      'Usunac wpisy godzin dla osieroconych pracownikow w tym miesiącu?\n\n' +
      'To wpisy, ktorych właściciel nie istnieje juz w bazie (np. po trwalym usunieciu pracownika). ' +
      'Operacja nieodwracalna.'
    )) return;
    setDiagLoading(true);
    try {
      const res = await api.post(`/payroll/hours-diagnostics/delete-orphans?year=${year}&month=${month}`);
      toast.success(`Usunieto ${res.data.deleted_entries} osieroconych wpisow`);
      await runDiagnostics();
      await fetchData();
      await checkDiagnosticsSilent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd usuwania');
    } finally {
      setDiagLoading(false);
    }
  };

  const fieldLabels = {
    rate: 'Stawka zł/h',
    is_fixed_salary: 'Stała pensja',
    fixed_salary_amount: 'Kwota stałej pensji',
    other_minus_zl: 'Inne -',
    bonus_zl: 'Dodatki',
    driver_zl: 'Kierowca',
    other_plus_zl: 'Inne +',
  };
  // Format polski: 25400.5 -> "25 400,5", 1234.56 -> "1 234,56", 0 -> "0"
  const fmt = (v) => {
    const n = Number(v ?? 0);
    if (!isFinite(n)) return '0';
    // Zaokraglij do 2 miejsc, usun zera, wymien kropka na przecinek, dodaj separator tysiecy
    let s = n.toFixed(2).replace(/\.?0+$/, '') || '0';
    const [intPart, decPart] = s.split('.');
    const intWithSep = parseInt(intPart, 10).toLocaleString('pl-PL').replace(/\u00A0/g, ' ');
    return decPart ? `${intWithSep},${decPart}` : intWithSep;
  };
  const fmtVal = (field, v) => {
    if (field === 'is_fixed_salary') return v ? 'TAK' : 'NIE';
    return fmt(v);
  };


  const changeMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m); setYear(y); setSelected(new Set()); setExpanded(new Set());
  };

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const visibleRows = (data?.rows || []).filter((r) =>
    !filter || r.full_name.toLowerCase().includes(filter.toLowerCase())
  );

  const toggleSelectAllVisible = () => {
    const ids = visibleRows.map((r) => r.employee_id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  // Live edit: debounced save per row
  const saveRecord = async (row, patch) => {
    setSavingId(row.employee_id);
    const newRec = { ...row.record, ...patch };
    try {
      await api.put(`/payroll/${row.employee_id}?year=${year}&month=${month}`, newRec);
      // Optimistic update of computed
      setData((d) => {
        if (!d) return d;
        const rows = d.rows.map((r) => {
          if (r.employee_id !== row.employee_id) return r;
          const rate = parseFloat(newRec.rate || 0);
          const is_fixed = !!newRec.is_fixed_salary;
          const fixed_amt = parseFloat(newRec.fixed_salary_amount || 0);
          const o_minus = parseFloat(newRec.other_minus_zl || 0);
          const bonus = parseFloat(newRec.bonus_zl || 0);
          const driver = parseFloat(newRec.driver_zl || 0);
          const o_plus = parseFloat(newRec.other_plus_zl || 0);
          const adv_auto = parseFloat(r.auto_advances_zl || 0);
          const pen_auto = parseFloat(r.auto_penalties_zl || 0);
          let hours_amount, rate_effective;
          if (is_fixed) {
            hours_amount = +fixed_amt.toFixed(2);
            rate_effective = r.total_hours > 0 ? +(fixed_amt / r.total_hours).toFixed(2) : 0;
          } else {
            hours_amount = +(r.total_hours * rate).toFixed(2);
            rate_effective = +rate.toFixed(2);
          }
          const payout = +(hours_amount - adv_auto - pen_auto - o_minus + bonus + driver + o_plus).toFixed(2);
          return { ...r, record: newRec, computed: { hours_amount, advances_zl: adv_auto, penalties_zl: pen_auto, rate_effective, payout } };
        });
        return { ...d, rows };
      });
    } catch (e) {
      toast.error('Błąd zapisu');
    } finally {
      setSavingId(null);
    }
  };

  const handleNum = (row, field, value) => {
    const num = value === '' ? 0 : parseFloat(value);
    if (Number.isNaN(num)) return;
    saveRecord(row, { [field]: num });
  };

  const handleToggleFixed = (row) => {
    saveRecord(row, { is_fixed_salary: !row.record.is_fixed_salary });
  };

  const downloadPdf = async (onlySelected) => {
    setDownloading(true);
    try {
      const body = { employee_ids: onlySelected ? Array.from(selected) : null };
      if (onlySelected && body.employee_ids.length === 0) {
        toast.error('Zaznacz przynajmniej jednego pracownika');
        setDownloading(false);
        return;
      }
      const res = await api.post(
        `/payroll/pdf?year=${year}&month=${month}`,
        body,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `wyplaty_${PL_MONTHS[month - 1]}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF wygenerowany');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd generowania PDF');
    } finally {
      setDownloading(false);
    }
  };

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const res = await api.post(
        `/payroll/pdf/report?year=${year}&month=${month}`,
        {},
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `raport_wyplat_${PL_MONTHS[month - 1]}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Raport wygenerowany');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd generowania raportu');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header: month picker + actions */}
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#4F6343]" /> Wypłaty - {PL_MONTHS[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-[#131C2F] rounded-lg border border-[#2A3B59] overflow-hidden">
              <Button variant="ghost" size="sm" onClick={() => changeMonth(-1)} className="text-white hover:bg-[#2A3B59]" data-testid="payroll-prev-month"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-[#CBD5E1] px-3 capitalize font-semibold" data-testid="payroll-month-label">{PL_MONTHS[month - 1]} {year}</span>
              <Button variant="ghost" size="sm" onClick={() => changeMonth(1)} className="text-white hover:bg-[#2A3B59]" data-testid="payroll-next-month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Szukaj pracownika..."
                className="pl-8 bg-[#131C2F] border-[#2A3B59] text-white"
                data-testid="payroll-search"
              />
            </div>
            <div className="ml-auto flex gap-2 flex-wrap">
              <Button onClick={handleLockToggle}
                className={isLocked
                  ? "bg-[#D4AF37] hover:bg-[#B8941F] text-[#131C2F] font-bold"
                  : "bg-[#2A3B59] hover:bg-[#2A3B59] text-[#CBD5E1]"}
                data-testid="payroll-lock-toggle"
              >
                {isLocked ? <><Unlock className="h-4 w-4 mr-1" /> Odblokuj miesiąc</> : <><Lock className="h-4 w-4 mr-1" /> Zamknij miesiąc</>}
              </Button>
              <Button onClick={() => setShowAdd(true)} disabled={isLocked} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="payroll-add-employee">
                <UserPlus className="h-4 w-4 mr-1" /> Dodaj pracownika
              </Button>
              <Button onClick={downloadReport} disabled={downloading}
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white" data-testid="payroll-pdf-report">
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Raport PDF
              </Button>
              <Button onClick={() => downloadPdf(true)} disabled={downloading || selected.size === 0}
                className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="payroll-pdf-selected">
                <Download className="h-4 w-4 mr-1" /> Karteczki ({selected.size})
              </Button>
              <Button onClick={() => downloadPdf(false)} disabled={downloading}
                variant="outline" className="border-[#4F6343] text-[#4F6343] hover:bg-[#2A3B59] hover:text-[#4F6343]" data-testid="payroll-pdf-all">
                <Download className="h-4 w-4 mr-1" /> Karteczki wszystkich
              </Button>
              <Button onClick={runDiagnostics} disabled={diagLoading}
                variant="outline" className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#2A3B59] hover:text-[#D4AF37]"
                data-testid="payroll-diagnostics-btn">
                Weryfikuj godziny
              </Button>
            </div>
          </div>
          {data?.totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <button
                type="button"
                onClick={() => diagAuto && (diagAuto.mismatch_count > 0 || diagAuto.type_issues > 0) ? runDiagnostics() : null}
                className={`relative bg-[#131C2F] rounded p-2 border text-left transition-colors ${
                  diagAuto && (diagAuto.mismatch_count > 0 || diagAuto.type_issues > 0)
                    ? 'border-[#D4AF37] hover:bg-[#2A3B59] cursor-pointer'
                    : 'border-[#2A3B59] cursor-default'
                }`}
                data-testid="payroll-tile-hours"
                title={
                  diagAuto && (diagAuto.mismatch_count > 0 || diagAuto.type_issues > 0)
                    ? `Wykryto ${diagAuto.mismatch_count} rozbieżności${diagAuto.duplicate_count > 0 ? `, w tym ${diagAuto.duplicate_count} z duplikatami` : ''}${diagAuto.type_issues > 0 ? `, ${diagAuto.type_issues} bledow typu` : ''}. Kliknij aby zobaczyc szczegóły.`
                    : ''
                }
              >
                <div className="text-[#94A3B8]">Suma godzin</div>
                <div className="text-white font-bold text-lg" data-testid="payroll-total-hours">{fmt(data.totals.total_hours)} h</div>
                {diagAuto && (diagAuto.mismatch_count > 0 || diagAuto.type_issues > 0) && (
                  <span
                    className="absolute top-1.5 right-1.5 flex h-3 w-3"
                    data-testid="payroll-hours-warning-badge"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4AF37] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#D4AF37]"></span>
                  </span>
                )}
              </button>
              <div className="bg-[#131C2F] rounded p-2 border border-[#2A3B59]">
                <div className="text-[#94A3B8]">Suma kwot z godzin</div>
                <div className="text-white font-bold text-lg">{fmt(data.totals.total_hours_amount)} zł</div>
              </div>
              <div className="bg-[#131C2F] rounded p-2 border border-[#DC4A3A]">
                <div className="text-[#94A3B8]">Kwota godz. - kary + dodatki + kierowca</div>
                <div className="text-[#DC4A3A] font-bold text-lg" data-testid="payroll-total-gross-net">
                  {fmt(data.rows.reduce((s, r) => s
                    + (r.computed.hours_amount || 0)
                    - (r.computed.penalties_zl || 0)
                    + (r.record.bonus_zl || 0)
                    + (r.record.driver_zl || 0), 0))} zł
                </div>
              </div>
              <div className="bg-[#131C2F] rounded p-2 border border-[#4F6343]">
                <div className="text-[#94A3B8]">Suma wypłat (po zaliczkach)</div>
                <div className="text-[#4F6343] font-bold text-lg" data-testid="payroll-total-payout">{fmt(data.totals.total_payout)} zł</div>
              </div>
            </div>
          )}
          {isLocked && (
            <div className="bg-[#D4AF37]/15 border border-[#D4AF37] rounded p-3 text-[#FCD34D] text-sm flex items-center gap-2" data-testid="payroll-locked-banner">
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                <strong>Miesiąc zamkniety</strong>
                {lockInfo && (
                  <> &middot; {lockInfo.locked_at?.slice(0, 10)} przez {lockInfo.locked_by_name}</>
                )}
                {' '}- pola sa tylko do odczytu. Kliknij <em>"Odblokuj miesiąc"</em> aby edytować.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breakdown per budowa */}
      {data && data.rows && data.rows.length > 0 && (
        <Card className="bg-[#19243C] border-[#2A3B59]">
          <CardHeader className="pb-2">
            <button
              onClick={() => setShowBudowaBreakdown((v) => !v)}
              className="flex items-center gap-2 text-[#CBD5E1] hover:text-white"
              data-testid="payroll-toggle-budowa-breakdown"
            >
              {showBudowaBreakdown ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold">Podział kosztu wynagrodzeń na budowy</span>
              <span className="text-xs text-[#94A3B8] font-normal">(pro-rata wg godzin pracownika; zaliczki nie wchodza)</span>
            </button>
          </CardHeader>
          {showBudowaBreakdown && (
            <CardContent className="p-0 overflow-x-auto">
              {(() => {
                // Koszt wynagrodzen pracownika = hours_amount + bonus + driver + other_plus - other_minus - kary
                // (zaliczka NIE jest kosztem - to wczesniejsza wyplata, kwota juz w hours_amount)
                // Alokacja pro-rata wg godzin pracownika na budowach + reszta -> "(bez budowy)"
                const budowaMap = new Map();
                const ensureBud = (id, name) => {
                  if (!budowaMap.has(id)) budowaMap.set(id, { id, name, hours: 0, koszt: 0 });
                  return budowaMap.get(id);
                };
                for (const r of data.rows) {
                  const full_h = Number(r.total_hours) || 0;
                  const sites = r.sites_breakdown || [];
                  const rec = r.record || {};
                  const ha = Number(r.computed?.hours_amount) || 0;
                  const kary = Number(r.computed?.penalties_zl || r.auto_penalties_zl) || 0;
                  const bonus = Number(rec.bonus_zl) || 0;
                  const driver = Number(rec.driver_zl) || 0;
                  const o_minus = Number(rec.other_minus_zl) || 0;
                  const o_plus = Number(rec.other_plus_zl) || 0;
                  const koszt = ha + bonus + driver + o_plus - o_minus - kary;
                  if (Math.abs(koszt) < 0.005) continue;
                  if (full_h <= 0 || sites.length === 0) {
                    const b = ensureBud(null, '(bez budowy)');
                    b.hours += full_h;
                    b.koszt += koszt;
                    continue;
                  }
                  let acc_ratio = 0;
                  for (const s of sites) {
                    const sh = Number(s.hours) || 0;
                    const ratio = full_h > 0 ? sh / full_h : 0;
                    const b = ensureBud(s.site_id || null, s.site_name || '(bez budowy)');
                    b.hours += sh;
                    b.koszt += koszt * ratio;
                    acc_ratio += ratio;
                  }
                  if (acc_ratio < 0.9999) {
                    const rem = 1 - acc_ratio;
                    const b = ensureBud(null, '(bez budowy)');
                    b.hours += full_h * rem;
                    b.koszt += koszt * rem;
                  }
                }
                const list = Array.from(budowaMap.values()).sort((a, b) => {
                  if (a.id === null) return 1;
                  if (b.id === null) return -1;
                  return (a.name || '').localeCompare(b.name || '');
                });
                const sumH = list.reduce((s, b) => s + (b.hours || 0), 0);
                const sumK = list.reduce((s, b) => s + (b.koszt || 0), 0);
                return (
                  <table className="w-full text-sm" data-testid="payroll-budowa-breakdown-table">
                    <thead className="bg-[#131C2F] text-[#94A3B8] text-xs">
                      <tr>
                        <th className="p-2 text-left">Budowa</th>
                        <th className="p-2 text-right">Godziny</th>
                        <th className="p-2 text-right text-[#DC4A3A]">Koszt wynagrodzeń</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((b, idx) => (
                        <tr key={b.id || 'none'}
                          className={`${idx % 2 === 0 ? 'bg-[#131C2F]/40' : ''} ${b.id === null ? 'border-l-2 border-l-[#D4AF37]' : ''}`}
                          data-testid={`payroll-budowa-row-${b.id || 'none'}`}>
                          <td className="p-2 text-[#CBD5E1] font-medium">
                            {b.id === null ? <span className="text-[#D4AF37]">{b.name}</span> : b.name}
                          </td>
                          <td className="p-2 text-right text-white">{fmt(b.hours)}</td>
                          <td className="p-2 text-right text-[#DC4A3A] font-semibold">{fmt(b.koszt)} zł</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[#DC4A3A] bg-[#131C2F] font-bold">
                        <td className="p-2 text-white">SUMA</td>
                        <td className="p-2 text-right text-white">{fmt(sumH)}</td>
                        <td className="p-2 text-right text-[#DC4A3A]">{fmt(sumK)} zł</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
              <div className="px-3 py-2 text-[11px] text-[#64748B] border-t border-[#2A3B59]">
                Koszt wynagrodzeń = kwota godzin + dodatki + kierowca + inne+ - inne- - kary. Zaliczki <strong>NIE</strong> sa kosztem (to wczesniejsza wypłata, kwota juz w "kwocie godzin").
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Table */}
      <Card className="bg-[#19243C] border-[#2A3B59] shadow-lg">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><SkeletonTable rows={8} cols={7} /></div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm" data-testid="payroll-table">
                <thead className="bg-[#131C2F] text-[#94A3B8] text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4 text-left border-b border-[#2A3B59]">
                      <input
                        type="checkbox"
                        checked={visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.employee_id))}
                        onChange={toggleSelectAllVisible}
                        data-testid="payroll-select-all"
                        className="h-4 w-4 accent-[#4F6343] cursor-pointer rounded"
                      />
                    </th>
                    <th className="py-3 px-4 text-left border-b border-[#2A3B59]">Pracownik</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Godziny</th>
                    <th className="py-3 px-4 text-center border-b border-[#2A3B59]">Stała</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Stawka zł/h</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Kwota godzin</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Zaliczki</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Kary</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Dodatki +</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Kierowca +</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Inne -</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Inne +</th>
                    <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Wypłata</th>
                    <th className="py-3 px-4 text-center border-b border-[#2A3B59]">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={14} className="py-6 px-4 text-center text-[#94A3B8]">Brak pracownikow</td></tr>
                  )}
                  {visibleRows.map((r, idx) => (
                    <React.Fragment key={r.employee_id}>
                      <tr className={`border-b border-[#2A3B59] hover:bg-[#131C2F]/50 transition-colors ${idx % 2 === 0 ? 'bg-[#19243C]' : 'bg-[#131C2F]/30'}`} data-testid={`payroll-row-${r.employee_id}`}>
                        <td className="py-3 px-4"><input type="checkbox" checked={selected.has(r.employee_id)} onChange={() => toggleSelected(r.employee_id)} data-testid={`payroll-check-${r.employee_id}`} className="h-4 w-4 accent-[#4F6343] cursor-pointer rounded" /></td>
                        <td className="py-3 px-4 text-[#F8FAFC] font-medium whitespace-nowrap">
                          <button onClick={() => toggleExpanded(r.employee_id)} className="flex items-center gap-1.5 hover:text-[#D4AF37] transition-colors text-left focus:outline-none">
                            {expanded.has(r.employee_id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {r.full_name}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right text-white font-semibold font-mono tabular-nums">{fmt(r.total_hours)}</td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={!!r.record.is_fixed_salary}
                            onChange={() => handleToggleFixed(r)}
                            disabled={isLocked}
                            data-testid={`payroll-fixed-${r.employee_id}`}
                            title="Stała pensja - wpisz kwote w 'Kwota godzin', stawka liczy sie automatycznie"
                            className={`h-4 w-4 accent-[#4F6343] cursor-pointer rounded ${isLocked ? 'opacity-50' : ''}`}
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {r.record.is_fixed_salary ? (
                            <span className="inline-block w-20 text-right text-[#94A3B8] text-sm pr-2" data-testid={`payroll-rate-readonly-${r.employee_id}`}>{fmt(r.computed.rate_effective)}</span>
                          ) : (
                            <NumCell row={r} field="rate" handleNum={handleNum} step="0.5" disabled={isLocked} />
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {r.record.is_fixed_salary ? (
                            <NumCell row={r} field="fixed_salary_amount" handleNum={handleNum} step="100" disabled={isLocked} />
                          ) : (
                            <span className="inline-block text-[#94A3B8]" data-testid={`payroll-hamount-${r.employee_id}`}>{fmt(r.computed.hours_amount)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums"><span className="text-[#C78B58] font-semibold" data-testid={`payroll-adv-auto-${r.employee_id}`} title="Suma z tabeli zaliczek (read-only)">{fmt(r.auto_advances_zl)}</span></td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums"><span className="text-[#FCA5A5] font-semibold" data-testid={`payroll-pen-auto-${r.employee_id}`} title="Suma z tabeli kar (read-only)">{fmt(r.auto_penalties_zl)}</span></td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums"><NumCell row={r} field="bonus_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums"><NumCell row={r} field="driver_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums"><NumCell row={r} field="other_minus_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums"><NumCell row={r} field="other_plus_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="py-3 px-4 text-right text-[#5F7552] font-bold font-mono tabular-nums whitespace-nowrap" data-testid={`payroll-payout-${r.employee_id}`}>{fmt(r.computed.payout)} zł</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            {savingId === r.employee_id && <span className="text-[#D4AF37] text-xs">...</span>}
                            <button
                              onClick={() => openAudit(r)}
                              className="p-1.5 rounded hover:bg-[#2A3B59] text-[#94A3B8] hover:text-[#D4AF37] transition-colors"
                              title="Historia zmian"
                              data-testid={`payroll-audit-${r.employee_id}`}
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleArchive(r)}
                              disabled={isLocked}
                              className={`p-1.5 rounded hover:bg-[#2A3B59] text-[#94A3B8] hover:text-[#9B2C2C] transition-colors ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                              title={isLocked ? 'Najpierw odblokuj miesiąc' : 'Zarchiwizuj'}
                              data-testid={`payroll-archive-${r.employee_id}`}
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded.has(r.employee_id) && (
                        <tr className="bg-[#0B1120] border-b border-[#2A3B59]">
                          <td colSpan={14} className="py-4 px-6">
                            <div className="text-xs uppercase tracking-wider font-semibold text-[#94A3B8] mb-3">Rozpiska godzin per budowa:</div>
                            {r.sites_breakdown.length === 0 ? (
                              <div className="text-[#64748B] text-sm">Brak godzin w tym miesiącu</div>
                            ) : (
                              <div className="flex flex-wrap gap-2.5">
                                {r.sites_breakdown.map((s) => (
                                  <span key={s.site_id || 'none'} className="px-3 py-1.5 rounded-md bg-[#131C2F] border border-[#2A3B59] shadow-sm flex items-center gap-2" data-testid={`payroll-site-${r.employee_id}-${s.site_id||'none'}`}>
                                    <span className="text-[#F8FAFC] text-sm font-medium">{s.site_name}</span>
                                    <span className="text-[#5F7552] font-bold font-mono tabular-nums bg-[#4F6343]/20 px-1.5 rounded text-xs">{s.hours} h</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archiwum */}
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-[#CBD5E1] hover:text-white"
            data-testid="payroll-toggle-archived"
          >
            {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Archive className="h-4 w-4 text-[#D4AF37]" />
            <span className="font-semibold">Archiwum pracownikow ({archived.length})</span>
          </button>
        </CardHeader>
        {showArchived && (
          <CardContent>
            {archived.length === 0 ? (
              <div className="text-[#64748B] text-sm py-2">Brak zarchiwizowanych pracownikow.</div>
            ) : (
              <div className="space-y-2" data-testid="payroll-archived-list">
                {archived.map((emp) => (
                  <div key={emp.id} className="flex items-center justify-between bg-[#131C2F] border border-[#2A3B59] rounded p-3">
                    <div>
                      <div className="text-[#CBD5E1] font-medium">{emp.full_name}</div>
                      <div className="text-xs text-[#64748B]">
                        {emp.phone_number || '(brak telefonu)'}
                        {emp.archived_at && <> &middot; zarchiwizowano {emp.archived_at.slice(0, 10)}</>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => handleUnarchive(emp)}
                        className="border-[#4F6343] text-[#4F6343] hover:bg-[#2A3B59] hover:text-[#4F6343]"
                        data-testid={`payroll-unarchive-${emp.id}`}
                      >
                        <ArchiveRestore className="h-4 w-4 mr-1" /> Przywroc
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleHardDelete(emp)}
                        className="bg-[#9b3a2a] hover:bg-[#7a2d20] text-white"
                        data-testid={`payroll-delete-${emp.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Usuń trwale
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Modal: historia zmian audytu */}
      <Dialog open={!!auditFor} onOpenChange={(o) => !o && setAuditFor(null)}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-2xl" data-testid="payroll-audit-modal">
          <DialogHeader>
            <DialogTitle className="text-white">Historia zmian - {auditFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {auditEntries.length === 0 ? (
              <div className="text-[#64748B] text-sm py-4 text-center">Brak zmian w tym miesiącu.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#131C2F] sticky top-0">
                  <tr>
                    <th className="p-2 text-left text-[#94A3B8]">Data</th>
                    <th className="p-2 text-left text-[#94A3B8]">Pole</th>
                    <th className="p-2 text-right text-[#94A3B8]">Stara</th>
                    <th className="p-2 text-right text-[#94A3B8]">Nowa</th>
                    <th className="p-2 text-left text-[#94A3B8]">Kto</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e) => (
                    <tr key={e.id} className="border-t border-[#2A3B59]">
                      <td className="p-2 text-[#CBD5E1] whitespace-nowrap">{e.changed_at.replace('T', ' ').slice(0, 16)}</td>
                      <td className="p-2 text-[#CBD5E1]">{fieldLabels[e.field] || e.field}</td>
                      <td className="p-2 text-right text-[#94A3B8] line-through">{fmtVal(e.field, e.old_value)}</td>
                      <td className="p-2 text-right text-[#4F6343] font-bold">{fmtVal(e.field, e.new_value)}</td>
                      <td className="p-2 text-[#94A3B8]">{e.changed_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditFor(null)} className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] hover:text-white">
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Modal: diagnostyka godzin */}
      <Dialog open={!!diagnostics} onOpenChange={(o) => !o && setDiagnostics(null)}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-3xl max-h-[85vh] overflow-auto" data-testid="payroll-diagnostics-modal">
          <DialogHeader>
            <DialogTitle className="text-white">Weryfikacja godzin {PL_MONTHS[month-1]} {year}</DialogTitle>
          </DialogHeader>
          {diagnostics && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="bg-[#131C2F] rounded p-2">
                  <div className="text-[#94A3B8] text-xs">Wpisy ogolem</div>
                  <div className="text-white font-bold">{diagnostics.total_entries_in_month}</div>
                </div>
                <div className="bg-[#131C2F] rounded p-2">
                  <div className="text-[#94A3B8] text-xs">Suma godz. (agregacja)</div>
                  <div className="text-white font-bold">{diagnostics.total_hours_aggregated}h</div>
                </div>
                <div className="bg-[#131C2F] rounded p-2">
                  <div className="text-[#94A3B8] text-xs">Suma godz. (grupowane)</div>
                  <div className="text-white font-bold">{diagnostics.total_hours_grouped}h</div>
                </div>
                <div className="bg-[#131C2F] rounded p-2">
                  <div className="text-[#94A3B8] text-xs">Bledy typu / sieroty</div>
                  <div className="text-white font-bold">{diagnostics.type_issues} / {diagnostics.orphan_employee_entries}</div>
                </div>
              </div>

              {diagnostics.mismatches.length === 0 ? (
                <div className="bg-[#4F6343]/20 border border-[#4F6343] rounded p-3 text-[#A7C09A] text-sm" data-testid="diagnostics-ok">
                  Wszystko sie zgadza - sumy godzin w zakladce <strong>Godziny</strong> sa identyczne jak w <strong>Wyplatach</strong>.
                </div>
              ) : (
                <>
                  <div className="bg-[#DC4A3A]/15 border border-[#DC4A3A] rounded p-3 text-[#FCD34D] text-sm">
                    Znaleziono <strong>{diagnostics.mismatches.length}</strong> rozbieżności. Po naprawie godziny będą identyczne w obu zakladkach.
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#131C2F] text-[#94A3B8]">
                        <tr>
                          <th className="p-2 text-left">Pracownik</th>
                          <th className="p-2 text-right">Agreg.</th>
                          <th className="p-2 text-right">Grupow.</th>
                          <th className="p-2 text-right">Różnica</th>
                          <th className="p-2 text-left">Duplikaty (daty)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostics.mismatches.map((m) => (
                          <tr key={m.employee_id} className="border-t border-[#2A3B59]" data-testid={`diagnostics-row-${m.employee_id}`}>
                            <td className="p-2 text-white">
                              {m.full_name}
                              {m.is_orphan && <span className="ml-1 text-[#DC4A3A]">(sierota)</span>}
                            </td>
                            <td className="p-2 text-right">{m.agg_hours}</td>
                            <td className="p-2 text-right">{m.grouped_hours}</td>
                            <td className={`p-2 text-right font-bold ${Math.abs(m.diff) >= 0.01 ? 'text-[#DC4A3A]' : 'text-[#94A3B8]'}`}>
                              {m.diff > 0 ? '+' : ''}{m.diff}
                            </td>
                            <td className="p-2 text-[#94A3B8]">
                              {m.duplicate_dates.length > 0 ? m.duplicate_dates.join(', ') : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="flex justify-between flex-wrap gap-2">
            {diagnostics && diagnostics.mismatches.some(m => m.duplicate_dates.length > 0) && (
              <Button onClick={fixDuplicates} disabled={diagLoading}
                className="bg-[#DC4A3A] hover:bg-[#D9744F] text-white"
                data-testid="diagnostics-fix-duplicates">
                Napraw duplikaty
              </Button>
            )}
            {diagnostics && diagnostics.mismatches.some(m => m.is_orphan) && (
              <Button onClick={deleteOrphans} disabled={diagLoading}
                className="bg-[#9B2C2C] hover:bg-[#B91C1C] text-white"
                data-testid="diagnostics-delete-orphans">
                Usuń wpisy osieroconych
              </Button>
            )}
            <Button variant="outline" onClick={() => setDiagnostics(null)}
              className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] hover:text-white"
              data-testid="diagnostics-close">
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1]" data-testid="payroll-add-modal">
          <DialogHeader>
            <DialogTitle className="text-white">Dodaj pracownika</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Imię i nazwisko</label>
              <Input
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jan Kowalski"
                className="bg-[#131C2F] border-[#2A3B59] text-white"
                data-testid="payroll-add-name"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Telefon (opcjonalnie)</label>
              <Input
                ref={phoneInputRef}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+48..."
                className="bg-[#131C2F] border-[#2A3B59] text-white"
                data-testid="payroll-add-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] hover:text-white">
              Anuluj
            </Button>
            <Button onClick={handleAdd} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="payroll-add-submit">
              <UserPlus className="h-4 w-4 mr-1" /> Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const NumCell = ({ row, field, handleNum, step, disabled }) => {
  const initial = row.record[field] || 0;
  return (
    <input
      type="number"
      step={step}
      min="0"
      defaultValue={initial}
      key={`${row.employee_id}-${field}-${initial}`}
      disabled={disabled}
      onBlur={(e) => {
        const v = e.target.value;
        if (parseFloat(v || 0) !== initial) handleNum(row, field, v);
      }}
      className={`no-spinner w-20 bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-1 text-right text-sm ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      data-testid={`payroll-input-${row.employee_id}-${field}`}
    />
  );
};

export default PayrollAdmin;
