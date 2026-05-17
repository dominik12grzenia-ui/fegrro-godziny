import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { ChevronDown, ChevronRight, Plus, Archive, ArchiveRestore, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const PL_MONTHS_SHORT = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paz','Lis','Gru'];

// Numerical formatter - usuwa zera po kropce: 0.00→"0", 12.50→"12.5" (dla wskaznikow, godzin)
const fmt = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0';
  return n.toFixed(2).replace(/\.?0+$/, '') || '0';
};
// Polski format PLN: 25450.5 -> "25 450,50 zł"
const fmtPLN = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0,00 zł';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
};
// Polski format bez 'zł' - do geste tabel z 12 miesiacami
const fmtNum = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0,00';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtPct = (v) => {
  const n = Number(v ?? 0) * 100;
  if (!isFinite(n)) return '0%';
  return n.toFixed(1).replace(/\.?0+$/, '') + '%';
};

const SUBTABS = [
  { id: 'budowy', label: 'Budowy' },
  { id: 'zapisy', label: 'Zapisy' },
  { id: 'rw', label: 'Rachunek wynikow' },
  { id: 'sprzedaz', label: 'Sprzedaz' },
];

// Banner ostrzegajacy o nieudanym sync z Fakturowni.
// Pollinguje co 60s zeby admin nie musial odswiezac strony.
const FakturowniaSyncWarning = () => {
  const [s, setS] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let stopped = false;
    const fetchStatus = async () => {
      try {
        const r = await api.get('/finance/settings');
        if (!stopped) setS(r.data);
      } catch (_e) { /* ignore */ }
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 60000);
    return () => { stopped = true; clearInterval(t); };
  }, []);

  if (!s || dismissed) return null;
  if (s.last_fakturownia_sync_status !== 'error') return null;
  const err = s.last_fakturownia_sync_error || 'Nieznany blad';
  const when = s.last_fakturownia_sync_at
    ? new Date(s.last_fakturownia_sync_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  return (
    <div
      data-testid="fakturownia-sync-warning"
      className="flex items-start gap-3 rounded-md border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="h-5 w-5 text-[#DC2626] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#FCA5A5]">
          Ostatni auto-sync z Fakturowni nieudany{when && ` (${when})`}
        </div>
        <div className="text-[#FCA5A5]/80 mt-1 break-words">{err}</div>
        <div className="text-[#FCA5A5]/60 text-xs mt-1">
          Sprawdz klucz API i subdomene w Narzedzia &rarr; Fakturownia. Auto-sync probuje co 30 min.
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-[#FCA5A5] hover:text-white text-xs underline"
        data-testid="fakturownia-warning-dismiss"
      >
        Ukryj
      </button>
    </div>
  );
};

export const Finance = () => {
  const [active, setActive] = useState('budowy');
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <div className="space-y-4">
      <FakturowniaSyncWarning />
      {/* Subtab nav + year picker */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#334155] pb-2">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            data-testid={`finance-subtab-${t.id}`}
            className={`px-3 py-1.5 rounded-t text-sm font-semibold transition-colors ${
              active === t.id
                ? 'bg-[#5F7151] text-white'
                : 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[#94A3B8] text-sm">Rok:</span>
          <Input
            type="number"
            min="2020" max="2099"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
            className="w-24 bg-[#1E293B] border-[#334155] text-white h-8"
            data-testid="finance-year-input"
          />
        </div>
      </div>

      {active === 'budowy' && <BudowyPanel />}
      {active === 'zapisy' && <ZapisyPanel year={year} />}
      {active === 'rw' && <RachunekWynikowPanel year={year} />}
      {active === 'sprzedaz' && <SprzedazPanel year={year} />}
    </div>
  );
};

// =========================== BUDOWY ===========================
const BudowyPanel = () => {
  const [rows, setRows] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);  // budowa or null
  const [form, setForm] = useState({ name: '', code: '', show_in_hours: true, is_gir: false, kaucja_gir_pct: 2.0, is_dw: false, kaucja_dw_pct: 2.0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/finance/budowy?include_archived=${includeArchived}`);
      setRows(res.data.rows);
    } catch {
      toast.error('Blad pobierania budow');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwe'); return; }
    try {
      if (editing) {
        await api.put(`/finance/budowy/${editing.id}`, form);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/finance/budowy', form);
        toast.success('Dodano');
      }
      setShowAdd(false); setEditing(null);
      setForm({ name: '', code: '', show_in_hours: true, is_gir: false, kaucja_gir_pct: 2.0, is_dw: false, kaucja_dw_pct: 2.0 });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      name: b.name, code: b.code || '',
      show_in_hours: !!b.show_in_hours, is_gir: !!b.is_gir,
      kaucja_gir_pct: b.kaucja_gir_pct != null ? b.kaucja_gir_pct : 2.0,
      is_dw: !!b.is_dw,
      kaucja_dw_pct: b.kaucja_dw_pct != null ? b.kaucja_dw_pct : 2.0,
    });
    setShowAdd(true);
  };

  const archive = async (b) => {
    if (!window.confirm(`Zarchiwizowac "${b.name}"?\n\nDane zapisow zostana w bazie, ale budowa zniknie z listy godzin.`)) return;
    try { await api.post(`/finance/budowy/${b.id}/archive`); toast.success('Zarchiwizowano'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Blad'); }
  };
  const unarchive = async (b) => {
    try { await api.post(`/finance/budowy/${b.id}/unarchive`); toast.success('Przywrocono'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Blad'); }
  };
  const remove = async (b) => {
    if (!window.confirm(`TRWALE usunac "${b.name}"?\n\nMozliwe tylko gdy brak zapisow finansowych.`)) return;
    try { await api.delete(`/finance/budowy/${b.id}`); toast.success('Usunieto'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Blad'); }
  };

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-white">Budowy ({rows.length})</CardTitle>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-[#94A3B8] cursor-pointer">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)}
              className="accent-[#5F7151]" data-testid="finance-show-archived" />
            Pokaz archiwalne
          </label>
          <Button onClick={() => { setEditing(null); setForm({ name:'', code:'', show_in_hours:true, is_gir:false, kaucja_gir_pct: 2.0, is_dw:false, kaucja_dw_pct: 2.0 }); setShowAdd(true); }}
            className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="finance-add-budowa">
            <Plus className="h-4 w-4 mr-1" /> Dodaj budowe
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="p-6 text-[#94A3B8]">Ladowanie...</div> :
        rows.length === 0 ? <div className="p-6 text-[#94A3B8]">Brak budow. Dodaj pierwsza.</div> :
        <table className="w-full text-sm">
          <thead className="bg-[#1E293B] text-[#94A3B8]">
            <tr>
              <th className="p-2 text-left">Nazwa</th>
              <th className="p-2 text-center">W godzinach</th>
              <th className="p-2 text-center">GIR %</th>
              <th className="p-2 text-center">DW %</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-[#334155] hover:bg-[#1E293B]/50" data-testid={`finance-budowa-row-${b.id}`}>
                <td className="p-2 text-white font-medium">{b.name}</td>
                <td className="p-2 text-center">{b.show_in_hours ? <span className="text-[#5F7151]">TAK</span> : <span className="text-[#475569]">-</span>}</td>
                <td className="p-2 text-center">{b.is_gir ? <span className="text-[#E8B76A]">{fmt(b.kaucja_gir_pct ?? 2)}%</span> : <span className="text-[#475569]">-</span>}</td>
                <td className="p-2 text-center">{b.is_dw ? <span className="text-[#E8B76A]">{fmt(b.kaucja_dw_pct ?? 2)}%</span> : <span className="text-[#475569]">-</span>}</td>
                <td className="p-2 text-center">
                  {b.is_archived ? <span className="text-[#94A3B8] text-xs">Archiwum</span> : <span className="text-[#5F7151] text-xs">Aktywna</span>}
                </td>
                <td className="p-2 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(b)} className="p-1 hover:bg-[#334155] rounded" title="Edytuj" data-testid={`finance-budowa-edit-${b.id}`}>
                      <Edit2 className="h-4 w-4 text-[#94A3B8]" />
                    </button>
                    {b.is_archived
                      ? <button onClick={() => unarchive(b)} className="p-1 hover:bg-[#334155] rounded" title="Przywroc" data-testid={`finance-budowa-unarchive-${b.id}`}><ArchiveRestore className="h-4 w-4 text-[#5F7151]" /></button>
                      : <button onClick={() => archive(b)} className="p-1 hover:bg-[#334155] rounded" title="Archiwizuj" data-testid={`finance-budowa-archive-${b.id}`}><Archive className="h-4 w-4 text-[#94A3B8]" /></button>
                    }
                    <button onClick={() => remove(b)} className="p-1 hover:bg-[#7F1D1D] rounded" title="Usun trwale" data-testid={`finance-budowa-delete-${b.id}`}><Trash2 className="h-4 w-4 text-[#DC2626]" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="bg-[#2A384C] border-[#334155] text-[#CBD5E1]" data-testid="finance-budowa-modal">
          <DialogHeader>
            <DialogTitle className="text-white">{editing ? 'Edytuj budowe' : 'Dodaj budowe'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Nazwa</label>
              <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="np. LEBA, SASINO" className="bg-[#1E293B] border-[#334155] text-white" autoFocus
                data-testid="finance-budowa-name" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-[#1E293B] rounded">
              <input type="checkbox" checked={form.show_in_hours} onChange={(e) => setForm({...form, show_in_hours: e.target.checked})}
                className="accent-[#5F7151]" data-testid="finance-budowa-show-in-hours" />
              <span>Pokaz w liscie godzin (przypisywanie pracownikow)</span>
            </label>
            <div className="flex items-center gap-2 text-sm p-2 hover:bg-[#1E293B] rounded">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={form.is_gir} onChange={(e) => setForm({...form, is_gir: e.target.checked})}
                  className="accent-[#E8B76A]" data-testid="finance-budowa-is-gir" />
                <span>Budowa GIR — Kaucja</span>
              </label>
              <Input type="number" step="0.1" min="0" max="100" value={form.kaucja_gir_pct}
                onChange={(e) => setForm({...form, kaucja_gir_pct: parseFloat(e.target.value) || 0})}
                disabled={!form.is_gir}
                className="w-20 no-spinner bg-[#1E293B] border-[#334155] text-white text-right"
                data-testid="finance-budowa-gir-pct" />
              <span className="text-[#94A3B8]">% z przychodu</span>
            </div>
            <div className="flex items-center gap-2 text-sm p-2 hover:bg-[#1E293B] rounded">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={form.is_dw} onChange={(e) => setForm({...form, is_dw: e.target.checked})}
                  className="accent-[#E8B76A]" data-testid="finance-budowa-is-dw" />
                <span>Budowa DW — Kaucja</span>
              </label>
              <Input type="number" step="0.1" min="0" max="100" value={form.kaucja_dw_pct}
                onChange={(e) => setForm({...form, kaucja_dw_pct: parseFloat(e.target.value) || 0})}
                disabled={!form.is_dw}
                className="w-20 no-spinner bg-[#1E293B] border-[#334155] text-white text-right"
                data-testid="finance-budowa-dw-pct" />
              <span className="text-[#94A3B8]">% z przychodu</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}
              className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] hover:text-white">Anuluj</Button>
            <Button onClick={submit} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="finance-budowa-submit">
              {editing ? 'Zapisz' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// =========================== ZAPISY / FAKTURY ===========================
const ZapisyPanel = ({ year }) => {
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
    kontrahent: '', netto: '', kod_id: 'PZS', budowa_id: '', nr_faktury: '', pozycja_nazwa: '', notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
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
        // Caly rok: suma TYLKO od stycznia do biezacego miesiaca wlacznie
        // (przyszle miesiace zwracaja "projekcje" fixed_salary z fallbacku - nie sa to realne wyplaty)
        try {
          const maxMonth = year < currentYear ? 12 : (year > currentYear ? 0 : currentMonth);
          let totalKoszt = 0;
          for (let m = 1; m <= maxMonth; m++) {
            const pRes = await api.get(`/payroll?year=${year}&month=${m}`);
            const prows = pRes.data?.rows || [];
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
          }
          setPayrollExpected({ year, month: 0, total: totalKoszt });
        } catch { setPayrollExpected(null); }
      }
    } catch {
      toast.error('Blad pobierania zapisow');
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        nr_faktury: form.nr_faktury,
        pozycja_nazwa: form.pozycja_nazwa,
        notes: form.notes,
      };
      if (editing) {
        await api.put(`/finance/zapisy/${editing.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/finance/zapisy', payload);
        toast.success('Dodano zapis');
      }
      setShowAdd(false); setEditing(null);
      setForm({ date: new Date().toISOString().slice(0, 10), kontrahent: '', netto: '', kod_id: 'PZS', budowa_id: '', nr_faktury: '', pozycja_nazwa: '', notes: '' });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  const openEdit = (z) => {
    setEditing(z);
    setForm({
      date: z.date, kontrahent: z.kontrahent || '', netto: String(z.netto),
      kod_id: z.kod_id || 'PZS', budowa_id: z.budowa_id || '',
      nr_faktury: z.nr_faktury || '', pozycja_nazwa: z.pozycja_nazwa || '', notes: z.notes || '',
    });
    setShowAdd(true);
  };

  // Quick assign dla pozycji (finance_zapisy)
  const quickAssignPos = async (z, field, value) => {
    try {
      await api.put(`/finance/zapisy/${z.id}`, { [field]: value });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  // Quick assign dla naglowka faktury (finance_invoices)
  const quickAssignInv = async (inv, field, value) => {
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
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  const remove = async (z) => {
    if (!window.confirm(`Usunac zapis ${z.kontrahent || ''} ${z.netto}zl?`)) return;
    try { await api.delete(`/finance/zapisy/${z.id}`); toast.success('Usunieto'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Blad'); }
  };

  const removeInvoice = async (inv) => {
    if (!window.confirm(`Usunac FAKTURE ${inv.nr_faktury || ''} (${inv.kontrahent}) ${fmtPLN(inv.netto)} i WSZYSTKIE jej pozycje?`)) return;
    try {
      const r = await api.delete(`/finance/invoices/${inv.id}`);
      toast.success(`Usunieto fakture + ${r.data.positions_deleted} pozycji`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Blad'); }
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

  const syncCurrent = async () => {
    if (!window.confirm(
      'Synchronizowac godziny i wyplaty z biezacym miesiacem?\n\n' +
      'Tylko AKTUALNY miesiac - nie przyszly, nie historyczne. ' +
      'Stare auto-zapisy zostana nadpisane, ale reczne wpisy nie sa ruszane.'
    )) return;
    try {
      const r = await api.post('/finance/sync-current-month');
      toast.success(`Sync OK: ${r.data.g_zapisy} godzin + ${r.data.kp_zapisy} wyplat (${r.data.total_godziny}h, ${r.data.total_kp?.toFixed(2)} zl)`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad synchronizacji');
    }
  };

  const syncAllMonths = async () => {
    if (!window.confirm(
      'Resynchronizowac WSZYSTKIE miesiace od stycznia 2026?\n\n' +
      'Stare auto-zapisy zostana nadpisane, reczne wpisy nietkniete.'
    )) return;
    setSyncingPayroll(true);
    try {
      const r = await api.post('/finance/sync-all-months?from_year=2026&from_month=1');
      toast.success(`Sync OK: ${r.data.months_processed} mc, ${fmtPLN(r.data.total_kp || 0)}`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad synchronizacji');
    } finally { setSyncingPayroll(false); }
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
      className={`w-full bg-[#1E293B] border rounded px-1 py-1 text-xs ${isUnassignedHighlight ? 'border-[#E8B76A] text-[#E8B76A]' : 'border-[#334155] text-white'}`}
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
      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded px-1 py-1 text-xs"
      data-testid={testid}>
      <option value="">— bez budowy —</option>
      {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-white">
          Faktury i zapisy ({filteredRows.length}{filteredRows.length !== rows.length ? `/${rows.length}` : ''}, suma: {fmtPLN(totalNetto)})
          {unassignedCount > 0 && !filterUnassigned && (
            <button onClick={() => setFilterUnassigned(true)}
              className="ml-3 px-2 py-0.5 text-xs bg-[#E8B76A]/20 text-[#E8B76A] rounded hover:bg-[#E8B76A]/30"
              data-testid="finance-unassigned-filter">
              {unassignedCount} bez kodu (kliknij aby przefiltrowac)
            </button>
          )}
          {filterUnassigned && (
            <button onClick={() => setFilterUnassigned(false)}
              className="ml-3 px-2 py-0.5 text-xs bg-[#334155] text-[#CBD5E1] rounded hover:bg-[#475569]">
              Pokaz wszystkie
            </button>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md overflow-hidden border border-[#334155]">
            <button onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs font-medium ${filterType === 'all' ? 'bg-[#5F7151] text-white' : 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155]'}`}
              data-testid="finance-filter-all">
              Wszystko ({rows.length})
            </button>
            <button onClick={() => setFilterType('cost')}
              className={`px-3 py-1 text-xs font-medium border-l border-[#334155] ${filterType === 'cost' ? 'bg-[#E8836A] text-white' : 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155]'}`}
              data-testid="finance-filter-cost">
              Koszty ({costCount})
            </button>
            <button onClick={() => setFilterType('income')}
              className={`px-3 py-1 text-xs font-medium border-l border-[#334155] ${filterType === 'income' ? 'bg-[#5F7151] text-white' : 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155]'}`}
              data-testid="finance-filter-income">
              Sprzedaz ({incomeCount})
            </button>
          </div>
          <Button onClick={syncCurrent} variant="outline"
            className="border-[#E8B76A] text-[#E8B76A] hover:bg-[#334155] hover:text-[#E8B76A]"
            data-testid="finance-sync-current">
            Sync biezacy miesiac
          </Button>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="bg-[#1E293B] border border-[#334155] text-white rounded px-2 py-1 text-sm"
            data-testid="finance-zapisy-month">
            <option value="0">Caly rok</option>
            {PL_MONTHS_SHORT.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <Button onClick={() => { setEditing(null); setShowAdd(true); }}
            className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="finance-add-zapis">
            <Plus className="h-4 w-4 mr-1" /> Dodaj zapis
          </Button>
        </div>
      </CardHeader>
      {kpMismatch && (
        <div className="mx-4 mb-3 flex items-start gap-3 rounded-md border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm"
          data-testid="finance-payroll-mismatch-banner">
          <AlertTriangle className="h-5 w-5 text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#FCA5A5]">
              Niezgodnosc kosztu wynagrodzen {month > 0 ? `${PL_MONTHS_SHORT[month-1]} ${year}` : `caly rok ${year}`}
            </div>
            <div className="text-[#FCA5A5]/90 text-xs mt-1">
              W zapisach: <strong>{fmtPLN(actualKpSum)}</strong> | W Wyplatach: <strong>{fmtPLN(expectedKp)}</strong> | Roznica: <strong>{fmtPLN(expectedKp - actualKpSum)}</strong>
            </div>
            <div className="text-[#FCA5A5]/60 text-xs mt-1">
              Mozliwa przyczyna: brak resyncu po zmianach w Wyplatach lub w godzinach. Kliknij ponizej aby wymusic resync.
            </div>
          </div>
          <Button onClick={month > 0 ? syncCurrent : syncAllMonths} disabled={syncingPayroll}
            className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs h-8"
            data-testid="finance-payroll-mismatch-resync">
            {syncingPayroll ? 'Sync...' : (month > 0 ? 'Sync ten miesiac' : 'Sync wszystkie')}
          </Button>
        </div>
      )}
      <CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-6 text-[#94A3B8]">Ladowanie...</div> :
        rows.length === 0 ? <div className="p-6 text-[#94A3B8]">Brak zapisow w tym okresie.</div> :
        <table className="w-full text-sm">
          <thead className="bg-[#1E293B] text-[#94A3B8]">
            <tr>
              <th className="p-2 text-left w-8"></th>
              <th className="p-2 text-left">Data</th>
              <th className="p-2 text-left">Kontrahent / Faktura</th>
              <th className="p-2 text-left">Pozycja / Reszta</th>
              <th className="p-2 text-left">Kod kosztu</th>
              <th className="p-2 text-left">Budowa</th>
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
                    <tr className={`border-t border-[#334155] hover:bg-[#1E293B]/50 ${
                      unassigned ? 'bg-[#E8B76A]/10 ring-1 ring-inset ring-[#E8B76A]/40' : ''
                    }`} data-testid={`finance-invoice-row-${r.id}`}>
                      <td className="p-2 text-center">
                        {(r.positions || []).length > 0 && (
                          <button onClick={() => setExpanded(s => ({ ...s, [r.id]: !s[r.id] }))}
                            className="text-[#94A3B8] hover:text-white" data-testid={`finance-invoice-toggle-${r.id}`}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-white text-xs whitespace-nowrap">{r.date}</td>
                      <td className="p-2 text-[#CBD5E1] text-xs">
                        <div className="font-semibold">{r.kontrahent || '-'}</div>
                        {r.nr_faktury && <div className="text-[#94A3B8] text-[10px]">{r.nr_faktury}</div>}
                        <span className="inline-block mt-0.5 text-[10px] bg-[#E8B76A]/20 text-[#E8B76A] px-1 rounded">FAKTUROWNIA</span>
                        {r.is_income && <span className="inline-block mt-0.5 ml-1 text-[10px] bg-[#5F7151]/30 text-[#5F7151] px-1 rounded">SPRZEDAZ</span>}
                      </td>
                      <td className="p-2 text-[#94A3B8] text-xs italic">
                        {(r.positions || []).length} {(r.positions || []).length === 1 ? 'pozycja' : 'pozycji'}
                        {hasAssignedPositions && r.kod_id && (
                          <div className="text-[10px] text-[#E8B76A] mt-0.5" title="Naglowek faktury wnosi do aggregacji TYLKO reszte (netto - przypisane pozycje)">
                            Reszta: {fmtPLN(r.remainder_netto)}
                          </div>
                        )}
                        {hasAssignedPositions && !r.kod_id && (
                          <div className="text-[10px] text-[#94A3B8] mt-0.5">
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
                      <td className="p-2 text-right text-white font-mono whitespace-nowrap font-semibold">{fmtPLN(r.netto)}</td>
                      <td className="p-2 text-right">
                        <button onClick={() => removeInvoice(r)} className="p-1 hover:bg-[#7F1D1D] rounded" title="Usun fakture + pozycje"><Trash2 className="h-4 w-4 text-[#DC2626]" /></button>
                      </td>
                    </tr>
                    {isOpen && (r.positions || []).map((p) => (
                      <tr key={p.id} className="border-t border-[#334155] bg-[#1E293B]/50">
                        <td></td>
                        <td className="p-2 text-[#94A3B8] text-[10px]"></td>
                        <td className="p-2 text-[#94A3B8] text-xs pl-6">
                          <span className="text-[#475569]">└</span> pozycja
                        </td>
                        <td className="p-2 text-[#CBD5E1] text-xs max-w-[200px] truncate" title={p.pozycja_nazwa}>{p.pozycja_nazwa || '-'}</td>
                        <td className="p-2 text-xs">
                          {renderKodSelect(p.kod_id, (e) => quickAssignPos(p, 'kod_id', e.target.value),
                            `finance-pos-kod-${p.id}`)}
                        </td>
                        <td className="p-2 text-xs">
                          {renderBudowaSelect(p.budowa_id, (e) => quickAssignPos(p, 'budowa_id', e.target.value),
                            `finance-pos-budowa-${p.id}`)}
                        </td>
                        <td className="p-2 text-right text-[#CBD5E1] font-mono whitespace-nowrap">{fmtPLN(p.netto)}</td>
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
                <tr key={z.id} className={`border-t border-[#334155] hover:bg-[#1E293B]/50 ${
                  isUnassigned ? 'bg-[#E8B76A]/10 ring-1 ring-inset ring-[#E8B76A]/40' : (z.source && z.source.startsWith('auto_') ? 'bg-[#1E293B]/40' : '')
                }`} data-testid={`finance-zapis-row-${z.id}`}>
                  <td></td>
                  <td className="p-2 text-white text-xs whitespace-nowrap">{z.date}</td>
                  <td className="p-2 text-[#CBD5E1] text-xs">
                    <div>{z.kontrahent || '-'}</div>
                    {z.nr_faktury && <div className="text-[#94A3B8] text-[10px]">{z.nr_faktury}</div>}
                    {z.source === 'manual' && <span className="inline-block mt-0.5 text-[10px] bg-[#475569]/40 text-[#CBD5E1] px-1 rounded">RECZNY</span>}
                    {z.source && z.source.startsWith('auto_') && <span className="inline-block mt-0.5 text-[10px] bg-[#E8B76A]/20 text-[#E8B76A] px-1 rounded">AUTO</span>}
                  </td>
                  <td className="p-2 text-[#CBD5E1] text-xs max-w-[200px] truncate" title={z.pozycja_nazwa}>{z.pozycja_nazwa || '-'}</td>
                  <td className="p-2 text-xs">
                    <span className="text-[#CBD5E1]">{kodName(z.kod_id)}</span>
                  </td>
                  <td className="p-2 text-xs">
                    <span className="text-[#94A3B8]">{z.budowa_id ? budowaName(z.budowa_id) : '-'}</span>
                  </td>
                  <td className="p-2 text-right text-white font-mono whitespace-nowrap">{fmtPLN(z.netto)}</td>
                  <td className="p-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(z)} className="p-1 hover:bg-[#334155] rounded" title="Edytuj"><Edit2 className="h-4 w-4 text-[#94A3B8]" /></button>
                      <button onClick={() => remove(z)} className="p-1 hover:bg-[#7F1D1D] rounded" title="Usun"><Trash2 className="h-4 w-4 text-[#DC2626]" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="bg-[#2A384C] border-[#334155] text-[#CBD5E1] max-w-2xl" data-testid="finance-zapis-modal">
          <DialogHeader><DialogTitle className="text-white">{editing ? 'Edytuj zapis' : 'Dodaj zapis ksiegowy'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Data</label>
              <Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}
                className="bg-[#1E293B] border-[#334155] text-white" data-testid="finance-zapis-date" />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Nr faktury</label>
              <Input value={form.nr_faktury} onChange={(e) => setForm({...form, nr_faktury: e.target.value})}
                placeholder="FV/.../2026" className="bg-[#1E293B] border-[#334155] text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#94A3B8] block mb-1">Kontrahent</label>
              <Input value={form.kontrahent} onChange={(e) => setForm({...form, kontrahent: e.target.value})}
                placeholder="np. INWESTOR ABC" className="bg-[#1E293B] border-[#334155] text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#94A3B8] block mb-1">Pozycja (nazwa towaru/uslugi)</label>
              <Input value={form.pozycja_nazwa} onChange={(e) => setForm({...form, pozycja_nazwa: e.target.value})}
                placeholder="np. Beton B25, Stal preta fi12" className="bg-[#1E293B] border-[#334155] text-white" />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Kod kosztu</label>
              <select value={form.kod_id} onChange={(e) => setForm({...form, kod_id: e.target.value})}
                className="w-full bg-[#1E293B] border border-[#334155] text-white rounded px-2 py-2 text-sm"
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
              <label className="text-sm text-[#94A3B8] block mb-1">Budowa (opcjonalnie)</label>
              <select value={form.budowa_id} onChange={(e) => setForm({...form, budowa_id: e.target.value})}
                className="w-full bg-[#1E293B] border border-[#334155] text-white rounded px-2 py-2 text-sm"
                data-testid="finance-zapis-budowa">
                <option value="">— bez budowy —</option>
                {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Netto (zl)</label>
              <Input type="number" step="0.01" value={form.netto} onChange={(e) => setForm({...form, netto: e.target.value})}
                placeholder="0.00" className="no-spinner bg-[#1E293B] border-[#334155] text-white"
                data-testid="finance-zapis-netto" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#94A3B8] block mb-1">Uwagi</label>
              <Input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}
                className="bg-[#1E293B] border-[#334155] text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}
              className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] hover:text-white">Anuluj</Button>
            <Button onClick={submit} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="finance-zapis-submit">
              {editing ? 'Zapisz' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// =========================== RACHUNEK WYNIKOW ===========================
const RachunekWynikowPanel = ({ year }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({ kp: false, kbb: false, ksb: false, ksp: false });
  const [showAddKod, setShowAddKod] = useState(false);
  const [newKod, setNewKod] = useState({ name: '', category: 'KBB', order: 100 });
  const [editingKod, setEditingKod] = useState(null); // { kod_id, name }
  const [allKody, setAllKody] = useState([]);

  const fetchAllKody = () => {
    api.get('/finance/kody').then(r => setAllKody(r.data.rows || []));
  };

  const renameKod = async (kodId) => {
    const name = (editingKod?.name || '').trim();
    if (!name) { setEditingKod(null); return; }
    try {
      await api.put(`/finance/kody/${kodId}`, { name });
      toast.success('Nazwa zaktualizowana');
      setEditingKod(null);
      fetchRW();
      fetchAllKody();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  const deleteKod = async (kodId, name) => {
    if (!window.confirm(`Usunac kod "${name}"?\n\nMozliwe tylko gdy nie ma zapisow z tym kodem.`)) return;
    try {
      await api.delete(`/finance/kody/${kodId}`);
      toast.success('Kod usuniety');
      fetchRW();
      fetchAllKody();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Nie mozna usunac');
    }
  };

  const fetchRW = () => {
    setLoading(true);
    api.get(`/finance/rachunek-wynikow?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Blad pobierania rachunku'))
      .finally(() => setLoading(false));
  };

  const submitNewKod = async () => {
    const name = newKod.name.trim();
    if (!name) { toast.error('Wpisz nazwe'); return; }
    // Auto-generuj ID: CATEGORY_NAZWA (np. KBB_TELEFONY)
    const slug = name.toUpperCase()
      .replace(/[ĄĆĘŁŃÓŚŹŻ]/g, (c) => ({Ą:'A',Ć:'C',Ę:'E',Ł:'L',Ń:'N',Ó:'O',Ś:'S',Ź:'Z',Ż:'Z'}[c] || c))
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const id = `${newKod.category}_${slug}`;
    try {
      await api.post('/finance/kody', {
        id, name, category: newKod.category, order: newKod.order || 100,
      });
      toast.success('Dodano kod');
      setShowAddKod(false);
      setNewKod({ name: '', category: 'KBB', order: 100 });
      fetchRW();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  useEffect(() => {
    fetchRW();
    fetchAllKody();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  if (loading) return <Card className="bg-[#2A384C] border-[#334155]"><CardContent className="p-6 text-[#94A3B8]">Ladowanie...</CardContent></Card>;
  if (!data) return null;

  const { summary, ratios, groups } = data;
  const monthsHeader = PL_MONTHS_SHORT;

  const renderRow = (label, monthly, total, opts = {}) => (
    <tr className={`border-t-2 border-[#334155] ${opts.bg || ''}`} data-testid={opts.testid}>
      <td className={`p-2 border-r-2 border-[#475569] ${opts.labelClass || 'text-white'} sticky left-0 ${opts.bg || 'bg-[#2A384C]'} z-10`}>
        {opts.indent && <span className="ml-4" />}
        {label}
      </td>
      {monthly.map((v, i) => (
        <td key={i} className={`p-1 text-right text-xs border-r border-[#334155] ${opts.valClass || 'text-[#CBD5E1]'}`}>{(opts.numFmt || fmtNum)(v)}</td>
      ))}
      <td className={`p-2 text-right font-bold border-l-2 border-[#475569] ${opts.totalClass || 'text-white'} bg-[#1E293B]`}>{total === '-' ? '-' : (opts.numFmt || fmtNum)(total)}</td>
    </tr>
  );

  const toggle = (k) => setExpanded(s => ({ ...s, [k]: !s[k] }));

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white">Rachunek wynikow {year}</CardTitle>
        <Button onClick={() => setShowAddKod(true)}
          className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="rw-add-kod-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj kod kosztu
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm finance-grid-table" data-testid="finance-rw-table">
          <thead className="bg-[#1E293B] text-[#94A3B8] sticky top-0">
            <tr>
              <th className="p-2 text-left border-r-2 border-[#475569] sticky left-0 bg-[#1E293B] z-20">Pozycja</th>
              {monthsHeader.map((m, i) => <th key={i} className="p-1 text-right text-xs min-w-[60px] border-r border-[#334155]">{m}</th>)}
              <th className="p-2 text-right border-l-2 border-[#475569]">SUMA</th>
            </tr>
          </thead>
          <tbody>
            {renderRow('PRZYCHODY NETTO', summary.przychody_netto.monthly, summary.przychody_netto.total,
              { bg: 'bg-[#5F7151]/15', labelClass: 'text-[#5F7151] font-bold', totalClass: 'text-[#5F7151]', testid: 'rw-przychody' })}
            {renderRow('SUMA KOSZTOW', summary.suma_kosztow.monthly, summary.suma_kosztow.total,
              { bg: 'bg-[#E8836A]/10', labelClass: 'text-[#E8836A] font-bold', totalClass: 'text-[#E8836A]', testid: 'rw-koszty' })}
            {renderRow('PODATEK', summary.podatek.monthly, summary.podatek.total,
              { labelClass: 'text-[#CBD5E1]', testid: 'rw-podatek' })}
            {renderRow('KAUCJA GIR', summary.kaucja_gir.monthly, summary.kaucja_gir.total,
              { labelClass: 'text-[#94A3B8]' })}
            {renderRow('KAUCJA DW', summary.kaucja_dw.monthly, summary.kaucja_dw.total,
              { labelClass: 'text-[#94A3B8]' })}
            {renderRow('WYNIK NETTO', summary.wynik_netto.monthly, summary.wynik_netto.total,
              { bg: 'bg-[#E8B76A]/15', labelClass: 'text-[#E8B76A] font-bold', totalClass: 'text-[#E8B76A]', testid: 'rw-wynik' })}
            {renderRow('ILOSC GODZIN', summary.godziny.monthly, summary.godziny.total,
              { labelClass: 'text-[#94A3B8]' })}

            {/* Wskazniki */}
            <tr><td colSpan={14} className="p-1 bg-[#1E293B] text-[#94A3B8] text-xs uppercase border-y-2 border-[#475569]">Wskazniki / R-G</td></tr>
            {renderRow('Koszt R-G (firma + pracownik)', ratios.koszt_rg_firma_pracownik, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Przychody / R-G', ratios.przychody_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty / R-G', ratios.koszty_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty budowy / R-G', ratios.koszty_budowy_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty ogolne / R-G', ratios.koszty_ogolne_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}

            {/* Groups */}
            {['kp','kbb','ksb','ksp'].map(g => (
              <React.Fragment key={g}>
                <tr className="border-t-4 border-[#5F7151] hover:bg-[#1E293B]/50 cursor-pointer" onClick={() => toggle(g)} data-testid={`rw-group-toggle-${g}`}>
                  <td className="p-2 text-white font-semibold border-r-2 border-[#475569] sticky left-0 bg-[#2A384C] z-10">
                    {expanded[g] ? <ChevronDown className="inline h-4 w-4 mr-1" /> : <ChevronRight className="inline h-4 w-4 mr-1" />}
                    {groups[g].label}
                  </td>
                  {groups[g].monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#CBD5E1] border-r border-[#334155]">{fmtNum(v)}</td>)}
                  <td className="p-2 text-right font-bold text-white bg-[#1E293B] border-l-2 border-[#475569]">{fmtNum(groups[g].total)}</td>
                </tr>
                {expanded[g] && groups[g].rows.map((r) => {
                  const isEditing = editingKod?.kod_id === r.kod_id;
                  const kodMeta = allKody.find(k => k.id === r.kod_id);
                  const isCustom = !!kodMeta?.is_custom;
                  return (
                  <tr key={r.kod_id} className="border-t border-[#334155] bg-[#1E293B]/30" data-testid={`rw-detail-${r.kod_id}`}>
                    <td className="p-2 pl-8 text-[#94A3B8] text-xs border-r-2 border-[#475569] sticky left-0 bg-[#2A384C] z-10">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editingKod.name}
                            onChange={(e) => setEditingKod({ ...editingKod, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') renameKod(r.kod_id); if (e.key === 'Escape') setEditingKod(null); }}
                            onBlur={() => renameKod(r.kod_id)}
                            className="bg-[#1E293B] border border-[#5F7151] text-white rounded px-1 py-0.5 text-xs flex-1"
                            data-testid={`rw-kod-edit-input-${r.kod_id}`} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span className="cursor-pointer hover:text-white flex-1" onClick={() => setEditingKod({ kod_id: r.kod_id, name: r.name })}
                            data-testid={`rw-kod-label-${r.kod_id}`}>
                            {r.name}
                          </span>
                          <button onClick={() => setEditingKod({ kod_id: r.kod_id, name: r.name })}
                            className="text-[#5F7151] hover:text-white opacity-50 hover:opacity-100"
                            title="Edytuj nazwe"
                            data-testid={`rw-kod-edit-btn-${r.kod_id}`}>
                            <Edit2 className="h-3 w-3" />
                          </button>
                          {isCustom && (
                            <button onClick={() => deleteKod(r.kod_id, r.name)}
                              className="text-[#DC2626] hover:text-white opacity-80 hover:opacity-100"
                              title="Usun kod (tylko gdy nieuzywany)"
                              data-testid={`rw-kod-del-btn-${r.kod_id}`}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    {r.monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#94A3B8] border-r border-[#334155]">{fmtNum(v)}</td>)}
                    <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B] border-l-2 border-[#475569]">{fmtNum(r.total)}</td>
                  </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </CardContent>

      {/* Modal: dodaj kod kosztu */}
      <Dialog open={showAddKod} onOpenChange={setShowAddKod}>
        <DialogContent className="bg-[#2A384C] border-[#334155] text-white">
          <DialogHeader>
            <DialogTitle>Dodaj kod kosztu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Nazwa kodu</label>
              <Input value={newKod.name} onChange={(e) => setNewKod({...newKod, name: e.target.value})}
                placeholder="np. Telefony, Internet, Paliwo..." className="bg-[#1E293B] border-[#334155] text-white"
                data-testid="rw-add-kod-name" />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Kategoria (do ktorej grupy)</label>
              <select value={newKod.category} onChange={(e) => setNewKod({...newKod, category: e.target.value})}
                className="w-full bg-[#1E293B] border border-[#334155] text-white rounded px-2 py-2 text-sm"
                data-testid="rw-add-kod-category">
                <option value="KBB">KBB - Koszty budowy bezposrednie</option>
                <option value="KSB">KSB - Koszty stale budowy</option>
                <option value="KSP">KSP - Koszty stale przedsiebiorstwa</option>
                <option value="KP">KP - Koszty pracy</option>
              </select>
            </div>
            <div className="text-[10px] text-[#64748B]">
              Po dodaniu kod bedzie dostepny w dropdownie "Kod kosztu" w Zapisach (faktury i recznych). Mozna usunac kod tylko jesli nie jest uzywany w zadnym zapisie.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddKod(false)}
              className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] hover:text-white">Anuluj</Button>
            <Button onClick={submitNewKod} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="rw-add-kod-submit">
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// =========================== SPRZEDAZ ===========================
const SprzedazPanel = ({ year }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [month, setMonth] = useState(0); // 0 = caly rok

  useEffect(() => {
    setLoading(true);
    const qs = month > 0 ? `?year=${year}&month=${month}` : `?year=${year}`;
    api.get(`/finance/sprzedaz${qs}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Blad pobierania sprzedazy'))
      .finally(() => setLoading(false));
  }, [year, month]);

  if (loading) return <Card className="bg-[#2A384C] border-[#334155]"><CardContent className="p-6 text-[#94A3B8]">Ladowanie...</CardContent></Card>;
  if (!data) return null;

  const { rows, totals } = data;

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white">
          Sprzedaz per budowa {year}{month > 0 ? ` - ${PL_MONTHS_SHORT[month-1]}` : ' (caly rok)'}
        </CardTitle>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="bg-[#1E293B] border border-[#334155] text-white rounded px-2 py-1 text-sm"
            data-testid="finance-sprzedaz-month">
            <option value="0">Caly rok</option>
            {PL_MONTHS_SHORT.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <Button variant="outline" onClick={() => setShowDetails(!showDetails)}
            className="border-[#5F7151] text-[#5F7151] hover:bg-[#334155] hover:text-[#5F7151]"
            data-testid="sprzedaz-toggle-details">
            {showDetails ? <><ChevronDown className="h-4 w-4 mr-1" /> Ukryj szczegoly</> : <><ChevronRight className="h-4 w-4 mr-1" /> Rozwin szczegoly (kol. E-X)</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm finance-grid-table" data-testid="finance-sprzedaz-table">
          <thead className="bg-[#1E293B] text-[#94A3B8] text-xs">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Budowa</th>
              {showDetails && <>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">Sprzedaz</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">KP</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">KP-alok</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">KBB</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">KBB-alok</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">Marza brutto</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">%</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">KSB</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">KSP uklady</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">Marza I</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">%</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">KSP alok</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">Marza II</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">%</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">Podatek alok</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">Marza III</th>
                <th className="p-2 text-right bg-[#1E293B]/70 text-[#E8B76A]">%</th>
              </>}
              {/* Y-AI visible */}
              <th className="p-2 text-right text-[#5F7151] font-bold">Przychod</th>
              <th className="p-2 text-right text-[#E8836A] font-bold">Koszt</th>
              <th className="p-2 text-right">KGIR</th>
              <th className="p-2 text-right">KDW</th>
              <th className="p-2 text-right text-[#E8B76A] font-bold">Roznica</th>
              <th className="p-2 text-right">Zysk%</th>
              <th className="p-2 text-right">Godz.</th>
              <th className="p-2 text-right">Przych/Rg</th>
              <th className="p-2 text-right">Zysk/Rg</th>
              <th className="p-2 text-right">Koszt/Rg</th>
              <th className="p-2 text-right">Kszt zmienny</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={showDetails ? 30 : 13} className="p-6 text-center text-[#94A3B8]">Brak budow. Dodaj w zakladce Budowy.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.budowa_id} className="border-t border-[#334155] hover:bg-[#1E293B]/50" data-testid={`sprzedaz-row-${r.budowa_id}`}>
                <td className="p-2 text-[#94A3B8]">{r.nr}</td>
                <td className="p-2 text-white font-medium">{r.name}{r.is_archived && <span className="ml-1 text-xs text-[#94A3B8]">(arch)</span>}</td>
                {showDetails && <>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmtNum(r.details.sprzedaz)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmtNum(r.details.kp)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmtNum(r.details.kp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmtNum(r.details.kbb)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmtNum(r.details.kbb_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtNum(r.details.marza_brutto)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza_brutto_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmtNum(r.details.ksb)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmtNum(r.details.ksp_uklady_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtNum(r.details.marza1)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza1_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmtNum(r.details.ksp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtNum(r.details.marza2)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza2_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmtNum(r.details.podatek_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtNum(r.details.marza3)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza3_pct)}</td>
                </>}
                <td className="p-2 text-right text-[#5F7151] font-semibold">{fmtNum(r.visible.przychod)}</td>
                <td className="p-2 text-right text-[#E8836A] font-semibold">{fmtNum(r.visible.koszt)}</td>
                <td className="p-2 text-right text-xs text-[#94A3B8]">{fmtNum(r.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-xs text-[#94A3B8]">{fmtNum(r.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#E8B76A] font-bold">{fmtNum(r.visible.roznica)}</td>
                <td className="p-2 text-right text-xs">{fmtPct(r.visible.zysk_pct)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.godziny)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.przychod_rg)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.zysk_rg)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.koszt_rg)}</td>
                <td className="p-2 text-right text-xs">{fmtNum(r.visible.koszt_zmienny)}</td>
              </tr>
            ))}
            {/* SUMA footer */}
            {rows.length > 0 && (
              <tr className="border-t-2 border-[#5F7151] bg-[#1E293B]" data-testid="sprzedaz-totals-row">
                <td colSpan={showDetails ? 20 : 2} className="p-2 text-white font-bold">SUMA</td>
                <td className="p-2 text-right text-[#5F7151] font-bold">{fmtNum(totals.visible.przychod)}</td>
                <td className="p-2 text-right text-[#E8836A] font-bold">{fmtNum(totals.visible.koszt)}</td>
                <td className="p-2 text-right text-[#94A3B8]">{fmtNum(totals.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-[#94A3B8]">{fmtNum(totals.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#E8B76A] font-bold">{fmtNum(totals.visible.roznica)}</td>
                <td className="p-2 text-right">{fmtPct(totals.visible.zysk_pct)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.godziny)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.przychod_rg)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.zysk_rg)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.koszt_rg)}</td>
                <td className="p-2 text-right">{fmtNum(totals.visible.koszt_zmienny)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

export default Finance;
