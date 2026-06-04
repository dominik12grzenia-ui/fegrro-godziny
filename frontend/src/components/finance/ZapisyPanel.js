// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { AlertCircle, AlertTriangle, ArrowLeft, BookOpen, Briefcase, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Edit2, FileBarChart, FileDown, FilePlus, FileSpreadsheet, FileText, Loader2, Mail, Pencil, Plus, Receipt, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton, PL_MONTHS_SHORT, fmtPLN, useFinanceRefresh, emitFinanceRefresh } from './_shared';

export const ZapisyPanel = ({ year, paymentFilter, setPaymentFilter }) => {
  const [month, setMonth] = useState(0); // 0 = caly rok
  const [rows, setRows] = useState([]); // mixed: invoices + standalone
  const [budowy, setBudowy] = useState([]);
  const [kody, setKody] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'cost' | 'income'
  const [expanded, setExpanded] = useState({}); // invoice_id -> bool
  const [payrollExpected, setPayrollExpected] = useState(null); // {month, year, total_koszt}
  const [syncingPayroll, setSyncingPayroll] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    kontrahent: '', netto: '', kod_id: 'PZS', budowa_id: '', budget_line_id: '', nr_faktury: '', pozycja_nazwa: '', notes: '',
  });
  // iter95dp: koszt cykliczny — checkbox + liczba miesiecy
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState(12);
  // Pozycje budzetu dla aktualnie wybranej budowy (modal)
  const [budgetLines, setBudgetLines] = useState([]);
  // Opcje budzetu (flat) dla inline dropdownow w tabeli - cache per budowa_id
  const [budgetOptionsByBudowa, setBudgetOptionsByBudowa] = useState({});

  // Auto-fetch budget options gdy uzytkownik wybierze budowe w modalu
  useEffect(() => {
    if (!form.budowa_id) { setBudgetLines([]); return; }
    api.get(`/budget/${form.budowa_id}/options-flat`)
      .then((r) => setBudgetLines(r.data?.options || []))
      .catch(() => setBudgetLines([]));
  }, [form.budowa_id]);

  // Lazy loader opcji budzetowych dla danej budowy (dla inline dropdownow w wierszach)
  const ensureBudgetOptions = useCallback((budowaId) => {
    if (!budowaId || budgetOptionsByBudowa[budowaId] !== undefined) return;
    setBudgetOptionsByBudowa(prev => ({ ...prev, [budowaId]: [] })); // placeholder zeby nie powtarzac fetcha
    api.get(`/budget/${budowaId}/options-flat`)
      .then((r) => setBudgetOptionsByBudowa(prev => ({ ...prev, [budowaId]: r.data?.options || [] })))
      .catch(() => setBudgetOptionsByBudowa(prev => ({ ...prev, [budowaId]: [] })));
  }, [budgetOptionsByBudowa]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const qs = month > 0 ? `?year=${year}&month=${month}` : `?year=${year}`;
      const [iRes, bRes, kRes] = await Promise.all([
        api.get(`/finance/invoices${qs}`),
        api.get('/finance/budowy?include_archived=true'),
        api.get('/finance/kody'),
      ]);
      setRows(iRes.data.rows);
      setBudowy(bRes.data.rows);
      setKody(kRes.data.rows);
      // Fetch oczekiwana suma wyplat (dla wybranego miesiaca lub calego roku)
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const isFutureMonth = (y, m) => y > currentYear || (y === currentYear && m > currentMonth);

      if (month > 0) {
        // Miesiac przyszly - /api/payroll zwraca tylko projekcje fixed_salary (nie realne wyplaty)
        if (isFutureMonth(year, month)) {
          setPayrollExpected(null);
        } else {
          try {
            const pRes = await api.get(`/payroll?year=${year}&month=${month}`);
            const prows = pRes.data?.rows || [];
            let totalKoszt = 0;
            for (const r of prows) {
              const rec = r.record || {};
              const comp = r.computed || {};
              const h = Number(r.total_hours) || 0;
              const rate = Number(rec.rate) || 0;
              const fixed = Number(rec.fixed_salary_amount) || 0;
              const is_fixed = !!rec.is_fixed_salary;
              const ha = is_fixed ? fixed : h * rate;
              const bonus = Number(rec.bonus_zl) || 0;
              const driver = Number(rec.driver_zl) || 0;
              const op = Number(rec.other_plus_zl) || 0;
              const om = Number(rec.other_minus_zl) || 0;
              // Kary: backend zwraca w computed.penalties_zl lub r.auto_penalties_zl
              const pen = Number(comp.penalties_zl ?? r.auto_penalties_zl) || 0;
              totalKoszt += ha + bonus + driver + op - om - pen;
            }
            setPayrollExpected({ year, month, total: totalKoszt });
          } catch { setPayrollExpected(null); }
        }
      } else {
        // Caly rok: jedno wywolanie /payroll/year-totals zamiast petli 12 GET-ow.
        // Backend juz wie ze przyszle miesiace pomijac.
        try {
          const yt = await api.get(`/payroll/year-totals?year=${year}`);
          setPayrollExpected({ year, month: 0, total: yt.data?.total || 0 });
        } catch { setPayrollExpected(null); }
      }
    } catch {
      toast.error('Błąd pobierania zapisow');
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);
  // iter95dq: auto-refresh po zmianie zapisu w innym panelu
  useFinanceRefresh(useCallback(() => fetchData(true), [fetchData]));

  // Pre-fetch opcji budzetu dla budow widocznych w wierszach (zarowno faktury+pozycje, jak i standalone zapisy)
  useEffect(() => {
    const ids = new Set();
    rows.forEach(r => {
      if (r.budowa_id) ids.add(r.budowa_id);
      if (r.positions) r.positions.forEach(p => { if (p.budowa_id) ids.add(p.budowa_id); });
    });
    ids.forEach(id => ensureBudgetOptions(id));
  }, [rows, ensureBudgetOptions]);

  const budowaName = (id) => budowy.find(b => b.id === id)?.name || '-';
  const kodName = (id) => kody.find(k => k.id === id)?.name || id;

  const submit = async () => {
    if (!form.date || !form.netto || !form.kod_id) { toast.error('Wypelnij date, kwote, kod'); return; }
    try {
      const payload = {
        date: form.date,
        kontrahent: form.kontrahent,
        netto: parseFloat(form.netto),
        kod_id: form.kod_id,
        budowa_id: form.budowa_id || null,
        budget_line_id: form.budget_line_id || null,
        nr_faktury: form.nr_faktury,
        pozycja_nazwa: form.pozycja_nazwa,
        notes: form.notes,
      };
      if (editing) {
        await api.put(`/finance/zapisy/${editing.id}`, payload);
        toast.success('Zaktualizowano');
      } else if (isRecurring) {
        // iter95dp: koszt cykliczny — backend generuje N wpisow miesiecznych
        const n = Math.max(1, Math.min(120, parseInt(recurringMonths, 10) || 1));
        const r = await api.post('/finance/zapisy/recurring', { ...payload, months: n });
        const c = r.data?.created_count ?? n;
        const s = r.data?.skipped_count ?? 0;
        toast.success(`Dodano koszt cykliczny: ${c} mc${s > 0 ? ` (pominięto ${s} zamknięt${s === 1 ? 'y' : 'ych'} okres${s === 1 ? '' : 'ów'})` : ''}`);
      } else {
        await api.post('/finance/zapisy', payload);
        toast.success('Dodano zapis');
      }
      setShowAdd(false); setEditing(null);
      setForm({ date: new Date().toISOString().slice(0, 10), kontrahent: '', netto: '', kod_id: 'PZS', budowa_id: '', budget_line_id: '', nr_faktury: '', pozycja_nazwa: '', notes: '' });
      setIsRecurring(false); setRecurringMonths(12);
      fetchData(true);
      emitFinanceRefresh('zapisy:submit');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const openEdit = (z) => {
    setEditing(z);
    setForm({
      date: z.date, kontrahent: z.kontrahent || '', netto: String(z.netto),
      kod_id: z.kod_id || 'PZS', budowa_id: z.budowa_id || '',
      budget_line_id: z.budget_line_id || '',
      nr_faktury: z.nr_faktury || '', pozycja_nazwa: z.pozycja_nazwa || '', notes: z.notes || '',
    });
    setShowAdd(true);
  };

  // Quick assign dla pozycji (finance_zapisy)
  // Lokalna aktualizacja jednej pozycji (bez fetchData - nie reloadujemy calej listy).
  // Pozycje moga byc: standalone zapis (r.id === posId) lub pozycja faktury (r.positions[i].id === posId).
  const updatePosLocal = (posId, patch) => {
    setRows(prev => prev.map(r => {
      if (r.id === posId) return { ...r, ...patch };
      if (r.positions && r.positions.length > 0) {
        const idx = r.positions.findIndex(p => p.id === posId);
        if (idx >= 0) {
          const newPositions = [...r.positions];
          newPositions[idx] = { ...newPositions[idx], ...patch };
          return { ...r, positions: newPositions };
        }
      }
      return r;
    }));
  };

  const quickAssignPos = async (z, field, value) => {
    const oldValue = z[field];
    // Optymistyczna aktualizacja - od razu odswiezamy UI
    updatePosLocal(z.id, { [field]: value || null });
    try {
      await api.put(`/finance/zapisy/${z.id}`, { [field]: value });
    } catch (e) {
      // Rollback przy bledzie
      updatePosLocal(z.id, { [field]: oldValue });
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  // Quick assign dla naglowka faktury (finance_invoices) - tez optymistyczna aktualizacja
  const quickAssignInv = async (inv, field, value) => {
    const oldValue = inv[field];
    // Optymistyczna aktualizacja - od razu odswiezamy UI
    setRows(prev => prev.map(r =>
      r.is_invoice && r.id === inv.id ? { ...r, [field]: value || null } : r,
    ));
    try {
      const payload = {};
      if (field === 'kod_id') {
        if (!value) payload.clear_kod = true;
        else payload.kod_id = value;
      } else if (field === 'budowa_id') {
        if (!value) payload.clear_budowa = true;
        else payload.budowa_id = value;
      }
      await api.put(`/finance/invoices/${inv.id}`, payload);
    } catch (e) {
      // Rollback przy bledzie
      setRows(prev => prev.map(r =>
        r.is_invoice && r.id === inv.id ? { ...r, [field]: oldValue } : r,
      ));
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const remove = async (z) => {
    // iter95dp: koszt cykliczny — zapytaj czy usunąć całą grupę
    if (z.recurring_group_id) {
      const opt = window.prompt(
        `Ta pozycja należy do kosztu cyklicznego (rata ${z.recurring_index || '?'} z ${z.recurring_total || '?'}).\n\n` +
        `Wpisz:\n` +
        `  1 = usuń TYLKO tę pozycję (jedną ratę)\n` +
        `  2 = usuń WSZYSTKIE pozostałe raty z tej grupy\n` +
        `  pusto / Anuluj = nie usuwaj`,
        '1'
      );
      if (opt === '2') {
        try {
          const r = await api.delete(`/finance/zapisy/recurring/${z.recurring_group_id}`);
          toast.success(`Usunięto ${r.data.deleted} rat${r.data.skipped_locked > 0 ? ` (pominięto ${r.data.skipped_locked} z zamkniętych okresów)` : ''}`);
          fetchData(true);
          emitFinanceRefresh('zapisy:delete-recurring');
        } catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
        return;
      }
      if (opt !== '1') return;
      // fall-through: usun pojedyncza
    } else if (!window.confirm(`Usunac zapis ${z.kontrahent || ''} ${z.netto}zł?`)) return;
    try { await api.delete(`/finance/zapisy/${z.id}`); toast.success('Usunieto'); fetchData(true); emitFinanceRefresh('zapisy:delete'); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };

  const removeInvoice = async (inv) => {
    if (!window.confirm(`Usunac FAKTURE ${inv.nr_faktury || ''} (${inv.kontrahent}) ${fmtPLN(inv.netto)} i WSZYSTKIE jej pozycje?`)) return;
    try {
      const r = await api.delete(`/finance/invoices/${inv.id}`);
      toast.success(`Usunieto fakture + ${r.data.positions_deleted} pozycji`);
      fetchData(true);
      emitFinanceRefresh('zapisy:delete-invoice');
    } catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };

  // Suma netto i licznik nieprzypisanych (naglowek bez kod_id i bez pozycji z kod_id)
  const totalNetto = rows.reduce((s, r) => s + (r.netto || 0), 0);
  const isUnassignedRow = (r) => {
    if (r.is_invoice) {
      if (r.kod_id) return false;
      const anyAssignedPos = (r.positions || []).some(p => p.kod_id);
      return !anyAssignedPos;
    }
    return r.source === 'fakturownia' && !r.kod_id;
  };
  const unassignedCount = rows.filter(isUnassignedRow).length;
  const incomeCount = rows.filter(r => r.is_invoice && r.is_income).length;
  const costCount = rows.filter(r => r.is_invoice && !r.is_income).length;

  // Filtr typu
  let filteredRows = rows;
  if (filterType === 'income') {
    filteredRows = filteredRows.filter(r => r.is_invoice && r.is_income);
  } else if (filterType === 'cost') {
    filteredRows = filteredRows.filter(r => !r.is_invoice || !r.is_income);
  }
  if (filterUnassigned) {
    filteredRows = filteredRows.filter(isUnassignedRow);
  }
  // Filtr platnosci (chip'y nad tabela, sterowane tez z kafelkow Rachunku Wynikow)
  const todayISO = new Date().toISOString().slice(0, 10);
  if (paymentFilter === 'paid') {
    filteredRows = filteredRows.filter(r => r.is_invoice && r.paid);
  } else if (paymentFilter === 'overdue') {
    filteredRows = filteredRows.filter(r => r.is_invoice && !r.is_income && !r.paid && r.payment_to && r.payment_to < todayISO);
  } else if (paymentFilter === 'due') {
    filteredRows = filteredRows.filter(r => r.is_invoice && !r.is_income && !r.paid);
  } else if (paymentFilter === 'receivables') {
    filteredRows = filteredRows.filter(r => r.is_invoice && r.is_income && !r.paid);
  }
  // Liczniki dla chipow (na bazie pelnego rows, nie filteredRows)
  const paidCount = rows.filter(r => r.is_invoice && r.paid).length;
  const overdueCount = rows.filter(r => r.is_invoice && !r.is_income && !r.paid && r.payment_to && r.payment_to < todayISO).length;
  const dueCount = rows.filter(r => r.is_invoice && !r.is_income && !r.paid).length;
  const receivablesCount = rows.filter(r => r.is_invoice && r.is_income && !r.paid).length;

  const syncCurrent = async () => {
    if (!window.confirm(
      'Synchronizowac godziny i wypłaty z bieżącym miesiacem?\n\n' +
      'Tylko AKTUALNY miesiąc - nie przyszly, nie historyczne. ' +
      'Stare auto-zapisy zostana nadpisane, ale reczne wpisy nie sa ruszane.'
    )) return;
    try {
      const r = await api.post('/finance/sync-current-month', null, { timeout: 120000 });
      toast.success(`Sync OK: ${r.data.g_zapisy} godzin + ${r.data.kp_zapisy} wypłat (${r.data.total_godziny}h, ${r.data.total_kp?.toFixed(2)} zł)`);
      fetchData(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd synchronizacji');
    }
  };

  const syncAllMonths = async () => {
    if (!window.confirm(
      'Resynchronizowac WSZYSTKIE miesiące od stycznia 2026?\n\n' +
      'Stare auto-zapisy zostana nadpisane, reczne wpisy nietkniete.'
    )) return;
    setSyncingPayroll(true);
    try {
      const r = await api.post('/finance/sync-all-months?from_year=2026&from_month=1', null, { timeout: 300000 });
      toast.success(`Sync OK: ${r.data.months_processed} mc, ${fmtPLN(r.data.total_kp || 0)}`);
      fetchData(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd synchronizacji');
    } finally { setSyncingPayroll(false); }
  };

  // iter95: Propagacja przypisania budowa_id z naglowkow faktur do ich pozycji.
  // Naprawia Kolumne Q w Budzecie - alokacje sprzedazy/kosztow patrza tylko na finance_zapisy.
  const propagateBudowa = async () => {
    if (!window.confirm(
      'Propagowac przypisanie budowy z naglowkow faktur do pozycji?\n\n' +
      'Dla kazdej faktury z budowa_id, ustawia budowa_id na jej pozycjach (tylko tam gdzie pozycja nie ma wlasnego przypisania).\n' +
      'NAPRAWIA: brakujace alokacje sprzedazy/kosztow w kolumnach budzetu (m.in. Q).'
    )) return;
    try {
      const r = await api.post('/finance/backfill-invoice-budowa-to-positions', null, { timeout: 120000 });
      toast.success(`Propagacja OK: ${r.data.invoices_processed} faktur, ${r.data.positions_updated} pozycji zaktualizowanych`);
      fetchData(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd propagacji');
    }
  };

  // Suma KP auto-zapisanych w zapisach (dla porownania z payrollExpected)
  const actualKpSum = rows.reduce((s, r) => {
    if (r.is_invoice) return s;
    if (r.kod_id === 'KP_WYNAGRODZENIA' && r.source === 'auto_payroll') return s + (r.netto || 0);
    return s;
  }, 0);
  const expectedKp = payrollExpected?.total || 0;
  const kpMismatch = payrollExpected !== null && Math.abs(actualKpSum - expectedKp) > 1.0;

  const renderKodSelect = (val, onChange, testid, isUnassignedHighlight = false) => (
    <select value={val || ''} onChange={onChange}
      className={`w-full bg-[#1E2A44] border rounded px-1 py-1 text-xs ${isUnassignedHighlight ? 'border-[#D4AF37] text-[#D4AF37]' : 'border-[#3D5378] text-white'}`}
      data-testid={testid}>
      <option value="">— przypisz kod —</option>
      {['PZS','PZSV','PPE','PV','G','KP','KBB','KSB','KSP'].map(cat => {
        const ck = kody.filter(k => k.category === cat);
        if (!ck.length) return null;
        return <optgroup key={cat} label={cat}>
          {ck.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </optgroup>;
      })}
    </select>
  );

  const renderBudowaSelect = (val, onChange, testid) => (
    <select value={val || ''} onChange={onChange}
      className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-1 py-1 text-xs"
      data-testid={testid}>
      <option value="">— bez budowy —</option>
      {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );

  // Inline dropdown - kod pozycji budzetowej. Tylko gdy budowa_id ustawiona.
  // iter83: grupowanie po Etapie (optgroup), nagłówki pozycji jako disabled separatory
  const renderBudgetCodeSelect = (budowaId, val, onChange, testid) => {
    if (!budowaId) {
      return <span className="text-[#475569] text-[10px] italic">wybierz budowę</span>;
    }
    const opts = budgetOptionsByBudowa[budowaId];
    if (opts === undefined) {
      ensureBudgetOptions(budowaId);
      return <span className="text-[#475569] text-[10px] italic">ładuję…</span>;
    }
    if (opts.length === 0) {
      return <span className="text-[#475569] text-[10px] italic">brak pozycji</span>;
    }
    // Grupowanie po Etapie
    const groups = [];
    const seen = new Map();
    opts.forEach(o => {
      const key = o.stage_name || '—';
      if (!seen.has(key)) { seen.set(key, []); groups.push(key); }
      seen.get(key).push(o);
    });
    return (
      <select value={val || ''} onChange={onChange}
        className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-1 py-1 text-xs"
        data-testid={testid}>
        <option value="">— bez kodu —</option>
        {groups.map(stageName => (
          <optgroup key={stageName} label={`ETAP: ${stageName.toUpperCase()}`}>
            {seen.get(stageName).map(opt => (
              <option
                key={opt.id}
                value={opt.disabled ? '' : opt.id}
                disabled={!!opt.disabled}
                title={`${opt.stage_name} › ${opt.position_name}`}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  };

  return (
    <Card className="bg-[#243049] border-[#3D5378]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-white">
          Faktury i zapisy ({filteredRows.length}{filteredRows.length !== rows.length ? `/${rows.length}` : ''}, suma: {fmtPLN(totalNetto)})
          {unassignedCount > 0 && !filterUnassigned && (
            <button onClick={() => setFilterUnassigned(true)}
              className="ml-3 px-2 py-0.5 text-xs bg-[#D4AF37]/20 text-[#D4AF37] rounded hover:bg-[#D4AF37]/30"
              data-testid="finance-unassigned-filter">
              {unassignedCount} bez kodu (kliknij aby przefiltrowac)
            </button>
          )}
          {filterUnassigned && (
            <button onClick={() => setFilterUnassigned(false)}
              className="ml-3 px-2 py-0.5 text-xs bg-[#3D5378] text-[#F1F5F9] rounded hover:bg-[#3D5378]">
              Pokaż wszystkie
            </button>
          )}
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtr platnosci (Fakturownia paid/overdue/due/receivables) */}
          <div className="inline-flex rounded-md overflow-hidden border border-[#3D5378]" data-testid="payment-filter-chips">
            <button onClick={() => setPaymentFilter('all')}
              className={`px-2 py-1 text-xs font-medium ${paymentFilter === 'all' ? 'bg-[#4F6343] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="payment-filter-all">
              Wszystko
            </button>
            <button onClick={() => setPaymentFilter('paid')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#3D5378] ${paymentFilter === 'paid' ? 'bg-[#4F6343] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="payment-filter-paid">
              ✓ Opłacone ({paidCount})
            </button>
            <button onClick={() => setPaymentFilter('due')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#3D5378] ${paymentFilter === 'due' ? 'bg-[#D4AF37] text-[#152033]' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="payment-filter-due">
              Do zapłaty ({dueCount})
            </button>
            <button onClick={() => setPaymentFilter('overdue')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#3D5378] ${paymentFilter === 'overdue' ? 'bg-[#9B2C2C] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="payment-filter-overdue">
              ⚠ Przeterminowane ({overdueCount})
            </button>
            <button onClick={() => setPaymentFilter('receivables')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#3D5378] ${paymentFilter === 'receivables' ? 'bg-[#5F7552] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="payment-filter-receivables">
              Kontrahenci mi do zapłaty ({receivablesCount})
            </button>
          </div>
          <div className="inline-flex rounded-md overflow-hidden border border-[#3D5378]">
            <button onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs font-medium ${filterType === 'all' ? 'bg-[#4F6343] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="finance-filter-all">
              Wszystko ({rows.length})
            </button>
            <button onClick={() => setFilterType('cost')}
              className={`px-3 py-1 text-xs font-medium border-l border-[#3D5378] ${filterType === 'cost' ? 'bg-[#DC4A3A] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="finance-filter-cost">
              Koszty ({costCount})
            </button>
            <button onClick={() => setFilterType('income')}
              className={`px-3 py-1 text-xs font-medium border-l border-[#3D5378] ${filterType === 'income' ? 'bg-[#4F6343] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
              data-testid="finance-filter-income">
              Sprzedaż ({incomeCount})
            </button>
          </div>
          <ActionButton onAction={syncCurrent} variant="outline"
            className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#3D5378] hover:text-[#D4AF37]"
            data-testid="finance-sync-current">Sync bieżący miesiąc</ActionButton>
          <ActionButton onAction={propagateBudowa} variant="outline"
            className="border-[#5F7552] text-[#5F7552] hover:bg-[#3D5378] hover:text-[#9DBC85]"
            data-testid="finance-propagate-budowa"
            title="Propaguje budowa_id z naglowkow faktur na pozycje (naprawia alokacje w kolumnie Q)">
            Propaguj budowy → pozycje
          </ActionButton>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-1 text-sm"
            data-testid="finance-zapisy-month">
            <option value="0">Caly rok</option>
            {PL_MONTHS_SHORT.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <Button onClick={() => { setEditing(null); setShowAdd(true); }}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="finance-add-zapis">
            <Plus className="h-4 w-4 mr-1" /> Dodaj zapis
          </Button>
        </div>
      </CardHeader>
      {kpMismatch && (
        <div className="mx-4 mb-3 flex items-start gap-3 rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-4 py-3 text-sm"
          data-testid="finance-payroll-mismatch-banner">
          <AlertTriangle className="h-5 w-5 text-[#9B2C2C] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#FCA5A5]">
              Niezgodność kosztu wynagrodzeń {month > 0 ? `${PL_MONTHS_SHORT[month-1]} ${year}` : `caly rok ${year}`}
            </div>
            <div className="text-[#FCA5A5]/90 text-xs mt-1">
              W zapisach: <strong>{fmtPLN(actualKpSum)}</strong> | W Wyplatach: <strong>{fmtPLN(expectedKp)}</strong> | Różnica: <strong>{fmtPLN(expectedKp - actualKpSum)}</strong>
            </div>
            <div className="text-[#FCA5A5]/60 text-xs mt-1">
              Możliwa przyczyna: brak resyncu po zmianach w Wyplatach lub w godzinach. Kliknij ponizej aby wymusić resync.
            </div>
          </div>
          <Button onClick={month > 0 ? syncCurrent : syncAllMonths} disabled={syncingPayroll}
            className="bg-[#9B2C2C] hover:bg-[#B91C1C] text-white text-xs h-8"
            data-testid="finance-payroll-mismatch-resync">
            {syncingPayroll ? 'Sync...' : (month > 0 ? 'Sync ten miesiąc' : 'Sync wszystkie')}
          </Button>
        </div>
      )}
      <CardContent className="p-0 overflow-x-auto">
        {loading && rows.length === 0 ? <div className="p-6 text-[#CBD5E1]">Ładowanie...</div> :
        rows.length === 0 ? <div className="p-6 text-[#CBD5E1]">Brak zapisow w tym okresie.</div> :
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-[#1E2A44] text-[#CBD5E1]">
            <tr>
              <th className="p-2 text-left w-8"></th>
              <th className="p-2 text-left">Data</th>
              <th className="p-2 text-left">Kontrahent / Faktura</th>
              <th className="p-2 text-left">Pozycja / Reszta</th>
              <th className="p-2 text-left">Kod kosztu</th>
              <th className="p-2 text-left">Budowa</th>
              <th className="p-2 text-left">Pozycja budżetu</th>
              <th className="p-2 text-right">Netto</th>
              <th className="p-2 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => {
              if (r.is_invoice) {
                const isOpen = !!expanded[r.id];
                const unassigned = !r.kod_id && !(r.positions || []).some(p => p.kod_id);
                const hasAssignedPositions = (r.positions || []).some(p => p.kod_id);
                return (
                  <React.Fragment key={r.id}>
                    <tr className={`border-t border-[#3D5378] hover:bg-[#1E2A44]/50 ${
                      unassigned ? 'bg-[#D4AF37]/10 ring-1 ring-inset ring-[#D4AF37]/40' : ''
                    }`} data-testid={`finance-invoice-row-${r.id}`}>
                      <td className="p-2 text-center">
                        {(r.positions || []).length > 0 && (
                          <button onClick={() => setExpanded(s => ({ ...s, [r.id]: !s[r.id] }))}
                            className="text-[#CBD5E1] hover:text-white" data-testid={`finance-invoice-toggle-${r.id}`}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-white text-xs whitespace-nowrap">{r.date}</td>
                      <td className="p-2 text-[#F1F5F9] text-xs">
                        <div className="font-semibold">{r.kontrahent || '-'}</div>
                        {r.nr_faktury && <div className="text-[#CBD5E1] text-[10px]">{r.nr_faktury}</div>}
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <span className="text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] px-1 rounded">FAKTUROWNIA</span>
                          {r.is_income && <span className="text-[10px] bg-[#4F6343]/30 text-[#5F7552] px-1 rounded">SPRZEDAŻ</span>}
                          {r.paid && (
                            <span className="text-[10px] bg-[#4F6343]/30 text-[#5F7552] px-1 rounded" title={r.payment_date ? `Zapłacono: ${r.payment_date}` : 'Zapłacona'} data-testid={`finance-invoice-paid-${r.id}`}>
                              ✓ ZAPŁACONA
                            </span>
                          )}
                          {!r.paid && r.payment_to && r.payment_to < new Date().toISOString().slice(0,10) && (
                            <span className="text-[10px] bg-[#9B2C2C]/30 text-[#FCA5A5] px-1 rounded" title={`Termin minął: ${r.payment_to}`} data-testid={`finance-invoice-overdue-${r.id}`}>
                              ⚠ PRZETERMINOWANA
                            </span>
                          )}
                          {!r.paid && r.payment_to && r.payment_to >= new Date().toISOString().slice(0,10) && (
                            <span className="text-[10px] bg-[#D4AF37]/15 text-[#D4AF37] px-1 rounded" title={`Termin do: ${r.payment_to}`}>
                              Do zapłaty: {r.payment_to}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-[#CBD5E1] text-xs italic">
                        {(r.positions || []).length} {(r.positions || []).length === 1 ? 'pozycja' : 'pozycji'}
                        {hasAssignedPositions && r.kod_id && (
                          <div className="text-[10px] text-[#D4AF37] mt-0.5" title="Naglowek faktury wnosi do aggregacji TYLKO reszte (netto - przypisane pozycje)">
                            Reszta: {fmtPLN(r.remainder_netto)}
                          </div>
                        )}
                        {hasAssignedPositions && !r.kod_id && (
                          <div className="text-[10px] text-[#CBD5E1] mt-0.5">
                            Przypisano w pozycjach: {fmtPLN(r.assigned_positions_sum)}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        {renderKodSelect(r.kod_id, (e) => quickAssignInv(r, 'kod_id', e.target.value),
                          `finance-invoice-kod-${r.id}`, unassigned)}
                      </td>
                      <td className="p-2 text-xs">
                        {renderBudowaSelect(r.budowa_id, (e) => quickAssignInv(r, 'budowa_id', e.target.value),
                          `finance-invoice-budowa-${r.id}`)}
                      </td>
                      <td className="p-2 text-xs">
                        {(() => {
                          const positions = r.positions || [];
                          // 1-pozycja: pokaz dropdown bezposrednio na poziomie naglowka (przypisuje do pozycji)
                          if (positions.length === 1) {
                            const p = positions[0];
                            const effectiveBudowaId = p.budowa_id || r.budowa_id;
                            return renderBudgetCodeSelect(
                              effectiveBudowaId,
                              p.budget_line_id,
                              async (e) => {
                                const val = e.target.value || null;
                                // Jezeli pozycja nie ma budowa_id a naglowek ma - propaguj
                                if (val && !p.budowa_id && r.budowa_id) {
                                  await quickAssignPos(p, 'budowa_id', r.budowa_id);
                                }
                                await quickAssignPos(p, 'budget_line_id', val);
                              },
                              `finance-invoice-budget-line-${r.id}`,
                            );
                          }
                          // Wiele pozycji - rozwin chevron aby przypisac
                          if (positions.length > 1) {
                            return (
                              <button
                                onClick={() => setExpanded(s => ({ ...s, [r.id]: true }))}
                                className="text-[#D4AF37] text-[10px] underline hover:text-[#FCE99A]"
                                title="Kliknij aby rozwinąć i przypisać kody do poszczególnych pozycji"
                                data-testid={`finance-invoice-budget-expand-${r.id}`}>
                                rozwiń ({positions.length} poz.)
                              </button>
                            );
                          }
                          return <span className="text-[#475569] text-[10px] italic">—</span>;
                        })()}
                      </td>
                      <td className="p-2 text-right text-white font-mono whitespace-nowrap font-semibold">{fmtPLN(r.netto)}</td>
                      <td className="p-2 text-right">
                        <button onClick={() => removeInvoice(r)} className="p-1 hover:bg-[#7F1D1D] rounded" title="Usuń fakture + pozycje"><Trash2 className="h-4 w-4 text-[#9B2C2C]" /></button>
                      </td>
                    </tr>
                    {isOpen && (r.positions || []).map((p) => (
                      <tr key={p.id} className="border-t border-[#3D5378] bg-[#1E2A44]/50">
                        <td></td>
                        <td className="p-2 text-[#CBD5E1] text-[10px]"></td>
                        <td className="p-2 text-[#CBD5E1] text-xs pl-6">
                          <span className="text-[#3D5378]">└</span> pozycja
                        </td>
                        <td className="p-2 text-[#F1F5F9] text-xs max-w-[200px] truncate" title={p.pozycja_nazwa}>{p.pozycja_nazwa || '-'}</td>
                        <td className="p-2 text-xs">
                          {renderKodSelect(p.kod_id, (e) => quickAssignPos(p, 'kod_id', e.target.value),
                            `finance-pos-kod-${p.id}`)}
                        </td>
                        <td className="p-2 text-xs">
                          {renderBudowaSelect(p.budowa_id, (e) => quickAssignPos(p, 'budowa_id', e.target.value),
                            `finance-pos-budowa-${p.id}`)}
                        </td>
                        <td className="p-2 text-xs">
                          {renderBudgetCodeSelect(p.budowa_id, p.budget_line_id, (e) => quickAssignPos(p, 'budget_line_id', e.target.value || null),
                            `finance-pos-budget-line-${p.id}`)}
                        </td>
                        <td className="p-2 text-right text-[#F1F5F9] font-mono whitespace-nowrap">{fmtPLN(p.netto)}</td>
                        <td className="p-2 text-right"></td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              }
              // STANDALONE zapis (manual)
              const z = r;
              const isUnassigned = z.source === 'fakturownia' && !z.kod_id;
              return (
                <tr key={z.id} className={`border-t border-[#3D5378] hover:bg-[#1E2A44]/50 ${
                  isUnassigned ? 'bg-[#D4AF37]/10 ring-1 ring-inset ring-[#D4AF37]/40' : (z.source && z.source.startsWith('auto_') ? 'bg-[#1E2A44]/40' : '')
                }`} data-testid={`finance-zapis-row-${z.id}`}>
                  <td></td>
                  <td className="p-2 text-white text-xs whitespace-nowrap">{z.date}</td>
                  <td className="p-2 text-[#F1F5F9] text-xs">
                    <div>{z.kontrahent || '-'}</div>
                    {z.nr_faktury && <div className="text-[#CBD5E1] text-[10px]">{z.nr_faktury}</div>}
                    {z.source === 'manual' && !z.recurring_group_id && <span className="inline-block mt-0.5 text-[10px] bg-[#3D5378]/40 text-[#F1F5F9] px-1 rounded">RECZNY</span>}
                    {z.source && z.source.startsWith('auto_') && <span className="inline-block mt-0.5 text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] px-1 rounded">AUTO</span>}
                    {z.recurring_group_id && (
                      <span
                        className="inline-block mt-0.5 ml-0.5 text-[10px] bg-[#4F6343]/30 text-[#9DBC85] px-1 rounded"
                        title={`Koszt cykliczny — rata ${z.recurring_index || '?'} z ${z.recurring_total || '?'}`}
                        data-testid={`finance-zapis-recurring-badge-${z.id}`}
                      >
                        🔁 {z.recurring_index || '?'}/{z.recurring_total || '?'}
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-[#F1F5F9] text-xs max-w-[200px] truncate" title={z.pozycja_nazwa}>{z.pozycja_nazwa || '-'}</td>
                  <td className="p-2 text-xs">
                    <span className="text-[#F1F5F9]">{kodName(z.kod_id)}</span>
                  </td>
                  <td className="p-2 text-xs">
                    <span className="text-[#CBD5E1]">{z.budowa_id ? budowaName(z.budowa_id) : '-'}</span>
                  </td>
                  <td className="p-2 text-xs">
                    {renderBudgetCodeSelect(z.budowa_id, z.budget_line_id, (e) => quickAssignPos(z, 'budget_line_id', e.target.value || null),
                      `finance-zapis-budget-line-${z.id}`)}
                  </td>
                  <td className="p-2 text-right text-white font-mono whitespace-nowrap">{fmtPLN(z.netto)}</td>
                  <td className="p-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(z)} className="p-1 hover:bg-[#3D5378] rounded" title="Edytuj"><Edit2 className="h-4 w-4 text-[#CBD5E1]" /></button>
                      <button onClick={() => remove(z)} className="p-1 hover:bg-[#7F1D1D] rounded" title="Usuń"><Trash2 className="h-4 w-4 text-[#9B2C2C]" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); setIsRecurring(false); } }}>
        <DialogContent className="bg-[#243049] border-[#3D5378] text-[#F1F5F9] max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto" data-testid="finance-zapis-modal">
          <DialogHeader><DialogTitle className="text-white">{editing ? 'Edytuj zapis' : 'Dodaj zapis ksiegowy'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Data</label>
              <Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}
                className="bg-[#1E2A44] border-[#3D5378] text-white" data-testid="finance-zapis-date" />
            </div>
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Nr faktury</label>
              <Input value={form.nr_faktury} onChange={(e) => setForm({...form, nr_faktury: e.target.value})}
                placeholder="FV/.../2026" className="bg-[#1E2A44] border-[#3D5378] text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#CBD5E1] block mb-1">Kontrahent</label>
              <Input value={form.kontrahent} onChange={(e) => setForm({...form, kontrahent: e.target.value})}
                placeholder="np. INWESTOR ABC" className="bg-[#1E2A44] border-[#3D5378] text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#CBD5E1] block mb-1">Pozycja (nazwa towaru/uslugi)</label>
              <Input value={form.pozycja_nazwa} onChange={(e) => setForm({...form, pozycja_nazwa: e.target.value})}
                placeholder="np. Beton B25, Stal preta fi12" className="bg-[#1E2A44] border-[#3D5378] text-white" />
            </div>
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Kod kosztu</label>
              <select value={form.kod_id} onChange={(e) => setForm({...form, kod_id: e.target.value})}
                className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-2 text-sm"
                data-testid="finance-zapis-kod">
                {['PZS','PZSV','PPE','PV','G','KP','KBB','KSB','KSP'].map(cat => {
                  const catKody = kody.filter(k => k.category === cat);
                  if (!catKody.length) return null;
                  return (
                    <optgroup key={cat} label={cat}>
                      {catKody.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Budowa (opcjonalnie)</label>
              <select value={form.budowa_id} onChange={(e) => setForm({...form, budowa_id: e.target.value, budget_line_id: ''})}
                className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-2 text-sm"
                data-testid="finance-zapis-budowa">
                <option value="">— bez budowy —</option>
                {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {form.budowa_id && budgetLines.length > 0 && (
              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">Pozycja budżetu (opcjonalnie)</label>
                <select value={form.budget_line_id} onChange={(e) => setForm({...form, budget_line_id: e.target.value})}
                  className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-2 text-sm"
                  data-testid="finance-zapis-budget-line">
                  <option value="">— bez przypisania —</option>
                  {(() => {
                    const groups = [];
                    const seen = new Map();
                    budgetLines.forEach(o => {
                      const key = o.stage_name || '—';
                      if (!seen.has(key)) { seen.set(key, []); groups.push(key); }
                      seen.get(key).push(o);
                    });
                    return groups.map(stageName => (
                      <optgroup key={stageName} label={`ETAP: ${stageName.toUpperCase()}`}>
                        {seen.get(stageName).map(opt => (
                          <option
                            key={opt.id}
                            value={opt.disabled ? '' : opt.id}
                            disabled={!!opt.disabled}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    ));
                  })()}
                </select>
              </div>
            )}
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Netto (zł)</label>
              <Input type="number" step="0.01" value={form.netto} onChange={(e) => setForm({...form, netto: e.target.value})}
                placeholder="0.00" className="no-spinner bg-[#1E2A44] border-[#3D5378] text-white"
                data-testid="finance-zapis-netto" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#CBD5E1] block mb-1">Uwagi</label>
              <Input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}
                className="bg-[#1E2A44] border-[#3D5378] text-white" />
            </div>
            {/* iter95dp: koszt cykliczny — dostepny tylko przy dodawaniu (nie edycji) */}
            {!editing && (
              <div className="col-span-2 border border-[#3D5378] rounded-lg p-3 bg-[#1E2A44]/40" data-testid="finance-zapis-recurring-section">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="accent-[#4F6343] h-4 w-4"
                    data-testid="finance-zapis-recurring-toggle"
                  />
                  <span className="text-sm text-[#F1F5F9] font-medium">
                    Koszt cykliczny — powtarzaj co miesiąc
                  </span>
                </label>
                {isRecurring && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="text-xs text-[#CBD5E1] block mb-1">Liczba miesięcy</label>
                      <Input
                        type="number"
                        min="1"
                        max="120"
                        step="1"
                        value={recurringMonths}
                        onChange={(e) => setRecurringMonths(e.target.value)}
                        className="no-spinner bg-[#1E2A44] border-[#3D5378] text-white"
                        data-testid="finance-zapis-recurring-months"
                      />
                    </div>
                    <div className="sm:col-span-2 text-xs text-[#94A3B8] leading-relaxed">
                      Powstanie <strong className="text-[#D4AF37]">{Math.max(1, parseInt(recurringMonths, 10) || 0)}</strong> zapisów po <strong className="text-[#D4AF37]">{Number(form.netto || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł</strong> netto,
                      jeden na każdy miesiąc począwszy od {form.date}.
                      Zamknięte okresy zostaną automatycznie pominięte.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}
              className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378] hover:text-white">Anuluj</Button>
            <ActionButton onAction={submit} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="finance-zapis-submit">{editing ? 'Zapisz' : (isRecurring ? `Dodaj ${Math.max(1, parseInt(recurringMonths, 10) || 0)} mc` : 'Dodaj')}</ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

