import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Plus, Trash2, Pencil, Building2, Calendar, CheckSquare, FileDown } from 'lucide-react';
import { toast } from 'sonner';

const fmtNum = (n) => Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS_PL = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

// =================== GLOWNY KOMPONENT ===================
export const Budget = () => {
  const [budowy, setBudowy] = useState([]);
  const [selectedBudowaId, setSelectedBudowaId] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState('budget');
  const [loading, setLoading] = useState(true);

  const fetchBudowy = useCallback(() => {
    setLoading(true);
    api.get('/budget/budowy')
      .then((r) => {
        setBudowy(r.data?.rows || []);
        if (!selectedBudowaId && r.data?.rows?.length > 0) {
          setSelectedBudowaId(r.data.rows[0].budowa_id);
        }
      })
      .catch((e) => toast.error('Błąd pobierania budów: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [selectedBudowaId]);

  useEffect(() => { fetchBudowy(); }, [fetchBudowy]);

  const selectedBudowa = budowy.find((b) => b.budowa_id === selectedBudowaId);

  return (
    <div className="space-y-4" data-testid="budget-panel">
      <Card className="bg-[#131C2F] border-[#2A3B59]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-white">
            <Building2 className="h-5 w-5 text-[#D4AF37]" />
            Budżetowanie budów
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <label className="text-sm text-[#94A3B8]">Budowa:</label>
            <select
              value={selectedBudowaId || ''}
              onChange={(e) => setSelectedBudowaId(e.target.value)}
              className="bg-[#0B1120] border border-[#2A3B59] text-white px-3 py-1.5 rounded text-sm min-w-[280px]"
              data-testid="budget-budowa-select"
            >
              <option value="">— wybierz budowę —</option>
              {budowy.map((b) => (
                <option key={b.budowa_id} value={b.budowa_id}>
                  {b.code ? `[${b.code}] ` : ''}{b.name} — Plan: {fmtNum(b.plan_costs_netto)} / Wyk: {fmtNum(b.execution_netto)} zł
                </option>
              ))}
            </select>
            <label className="text-sm text-[#94A3B8] ml-3">Rok:</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
              className="w-24 bg-[#0B1120] border-[#2A3B59] text-white h-8"
              data-testid="budget-year-input"
            />
          </div>

          {loading && <div className="text-[#94A3B8] text-sm">Ładuję...</div>}

          {selectedBudowa && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <Tile label="Pozycje" value={selectedBudowa.lines_count} testId="budget-lines-count" />
              <Tile label="Zadania" value={selectedBudowa.tasks_count} testId="budget-tasks-count" />
              <Tile label="Plan koszty (netto)" value={`${fmtNum(selectedBudowa.plan_costs_netto)} zł`} testId="budget-plan-costs" />
              <Tile label="Wykonanie (netto)" value={`${fmtNum(selectedBudowa.execution_netto)} zł`} testId="budget-execution" highlight />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBudowaId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#131C2F] border border-[#2A3B59] inline-flex">
            <TabsTrigger value="budget" data-testid="budget-tab-budget" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              <CheckSquare className="h-4 w-4 mr-1" /> Budżet
            </TabsTrigger>
            <TabsTrigger value="progress" data-testid="budget-tab-progress" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              % Protokół
            </TabsTrigger>
            <TabsTrigger value="schedule" data-testid="budget-tab-schedule" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              <Calendar className="h-4 w-4 mr-1" /> Harmonogram
            </TabsTrigger>
          </TabsList>

          <TabsContent value="budget" className="mt-3">
            <BudgetLinesPanel budowaId={selectedBudowaId} onChange={fetchBudowy} />
          </TabsContent>
          <TabsContent value="progress" className="mt-3">
            <ProgressPanel budowaId={selectedBudowaId} year={year} />
          </TabsContent>
          <TabsContent value="schedule" className="mt-3">
            <SchedulePanel budowaId={selectedBudowaId} onChange={fetchBudowy} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

const Tile = ({ label, value, testId, highlight }) => (
  <div className={`bg-[#131C2F] border ${highlight ? 'border-[#D4AF37]/40' : 'border-[#2A3B59]'} rounded p-3`} data-testid={testId}>
    <div className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{label}</div>
    <div className={`text-lg font-bold tabular-nums ${highlight ? 'text-[#D4AF37]' : 'text-white'}`}>{value}</div>
  </div>
);

// =================== BUDZET (POZYCJE) ===================
const BudgetLinesPanel = ({ budowaId, onChange }) => {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLine, setEditLine] = useState(null);

  const fetchLines = useCallback(() => {
    if (!budowaId) return;
    setLoading(true);
    api.get(`/budget/${budowaId}/lines`)
      .then((r) => setLines(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [budowaId]);

  useEffect(() => { fetchLines(); }, [fetchLines]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję? Spowoduje to wyczyszczenie powiązań z zapisami.')) return;
    try {
      await api.delete(`/budget/lines/${id}`);
      toast.success('Pozycja usunięta');
      fetchLines();
      onChange && onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // Grupowanie po kategorii
  const grouped = useMemo(() => {
    const g = {};
    lines.forEach((ln) => {
      const cat = ln.category || '— bez kategorii —';
      if (!g[cat]) g[cat] = { lines: [], plan: 0, exec: 0, is_income: ln.is_income };
      g[cat].lines.push(ln);
      g[cat].plan += ln.plan_netto_computed || 0;
      g[cat].exec += ln.execution_netto || 0;
    });
    return g;
  }, [lines]);

  const totalPlan = lines.filter(l => !l.is_income).reduce((s, l) => s + (l.plan_netto_computed || 0), 0);
  const totalExec = lines.filter(l => !l.is_income).reduce((s, l) => s + (l.execution_netto || 0), 0);
  const totalIncomePlan = lines.filter(l => l.is_income).reduce((s, l) => s + (l.plan_netto_computed || 0), 0);
  const totalIncomeExec = lines.filter(l => l.is_income).reduce((s, l) => s + (l.execution_netto || 0), 0);

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-white text-base">Pozycje budżetu</CardTitle>
        <Button
          size="sm"
          onClick={() => { setEditLine(null); setModalOpen(true); }}
          className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8"
          data-testid="budget-add-line-btn"
        >
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? (
          <div className="text-[#94A3B8] text-sm">Ładuję...</div>
        ) : lines.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="budget-empty">
            Brak pozycji. Kliknij „Dodaj pozycję" aby zacząć.
          </div>
        ) : (
          <table className="w-full text-xs" data-testid="budget-lines-table">
            <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
              <tr>
                <th className="text-left p-2">Kategoria / Pozycja</th>
                <th className="text-right p-2">Ilość</th>
                <th className="text-right p-2">Jedn.</th>
                <th className="text-right p-2">Cena j.</th>
                <th className="text-right p-2">Plan netto</th>
                <th className="text-right p-2">Kaucja GIR</th>
                <th className="text-right p-2">Kaucja DW</th>
                <th className="text-right p-2">Wykonanie</th>
                <th className="text-right p-2">%</th>
                <th className="text-right p-2">Pozostało</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([cat, g]) => (
                <React.Fragment key={cat}>
                  <tr className="bg-[#0B1120]">
                    <td colSpan={11} className={`p-2 font-bold ${g.is_income ? 'text-[#5F7552]' : 'text-[#D4AF37]'}`}>
                      {g.is_income ? '+ ' : '− '}{cat}
                      <span className="text-[#94A3B8] font-normal ml-2">
                        ({fmtNum(g.exec)} / {fmtNum(g.plan)} zł — {g.plan > 0 ? Math.round((g.exec / g.plan) * 100) : 0}%)
                      </span>
                    </td>
                  </tr>
                  {g.lines.map((ln) => (
                    <tr key={ln.id} className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/40" data-testid={`budget-line-${ln.id}`}>
                      <td className="p-2 text-white">{ln.name}</td>
                      <td className="p-2 text-right text-[#CBD5E1] tabular-nums">{ln.quantity ? fmtNum(ln.quantity) : '—'}</td>
                      <td className="p-2 text-right text-[#94A3B8]">{ln.unit || '—'}</td>
                      <td className="p-2 text-right text-[#CBD5E1] tabular-nums">{ln.unit_price_netto ? fmtNum(ln.unit_price_netto) : '—'}</td>
                      <td className="p-2 text-right text-white font-semibold tabular-nums">{fmtNum(ln.plan_netto_computed)}</td>
                      <td className="p-2 text-right text-[#94A3B8] tabular-nums">{ln.kaucja_gir_pct ? `${ln.kaucja_gir_pct}% (${fmtNum(ln.kaucja_gir_amount)})` : '—'}</td>
                      <td className="p-2 text-right text-[#94A3B8] tabular-nums">{ln.kaucja_dw_pct ? `${ln.kaucja_dw_pct}% (${fmtNum(ln.kaucja_dw_amount)})` : '—'}</td>
                      <td className="p-2 text-right text-[#D4AF37] tabular-nums">{fmtNum(ln.execution_netto)}</td>
                      <td className={`p-2 text-right tabular-nums font-semibold ${ln.progress_pct >= 100 ? 'text-[#9B2C2C]' : ln.progress_pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`}>
                        {ln.progress_pct}%
                      </td>
                      <td className={`p-2 text-right tabular-nums ${ln.remaining_netto < 0 ? 'text-[#FCA5A5]' : 'text-[#CBD5E1]'}`}>{fmtNum(ln.remaining_netto)}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <button onClick={() => { setEditLine(ln); setModalOpen(true); }} className="text-[#94A3B8] hover:text-white mr-2" data-testid={`budget-edit-${ln.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(ln.id)} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`budget-del-${ln.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              <tr className="bg-[#0B1120] font-bold border-t-2 border-[#D4AF37]">
                <td className="p-2 text-[#5F7552]" colSpan={4}>RAZEM PRZYCHODY (Plan / Wyk)</td>
                <td className="p-2 text-right text-[#5F7552] tabular-nums">{fmtNum(totalIncomePlan)}</td>
                <td colSpan={2}></td>
                <td className="p-2 text-right text-[#5F7552] tabular-nums">{fmtNum(totalIncomeExec)}</td>
                <td colSpan={3}></td>
              </tr>
              <tr className="bg-[#0B1120] font-bold">
                <td className="p-2 text-[#D4AF37]" colSpan={4}>RAZEM KOSZTY (Plan / Wyk)</td>
                <td className="p-2 text-right text-[#D4AF37] tabular-nums">{fmtNum(totalPlan)}</td>
                <td colSpan={2}></td>
                <td className="p-2 text-right text-[#D4AF37] tabular-nums">{fmtNum(totalExec)}</td>
                <td colSpan={3}></td>
              </tr>
              <tr className="bg-[#0B1120] font-bold">
                <td className="p-2 text-white" colSpan={4}>MARŻA (Przychody − Koszty)</td>
                <td className="p-2 text-right text-white tabular-nums">{fmtNum(totalIncomePlan - totalPlan)}</td>
                <td colSpan={2}></td>
                <td className="p-2 text-right text-white tabular-nums">{fmtNum(totalIncomeExec - totalExec)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        )}
      </CardContent>
      {modalOpen && (
        <BudgetLineModal
          budowaId={budowaId}
          editLine={editLine}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchLines(); onChange && onChange(); }}
        />
      )}
    </Card>
  );
};

// =================== MODAL POZYCJA ===================
const BudgetLineModal = ({ budowaId, editLine, onClose, onSaved }) => {
  const [form, setForm] = useState({
    category: editLine?.category || '',
    name: editLine?.name || '',
    unit: editLine?.unit || '',
    quantity: editLine?.quantity || 0,
    unit_price_netto: editLine?.unit_price_netto || 0,
    plan_netto: editLine?.plan_netto ?? '',
    kaucja_gir_pct: editLine?.kaucja_gir_pct || 0,
    kaucja_dw_pct: editLine?.kaucja_dw_pct || 0,
    is_income: editLine?.is_income || false,
    notes: editLine?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.category.trim()) { toast.error('Podaj kategorię'); return; }
    if (!form.name.trim()) { toast.error('Podaj nazwę pozycji'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        budowa_id: budowaId,
        quantity: parseFloat(form.quantity) || 0,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0,
        plan_netto: form.plan_netto === '' || form.plan_netto === null ? null : parseFloat(form.plan_netto),
        kaucja_gir_pct: parseFloat(form.kaucja_gir_pct) || 0,
        kaucja_dw_pct: parseFloat(form.kaucja_dw_pct) || 0,
      };
      if (editLine) {
        delete payload.budowa_id;
        await api.patch(`/budget/lines/${editLine.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/budget/lines', payload);
        toast.success('Dodano pozycję');
      }
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>{editLine ? 'Edytuj pozycję' : 'Nowa pozycja budżetu'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} data-testid="budget-line-is-income" />
            <span className="text-[#5F7552]">Pozycja przychodowa (zaznacz dla pozycji wpływu, np. wynagrodzenie wykonawcy)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Kategoria *</label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="np. Beton, Stal, Robocizna" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-category" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Nazwa pozycji *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Beton C8/10 chudziaki" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-name" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Ilość</label>
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-quantity" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Jednostka</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="m3, t, mb" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-unit" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Cena j. netto</label>
              <Input type="number" step="0.01" value={form.unit_price_netto} onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-price" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Plan netto (opcjonalnie — domyślnie ilość × cena)</label>
            <Input type="number" step="0.01" value={form.plan_netto} onChange={(e) => setForm({ ...form, plan_netto: e.target.value })} placeholder="auto" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-plan" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Kaucja GIR (%)</label>
              <Input type="number" step="0.1" value={form.kaucja_gir_pct} onChange={(e) => setForm({ ...form, kaucja_gir_pct: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-gir" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Kaucja DW (%)</label>
              <Input type="number" step="0.1" value={form.kaucja_dw_pct} onChange={(e) => setForm({ ...form, kaucja_dw_pct: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-dw" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <Button onClick={save} disabled={saving} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="budget-line-save">
            {saving ? 'Zapisuję...' : 'Zapisz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =================== PROTOKOL DOWNLOADER ===================
const ProtokolDownloader = ({ budowaId, year }) => {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get(`/budget/${budowaId}/protokol/${year}/${month}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Protokol_${year}-${String(month).padStart(2, '0')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Protokół wygenerowany');
    } catch (e) {
      toast.error('Błąd generowania: ' + (e.response?.data?.detail || e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid="protokol-downloader">
      <select
        value={month}
        onChange={(e) => setMonth(parseInt(e.target.value, 10))}
        className="bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1.5 rounded text-sm"
        data-testid="protokol-month-select"
      >
        {MONTHS_PL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <Button
        size="sm"
        onClick={download}
        disabled={busy}
        className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8"
        data-testid="protokol-download-btn"
      >
        <FileDown className="h-4 w-4 mr-1" />
        {busy ? 'Generuję...' : 'Pobierz protokół xlsx'}
      </Button>
    </div>
  );
};

// =================== PROTOKOL (ZAAWANSOWANIE) ===================
const ProgressPanel = ({ budowaId, year }) => {
  const [lines, setLines] = useState([]);
  const [progress, setProgress] = useState([]);  // [{budget_line_id, year, month, progress_pct}]
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    if (!budowaId) return;
    setLoading(true);
    Promise.all([
      api.get(`/budget/${budowaId}/lines`),
      api.get(`/budget/${budowaId}/progress?year=${year}`),
    ]).then(([l, p]) => {
      setLines(l.data?.rows || []);
      setProgress(p.data?.rows || []);
    }).catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [budowaId, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // mapowanie {line_id_month: pct}
  const progMap = useMemo(() => {
    const m = {};
    progress.forEach((p) => { m[`${p.budget_line_id}_${p.month}`] = p.progress_pct; });
    return m;
  }, [progress]);

  const setCell = async (lineId, month, value) => {
    const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
    try {
      await api.post(`/budget/lines/${lineId}/progress`, { year, month, progress_pct: pct });
      // Update local
      setProgress((prev) => {
        const others = prev.filter((p) => !(p.budget_line_id === lineId && p.month === month));
        return [...others, { budget_line_id: lineId, year, month, progress_pct: pct, value_netto: 0 }];
      });
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  if (loading) return <div className="text-[#94A3B8] text-sm">Ładuję...</div>;
  if (lines.length === 0) {
    return (
      <Card className="bg-[#131C2F] border-[#2A3B59]">
        <CardContent className="pt-6 text-[#94A3B8] text-sm text-center">
          Brak pozycji budżetowych. Dodaj najpierw pozycje w zakładce „Budżet".
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-white text-base">Protokół zaawansowania — {year}</CardTitle>
            <p className="text-xs text-[#94A3B8] mt-1">Wpisz % wykonanej pracy w każdym miesiącu (0–100). Wartości narastająco.</p>
          </div>
          <ProtokolDownloader budowaId={budowaId} year={year} />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="progress-table">
          <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-[#131C2F] min-w-[180px]">Pozycja</th>
              <th className="text-right p-2">Plan</th>
              {MONTHS_PL.map((m, i) => (
                <th key={i} className="text-center p-1 min-w-[55px]">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((ln) => (
              <tr key={ln.id} className="border-b border-[#2A3B59]/40">
                <td className="p-2 text-white sticky left-0 bg-[#131C2F]">
                  <span className={`text-[10px] ${ln.is_income ? 'text-[#5F7552]' : 'text-[#D4AF37]'}`}>{ln.category}</span>
                  <div>{ln.name}</div>
                </td>
                <td className="p-2 text-right text-[#94A3B8] tabular-nums">{fmtNum(ln.plan_netto_computed)}</td>
                {MONTHS_PL.map((_, i) => {
                  const month = i + 1;
                  const val = progMap[`${ln.id}_${month}`];
                  return (
                    <td key={i} className="p-0.5 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        defaultValue={val === undefined ? '' : val}
                        onBlur={(e) => {
                          if (e.target.value === '' && val === undefined) return;
                          if (parseFloat(e.target.value) !== val) setCell(ln.id, month, e.target.value);
                        }}
                        className="w-12 bg-[#0B1120] border border-[#2A3B59] text-white text-center text-xs px-1 py-1 rounded"
                        data-testid={`progress-${ln.id}-${month}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

// =================== HARMONOGRAM ===================
const SchedulePanel = ({ budowaId, onChange }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [viewMode, setViewMode] = useState('list');  // 'list' | 'gantt'

  const fetchTasks = useCallback(() => {
    if (!budowaId) return;
    setLoading(true);
    api.get(`/budget/${budowaId}/tasks`)
      .then((r) => setTasks(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [budowaId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć zadanie?')) return;
    try {
      await api.delete(`/budget/tasks/${id}`);
      toast.success('Usunięte');
      fetchTasks();
      onChange && onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // Gantt - obliczamy zakres dat
  const ganttData = useMemo(() => {
    if (tasks.length === 0) return null;
    const dates = tasks.flatMap((t) => [new Date(t.start_date), new Date(t.end_date)]);
    const minD = new Date(Math.min(...dates));
    const maxD = new Date(Math.max(...dates));
    const totalDays = Math.max(1, Math.ceil((maxD - minD) / (1000 * 60 * 60 * 24)));
    return { minD, maxD, totalDays };
  }, [tasks]);

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base">Harmonogram zadań</CardTitle>
        <div className="flex gap-2">
          <div className="inline-flex rounded overflow-hidden border border-[#2A3B59]">
            <button onClick={() => setViewMode('list')} className={`px-3 py-1 text-xs ${viewMode === 'list' ? 'bg-[#D4AF37] text-[#0B1120]' : 'bg-[#131C2F] text-[#94A3B8]'}`} data-testid="schedule-view-list">Lista</button>
            <button onClick={() => setViewMode('gantt')} className={`px-3 py-1 text-xs ${viewMode === 'gantt' ? 'bg-[#D4AF37] text-[#0B1120]' : 'bg-[#131C2F] text-[#94A3B8]'}`} data-testid="schedule-view-gantt">Gantt</button>
          </div>
          <Button size="sm" onClick={() => { setEditTask(null); setModalOpen(true); }} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8" data-testid="schedule-add-task-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj zadanie
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? (
          <div className="text-[#94A3B8] text-sm">Ładuję...</div>
        ) : tasks.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="schedule-empty">
            Brak zadań. Kliknij „Dodaj zadanie" aby utworzyć harmonogram.
          </div>
        ) : viewMode === 'list' ? (
          <table className="w-full text-xs" data-testid="schedule-list-table">
            <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
              <tr>
                <th className="text-left p-2">Zadanie</th>
                <th className="text-left p-2">Start</th>
                <th className="text-left p-2">Koniec</th>
                <th className="text-right p-2">Dni</th>
                <th className="text-right p-2">% wyk.</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const days = Math.ceil((new Date(t.end_date) - new Date(t.start_date)) / (1000 * 60 * 60 * 24)) + 1;
                return (
                  <tr key={t.id} className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/40">
                    <td className="p-2 text-white">
                      <span className="inline-block w-3 h-3 rounded mr-2 align-middle" style={{ backgroundColor: t.color || '#D4AF37' }} />
                      {t.name}
                    </td>
                    <td className="p-2 text-[#CBD5E1]">{t.start_date}</td>
                    <td className="p-2 text-[#CBD5E1]">{t.end_date}</td>
                    <td className="p-2 text-right text-[#94A3B8] tabular-nums">{days}</td>
                    <td className="p-2 text-right text-[#D4AF37] tabular-nums">{t.progress_pct}%</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button onClick={() => { setEditTask(t); setModalOpen(true); }} className="text-[#94A3B8] hover:text-white mr-2" data-testid={`schedule-edit-${t.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(t.id)} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`schedule-del-${t.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <GanttView tasks={tasks} ganttData={ganttData} />
        )}
      </CardContent>
      {modalOpen && (
        <ScheduleTaskModal
          budowaId={budowaId}
          editTask={editTask}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchTasks(); onChange && onChange(); }}
        />
      )}
    </Card>
  );
};

const GanttView = ({ tasks, ganttData }) => {
  if (!ganttData) return null;
  const { minD, totalDays } = ganttData;
  const dayWidth = 24;  // px per dzien
  const totalWidth = totalDays * dayWidth;

  // Generuj naglowek z miesiacami
  const monthMarkers = [];
  const cur = new Date(minD);
  cur.setDate(1);
  while (cur <= new Date(minD.getTime() + totalDays * 24 * 60 * 60 * 1000)) {
    const offsetDays = Math.max(0, Math.floor((cur - minD) / (1000 * 60 * 60 * 24)));
    monthMarkers.push({
      label: `${MONTHS_PL[cur.getMonth()]} ${cur.getFullYear()}`,
      offset: offsetDays * dayWidth,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <div className="overflow-x-auto" data-testid="schedule-gantt">
      <div className="relative" style={{ minWidth: `${totalWidth + 240}px` }}>
        {/* Header z miesiacami */}
        <div className="flex border-b border-[#2A3B59]">
          <div className="w-60 shrink-0 p-2 text-xs text-[#94A3B8] font-semibold border-r border-[#2A3B59]">Zadanie</div>
          <div className="relative" style={{ width: `${totalWidth}px`, height: '32px' }}>
            {monthMarkers.map((m, i) => (
              <div key={i} className="absolute top-0 text-[10px] text-[#94A3B8] border-l border-[#2A3B59] h-full pl-1" style={{ left: `${m.offset}px` }}>
                {m.label}
              </div>
            ))}
          </div>
        </div>
        {/* Wiersze zadan */}
        {tasks.map((t) => {
          const start = new Date(t.start_date);
          const end = new Date(t.end_date);
          const startOffset = Math.max(0, (start - minD) / (1000 * 60 * 60 * 24));
          const duration = Math.max(1, (end - start) / (1000 * 60 * 60 * 24) + 1);
          return (
            <div key={t.id} className="flex border-b border-[#2A3B59]/30 hover:bg-[#0B1120]/40">
              <div className="w-60 shrink-0 p-2 text-xs text-white border-r border-[#2A3B59]">
                {t.name}
                <div className="text-[10px] text-[#94A3B8]">{t.progress_pct}%</div>
              </div>
              <div className="relative" style={{ width: `${totalWidth}px`, height: '36px' }}>
                <div
                  className="absolute top-1 h-6 rounded shadow flex items-center px-2 text-[10px] font-semibold text-[#0B1120] overflow-hidden"
                  style={{
                    left: `${startOffset * dayWidth}px`,
                    width: `${duration * dayWidth}px`,
                    backgroundColor: t.color || '#D4AF37',
                  }}
                  title={`${t.name} (${t.start_date} → ${t.end_date}, ${t.progress_pct}%)`}
                  data-testid={`gantt-bar-${t.id}`}
                >
                  <div className="absolute inset-0 bg-black/30" style={{ width: `${100 - t.progress_pct}%`, right: 0, left: 'auto' }} />
                  <span className="relative truncate">{t.progress_pct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ScheduleTaskModal = ({ budowaId, editTask, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: editTask?.name || '',
    start_date: editTask?.start_date || new Date().toISOString().slice(0, 10),
    end_date: editTask?.end_date || new Date().toISOString().slice(0, 10),
    progress_pct: editTask?.progress_pct || 0,
    color: editTask?.color || '#D4AF37',
    notes: editTask?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę'); return; }
    if (form.end_date < form.start_date) { toast.error('Data końca musi być po dacie startu'); return; }
    setSaving(true);
    try {
      const payload = { ...form, budowa_id: budowaId, progress_pct: parseFloat(form.progress_pct) || 0 };
      if (editTask) {
        delete payload.budowa_id;
        await api.patch(`/budget/tasks/${editTask.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/budget/tasks', payload);
        toast.success('Dodano zadanie');
      }
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{editTask ? 'Edytuj zadanie' : 'Nowe zadanie'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#94A3B8]">Nazwa zadania *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-name" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Start *</label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-start" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Koniec *</label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-end" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">% wykonania</label>
              <Input type="number" min="0" max="100" value={form.progress_pct} onChange={(e) => setForm({ ...form, progress_pct: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-progress" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Kolor</label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="bg-[#0B1120] border-[#2A3B59] h-9" data-testid="task-color" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <Button onClick={save} disabled={saving} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="task-save">
            {saving ? 'Zapisuję...' : 'Zapisz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Budget;
