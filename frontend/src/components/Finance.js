import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { ChevronDown, ChevronRight, Plus, Archive, ArchiveRestore, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

const PL_MONTHS_SHORT = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paz','Lis','Gru'];

// Numerical formatter - usuwa zera po kropce: 0.00→"0", 12.50→"12.5"
const fmt = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0';
  return n.toFixed(2).replace(/\.?0+$/, '') || '0';
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

export const Finance = () => {
  const [active, setActive] = useState('budowy');
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <div className="space-y-4">
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
  const [form, setForm] = useState({ name: '', code: '', show_in_hours: false, is_gir: false, is_dw: false });
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
      setForm({ name: '', code: '', show_in_hours: false, is_gir: false, is_dw: false });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      name: b.name, code: b.code || '',
      show_in_hours: !!b.show_in_hours, is_gir: !!b.is_gir, is_dw: !!b.is_dw,
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

  const importFromSites = async () => {
    if (!window.confirm('Zaimportowac wszystkie budowy z tabeli godzin do Finansow?\n\nNiezduplikuje istniejacych - jedynie utworzy linki dla brakujacych.')) return;
    try {
      const r = await api.post('/finance/budowy/import-from-sites');
      toast.success(`Utworzono ${r.data.created} nowych, pominieto ${r.data.skipped}`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Blad importu'); }
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
          <Button onClick={importFromSites} variant="outline"
            className="border-[#E8B76A] text-[#E8B76A] hover:bg-[#334155] hover:text-[#E8B76A]"
            data-testid="finance-import-from-sites">
            Importuj z tabeli godzin
          </Button>
          <Button onClick={() => { setEditing(null); setForm({ name:'', code:'', show_in_hours:false, is_gir:false, is_dw:false }); setShowAdd(true); }}
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
              <th className="p-2 text-left">Kod</th>
              <th className="p-2 text-center">W godzinach</th>
              <th className="p-2 text-center">GIR 2%</th>
              <th className="p-2 text-center">DW 2%</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-[#334155] hover:bg-[#1E293B]/50" data-testid={`finance-budowa-row-${b.id}`}>
                <td className="p-2 text-white font-medium">{b.name}</td>
                <td className="p-2 text-[#94A3B8]">{b.code || '-'}</td>
                <td className="p-2 text-center">{b.show_in_hours ? <span className="text-[#5F7151]">TAK</span> : <span className="text-[#475569]">-</span>}</td>
                <td className="p-2 text-center">{b.is_gir ? <span className="text-[#E8B76A]">TAK</span> : <span className="text-[#475569]">-</span>}</td>
                <td className="p-2 text-center">{b.is_dw ? <span className="text-[#E8B76A]">TAK</span> : <span className="text-[#475569]">-</span>}</td>
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
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Kod (opcjonalnie)</label>
              <Input value={form.code} onChange={(e) => setForm({...form, code: e.target.value})}
                placeholder="np. G3" className="bg-[#1E293B] border-[#334155] text-white" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-[#1E293B] rounded">
              <input type="checkbox" checked={form.show_in_hours} onChange={(e) => setForm({...form, show_in_hours: e.target.checked})}
                className="accent-[#5F7151]" data-testid="finance-budowa-show-in-hours" />
              <span>Pokaz w liscie godzin (przypisywanie pracownikow)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-[#1E293B] rounded">
              <input type="checkbox" checked={form.is_gir} onChange={(e) => setForm({...form, is_gir: e.target.checked})}
                className="accent-[#E8B76A]" />
              <span>Budowa GIR (Kaucja 2% z przychodu)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-[#1E293B] rounded">
              <input type="checkbox" checked={form.is_dw} onChange={(e) => setForm({...form, is_dw: e.target.checked})}
                className="accent-[#E8B76A]" />
              <span>Budowa DW (Kaucja 2% z przychodu)</span>
            </label>
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

// =========================== ZAPISY ===========================
const ZapisyPanel = ({ year }) => {
  const [month, setMonth] = useState(0); // 0 = caly rok
  const [rows, setRows] = useState([]);
  const [budowy, setBudowy] = useState([]);
  const [kody, setKody] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    kontrahent: '', netto: '', kod_id: 'PZS', budowa_id: '', nr_faktury: '', pozycja_nazwa: '', notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = month > 0 ? `?year=${year}&month=${month}` : `?year=${year}`;
      const [zRes, bRes, kRes] = await Promise.all([
        api.get(`/finance/zapisy${qs}`),
        api.get('/finance/budowy?include_archived=true'),
        api.get('/finance/kody'),
      ]);
      setRows(zRes.data.rows);
      setBudowy(bRes.data.rows);
      setKody(kRes.data.rows);
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

  const quickAssign = async (z, field, value) => {
    try {
      await api.put(`/finance/zapisy/${z.id}`, { [field]: value });
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

  const totalNetto = rows.reduce((s, r) => s + (r.netto || 0), 0);
  const unassignedCount = rows.filter(r => r.source === 'fakturownia' && !r.kod_id).length;
  const filteredRows = filterUnassigned ? rows.filter(r => r.source === 'fakturownia' && !r.kod_id) : rows;

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

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-white">
          Zapisy ksiegowe ({filteredRows.length}{filteredRows.length !== rows.length ? `/${rows.length}` : ''}, suma: {fmt(totalNetto)} zl)
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
      <CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-6 text-[#94A3B8]">Ladowanie...</div> :
        rows.length === 0 ? <div className="p-6 text-[#94A3B8]">Brak zapisow w tym okresie.</div> :
        <table className="w-full text-sm">
          <thead className="bg-[#1E293B] text-[#94A3B8]">
            <tr>
              <th className="p-2 text-left">Data</th>
              <th className="p-2 text-left">Kontrahent / Faktura</th>
              <th className="p-2 text-left">Pozycja</th>
              <th className="p-2 text-left">Kod kosztu</th>
              <th className="p-2 text-left">Budowa</th>
              <th className="p-2 text-right">Netto</th>
              <th className="p-2 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((z) => {
              const isFakturownia = z.source === 'fakturownia';
              const isUnassigned = isFakturownia && !z.kod_id;
              return (
              <tr key={z.id} className={`border-t border-[#334155] hover:bg-[#1E293B]/50 ${
                isUnassigned ? 'bg-[#E8B76A]/10 ring-1 ring-inset ring-[#E8B76A]/40' : (z.source && z.source.startsWith('auto_') ? 'bg-[#1E293B]/40' : '')
              }`} data-testid={`finance-zapis-row-${z.id}`}>
                <td className="p-2 text-white text-xs whitespace-nowrap">{z.date}</td>
                <td className="p-2 text-[#CBD5E1] text-xs">
                  <div>{z.kontrahent || '-'}</div>
                  {z.nr_faktury && <div className="text-[#94A3B8] text-[10px]">{z.nr_faktury}</div>}
                  {isFakturownia && <span className="inline-block mt-0.5 text-[10px] bg-[#E8B76A]/20 text-[#E8B76A] px-1 rounded">FAKTUROWNIA</span>}
                  {z.source && z.source.startsWith('auto_') && (
                    <span className="inline-block mt-0.5 text-[10px] bg-[#E8B76A]/20 text-[#E8B76A] px-1 rounded">AUTO</span>
                  )}
                </td>
                <td className="p-2 text-[#CBD5E1] text-xs max-w-[200px] truncate" title={z.pozycja_nazwa}>{z.pozycja_nazwa || '-'}</td>
                <td className="p-2 text-xs">
                  {isFakturownia ? (
                    <select value={z.kod_id || ''} onChange={(e) => quickAssign(z, 'kod_id', e.target.value)}
                      className={`w-full bg-[#1E293B] border rounded px-1 py-1 text-xs ${isUnassigned ? 'border-[#E8B76A] text-[#E8B76A]' : 'border-[#334155] text-white'}`}
                      data-testid={`finance-quick-kod-${z.id}`}>
                      <option value="">— przypisz kod —</option>
                      {['PZS','PPE','PV','G','KP','KBB','KSB','KSP'].map(cat => {
                        const ck = kody.filter(k => k.category === cat);
                        if (!ck.length) return null;
                        return <optgroup key={cat} label={cat}>
                          {ck.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </optgroup>;
                      })}
                    </select>
                  ) : <span className="text-[#CBD5E1]">{kodName(z.kod_id)}</span>}
                </td>
                <td className="p-2 text-xs">
                  {isFakturownia ? (
                    <select value={z.budowa_id || ''} onChange={(e) => quickAssign(z, 'budowa_id', e.target.value)}
                      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded px-1 py-1 text-xs"
                      data-testid={`finance-quick-budowa-${z.id}`}>
                      <option value="">— bez budowy —</option>
                      {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : <span className="text-[#94A3B8]">{z.budowa_id ? budowaName(z.budowa_id) : '-'}</span>}
                </td>
                <td className="p-2 text-right text-white font-mono whitespace-nowrap">{fmt(z.netto)}</td>
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

  useEffect(() => {
    setLoading(true);
    api.get(`/finance/rachunek-wynikow?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Blad pobierania rachunku wynikow'))
      .finally(() => setLoading(false));
  }, [year]);

  if (loading) return <Card className="bg-[#2A384C] border-[#334155]"><CardContent className="p-6 text-[#94A3B8]">Ladowanie...</CardContent></Card>;
  if (!data) return null;

  const { summary, ratios, groups } = data;
  const monthsHeader = PL_MONTHS_SHORT;

  const renderRow = (label, monthly, total, opts = {}) => (
    <tr className={`border-t border-[#334155] ${opts.bg || ''}`} data-testid={opts.testid}>
      <td className={`p-2 ${opts.labelClass || 'text-white'} sticky left-0 ${opts.bg || 'bg-[#2A384C]'} z-10`}>
        {opts.indent && <span className="ml-4" />}
        {label}
      </td>
      {monthly.map((v, i) => (
        <td key={i} className={`p-1 text-right text-xs ${opts.valClass || 'text-[#CBD5E1]'}`}>{fmt(v)}</td>
      ))}
      <td className={`p-2 text-right font-bold ${opts.totalClass || 'text-white'} bg-[#1E293B]`}>{fmt(total)}</td>
    </tr>
  );

  const toggle = (k) => setExpanded(s => ({ ...s, [k]: !s[k] }));

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader><CardTitle className="text-white">Rachunek wynikow {year}</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse" data-testid="finance-rw-table">
          <thead className="bg-[#1E293B] text-[#94A3B8] sticky top-0">
            <tr>
              <th className="p-2 text-left sticky left-0 bg-[#1E293B] z-20">Pozycja</th>
              {monthsHeader.map((m, i) => <th key={i} className="p-1 text-right text-xs min-w-[60px]">{m}</th>)}
              <th className="p-2 text-right">SUMA</th>
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
            <tr><td colSpan={14} className="p-1 bg-[#1E293B] text-[#94A3B8] text-xs uppercase">Wskazniki / R-G</td></tr>
            {renderRow('Koszt R-G (firma + pracownik)', ratios.koszt_rg_firma_pracownik, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Przychody / R-G', ratios.przychody_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty / R-G', ratios.koszty_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty budowy / R-G', ratios.koszty_budowy_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty ogolne / R-G', ratios.koszty_ogolne_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}

            {/* Groups */}
            {['kp','kbb','ksb','ksp'].map(g => (
              <React.Fragment key={g}>
                <tr className="border-t-2 border-[#475569] hover:bg-[#1E293B]/50 cursor-pointer" onClick={() => toggle(g)} data-testid={`rw-group-toggle-${g}`}>
                  <td className="p-2 text-white font-semibold sticky left-0 bg-[#2A384C] z-10">
                    {expanded[g] ? <ChevronDown className="inline h-4 w-4 mr-1" /> : <ChevronRight className="inline h-4 w-4 mr-1" />}
                    {groups[g].label}
                  </td>
                  {groups[g].monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#CBD5E1]">{fmt(v)}</td>)}
                  <td className="p-2 text-right font-bold text-white bg-[#1E293B]">{fmt(groups[g].total)}</td>
                </tr>
                {expanded[g] && groups[g].rows.map((r) => (
                  <tr key={r.kod_id} className="border-t border-[#334155] bg-[#1E293B]/30" data-testid={`rw-detail-${r.kod_id}`}>
                    <td className="p-2 pl-8 text-[#94A3B8] text-xs sticky left-0 bg-[#2A384C] z-10">{r.name}</td>
                    {r.monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#94A3B8]">{fmt(v)}</td>)}
                    <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]">{fmt(r.total)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

// =========================== SPRZEDAZ ===========================
const SprzedazPanel = ({ year }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/finance/sprzedaz?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Blad pobierania sprzedazy'))
      .finally(() => setLoading(false));
  }, [year]);

  if (loading) return <Card className="bg-[#2A384C] border-[#334155]"><CardContent className="p-6 text-[#94A3B8]">Ladowanie...</CardContent></Card>;
  if (!data) return null;

  const { rows, totals } = data;

  return (
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">Sprzedaz per budowa {year}</CardTitle>
        <Button variant="outline" onClick={() => setShowDetails(!showDetails)}
          className="border-[#5F7151] text-[#5F7151] hover:bg-[#334155] hover:text-[#5F7151]"
          data-testid="sprzedaz-toggle-details">
          {showDetails ? <><ChevronDown className="h-4 w-4 mr-1" /> Ukryj szczegoly</> : <><ChevronRight className="h-4 w-4 mr-1" /> Rozwin szczegoly (kol. E-X)</>}
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse" data-testid="finance-sprzedaz-table">
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
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmt(r.details.sprzedaz)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmt(r.details.kp)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmt(r.details.kp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmt(r.details.kbb)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmt(r.details.kbb_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmt(r.details.marza_brutto)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza_brutto_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#1E293B]/30">{fmt(r.details.ksb)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmt(r.details.ksp_uklady_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmt(r.details.marza1)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza1_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmt(r.details.ksp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmt(r.details.marza2)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza2_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#1E293B]/30">{fmt(r.details.podatek_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmt(r.details.marza3)}</td>
                  <td className="p-2 text-right text-xs text-[#5F7151] bg-[#1E293B]/30">{fmtPct(r.details.marza3_pct)}</td>
                </>}
                <td className="p-2 text-right text-[#5F7151] font-semibold">{fmt(r.visible.przychod)}</td>
                <td className="p-2 text-right text-[#E8836A] font-semibold">{fmt(r.visible.koszt)}</td>
                <td className="p-2 text-right text-xs text-[#94A3B8]">{fmt(r.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-xs text-[#94A3B8]">{fmt(r.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#E8B76A] font-bold">{fmt(r.visible.roznica)}</td>
                <td className="p-2 text-right text-xs">{fmtPct(r.visible.zysk_pct)}</td>
                <td className="p-2 text-right text-xs">{fmt(r.visible.godziny)}</td>
                <td className="p-2 text-right text-xs">{fmt(r.visible.przychod_rg)}</td>
                <td className="p-2 text-right text-xs">{fmt(r.visible.zysk_rg)}</td>
                <td className="p-2 text-right text-xs">{fmt(r.visible.koszt_rg)}</td>
                <td className="p-2 text-right text-xs">{fmt(r.visible.koszt_zmienny)}</td>
              </tr>
            ))}
            {/* SUMA footer */}
            {rows.length > 0 && (
              <tr className="border-t-2 border-[#5F7151] bg-[#1E293B]" data-testid="sprzedaz-totals-row">
                <td colSpan={showDetails ? 20 : 2} className="p-2 text-white font-bold">SUMA</td>
                <td className="p-2 text-right text-[#5F7151] font-bold">{fmt(totals.visible.przychod)}</td>
                <td className="p-2 text-right text-[#E8836A] font-bold">{fmt(totals.visible.koszt)}</td>
                <td className="p-2 text-right text-[#94A3B8]">{fmt(totals.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-[#94A3B8]">{fmt(totals.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#E8B76A] font-bold">{fmt(totals.visible.roznica)}</td>
                <td className="p-2 text-right">{fmtPct(totals.visible.zysk_pct)}</td>
                <td className="p-2 text-right">{fmt(totals.visible.godziny)}</td>
                <td className="p-2 text-right">{fmt(totals.visible.przychod_rg)}</td>
                <td className="p-2 text-right">{fmt(totals.visible.zysk_rg)}</td>
                <td className="p-2 text-right">{fmt(totals.visible.koszt_rg)}</td>
                <td className="p-2 text-right">{fmt(totals.visible.koszt_zmienny)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

export default Finance;
