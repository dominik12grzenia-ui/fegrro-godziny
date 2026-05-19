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

// =================== TABELA EXCEL-STYLE (Materiały + Robocizna obok siebie) ===================
const fmtCell = (v) => (v == null || v === 0) ? '— zł' : `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const fmtCellNum = (v) => (v == null || v === 0) ? '0' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const BudgetExcelView = ({ lines, onProgressChange }) => {
  // Filtruj wedlug typu
  const materials = useMemo(() => lines.filter(l => !l.is_income && (l.type || 'materials') === 'materials'), [lines]);
  const labor = useMemo(() => lines.filter(l => !l.is_income && l.type === 'labor'), [lines]);
  const maxRows = Math.max(materials.length, labor.length, 1);

  const KAUCJA_BG = 'rgba(79, 99, 67, 0.25)';
  const PRZEROB_BG = 'rgba(212, 175, 55, 0.18)';
  const HEADER_BG = '#4F6343';
  const HEADER_DARK = '#3F5235';
  const BORDER = '#2A3B59';
  const SEPARATOR = '#D4AF37'; // złoty pionowy separator między blokami

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]" data-testid="budget-excel-view">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <span style={{ color: '#D4AF37' }}>▦</span> Widok zestawienia kosztorysowego
        </CardTitle>
        <p className="text-xs text-[#94A3B8] mt-1">
          Pełna tabela 1:1 z arkuszem wykonawczym. Kolumny <span style={{ color: '#5F7552' }}>zielone</span> = kaucje (z Finansów). Kolumny <span style={{ color: '#D4AF37' }}>złote</span> = przeroby (wykonanie z Finansów). Wiersz <span className="font-bold" style={{ color: SEPARATOR }}>|</span> = separator bloków.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="text-[10px] border-collapse" style={{ minWidth: '1900px' }} data-testid="excel-combined-table">
          <thead>
            {/* Wiersz 1: 2 grupowe naglowki */}
            <tr>
              <th colSpan={13} className="p-1.5 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER }}>
                MATERIAŁY ({materials.length})
              </th>
              <th colSpan={8} className="p-1.5 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER, borderLeft: `2px solid ${SEPARATOR}` }}>
                ROBOCIZNA ({labor.length})
              </th>
            </tr>
            {/* Wiersz 2: nazwy kolumn */}
            <tr style={{ backgroundColor: HEADER_BG }}>
              {['KOD', 'NAZWA', 'JD.', 'ILOŚĆ', 'CENA MATERIAŁU', 'BUDŻET', 'KAUCJA GIR', 'KAUCJA DW', 'BUDŻET ZW.', 'CENA B. JD.', 'PRZEROBY M', 'KOSZT ZAKUPU', 'CENA ZAKUPU'].map((h, i) => (
                <th key={`m-${i}`} className="p-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER }}>{h}</th>
              ))}
              {['KOD', 'NAZWA', 'BUDŻET', 'KAUCJA GIR', 'KAUCJA DW', 'BUDŻET ZW.', 'PRZEROBY R', '% ZAAW.'].map((h, i) => (
                <th key={`r-${i}`} className="p-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER, ...(i === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(materials.length === 0 && labor.length === 0) ? (
              <tr><td colSpan={21} className="p-4 text-center text-[#94A3B8] border" style={{ borderColor: BORDER }}>Brak pozycji. Dodaj najpierw pozycje budżetu.</td></tr>
            ) : Array.from({ length: maxRows }, (_, i) => {
              const m = materials[i];
              const r = labor[i];
              return (
                <tr key={i} className="hover:bg-[#0B1120]/40">
                  {/* MATERIAŁY (13 kolumn) */}
                  {m ? (() => {
                    const plan = m.plan_netto_computed || 0;
                    const ilosc = m.quantity || 0;
                    const cena = m.unit_price_netto || 0;
                    const kg = m.kaucja_gir_amount || 0;
                    const kd = m.kaucja_dw_amount || 0;
                    const bzw = plan - kg - kd;
                    const cenaBjd = ilosc > 0 ? plan / ilosc : 0;
                    const przerob = m.execution_netto || 0;
                    const cenaZakupu = ilosc > 0 ? przerob / ilosc : 0;
                    return (
                      <>
                        <td className="p-1 text-center text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER }}>{i + 1}</td>
                        <td className="p-1 text-left text-white border whitespace-nowrap" style={{ borderColor: BORDER }}>{m.name}</td>
                        <td className="p-1 text-center text-[#94A3B8] border" style={{ borderColor: BORDER }}>{m.unit || '—'}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER }}>{fmtCellNum(ilosc)}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(cena)}</td>
                        <td className="p-1 text-right text-white font-semibold border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(plan)}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(bzw)}</td>
                        <td className="p-1 text-right text-[#94A3B8] border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(cenaBjd)}</td>
                        <td className="p-1 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ borderColor: BORDER, backgroundColor: PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className="p-1 text-right text-[#94A3B8] border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(przerob)}</td>
                        <td className="p-1 text-right text-[#94A3B8] border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(cenaZakupu)}</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 13 }, (_, j) => (
                      <td key={`em-${j}`} className="p-1 border bg-[#0B1120]/30" style={{ borderColor: BORDER }}>&nbsp;</td>
                    ))}</>
                  )}
                  {/* ROBOCIZNA (8 kolumn) */}
                  {r ? (() => {
                    const plan = r.plan_netto_computed || 0;
                    const kg = r.kaucja_gir_amount || 0;
                    const kd = r.kaucja_dw_amount || 0;
                    const bzw = plan - kg - kd;
                    const przerob = r.execution_netto || 0;
                    const pct = r.progress_pct || 0;
                    return (
                      <>
                        <td className="p-1 text-center text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER, borderLeft: `2px solid ${SEPARATOR}` }}>{14 + i}</td>
                        <td className="p-1 text-left text-white border whitespace-nowrap" style={{ borderColor: BORDER }}>{r.name}</td>
                        <td className="p-1 text-right text-white font-semibold border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(plan)}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="p-1 text-right text-[#CBD5E1] border tabular-nums" style={{ borderColor: BORDER }}>{fmtCell(bzw)}</td>
                        <td className="p-1 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ borderColor: BORDER, backgroundColor: PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className={`p-1 text-right border tabular-nums font-semibold ${pct >= 100 ? 'text-[#9B2C2C]' : pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`} style={{ borderColor: BORDER }}>{Math.round(pct)}%</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 8 }, (_, j) => (
                      <td key={`er-${j}`} className="p-1 border bg-[#0B1120]/30" style={{ borderColor: BORDER, ...(j === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>&nbsp;</td>
                    ))}</>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

// =================== TYPY BUDŻETU ===================
const BUDGET_TYPES = {
  materials: { label: 'Materiały', short: 'M', color: '#D4AF37', bg: '#D4AF37', textOnBg: '#0B1120' },
  labor:     { label: 'Robocizna', short: 'R', color: '#5F7552', bg: '#5F7552', textOnBg: '#FFFFFF' },
  equipment: { label: 'Sprzęt',    short: 'S', color: '#94A3B8', bg: '#64748B', textOnBg: '#FFFFFF' },
};

// =================== BUDZET (POZYCJE) ===================
const BudgetLinesPanel = ({ budowaId, onChange }) => {
  const [lines, setLines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stages, setStages] = useState([]);
  const [budowaInfo, setBudowaInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLine, setEditLine] = useState(null);
  const [managerOpen, setManagerOpen] = useState(null); // null | 'categories' | 'stages'

  const fetchAll = useCallback(() => {
    if (!budowaId) return;
    setLoading(true);
    Promise.all([
      api.get(`/budget/${budowaId}/lines`),
      api.get(`/budget/${budowaId}/categories`),
      api.get(`/budget/${budowaId}/stages`),
      api.get(`/budget/${budowaId}/budowa-info`),
    ]).then(([l, c, s, b]) => {
      setLines(l.data?.rows || []);
      setCategories(c.data?.rows || []);
      setStages(s.data?.rows || []);
      setBudowaInfo(b.data || null);
    }).catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [budowaId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję? Spowoduje to wyczyszczenie powiązań z zapisami.')) return;
    try {
      await api.delete(`/budget/lines/${id}`);
      toast.success('Pozycja usunięta');
      fetchAll();
      onChange && onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // Grupowanie: Etap > Typ (M/R/S) > Pozycje
  const grouped = useMemo(() => {
    const tree = {}; // stage_id (lub '__none__') -> { stage, types: { type -> { lines, plan, exec } }, plan, exec }
    const stageMap = Object.fromEntries(stages.map((s) => [s.id, s]));
    lines.forEach((ln) => {
      if (ln.is_income) return; // przychody pokazujemy osobno
      const stageKey = ln.stage_id || '__none__';
      if (!tree[stageKey]) {
        tree[stageKey] = { stage: stageMap[ln.stage_id] || null, types: {}, plan: 0, exec: 0 };
      }
      const type = ln.type || 'materials';
      if (!tree[stageKey].types[type]) {
        tree[stageKey].types[type] = { lines: [], plan: 0, exec: 0 };
      }
      tree[stageKey].types[type].lines.push(ln);
      tree[stageKey].types[type].plan += ln.plan_netto_computed || 0;
      tree[stageKey].types[type].exec += ln.execution_netto || 0;
      tree[stageKey].plan += ln.plan_netto_computed || 0;
      tree[stageKey].exec += ln.execution_netto || 0;
    });
    return tree;
  }, [lines, stages]);

  // Sumy per typ (do kafelkow podsumowania)
  const totalsByType = useMemo(() => {
    const t = { materials: { plan: 0, exec: 0 }, labor: { plan: 0, exec: 0 }, equipment: { plan: 0, exec: 0 } };
    lines.filter(l => !l.is_income).forEach((ln) => {
      const type = ln.type || 'materials';
      if (!t[type]) t[type] = { plan: 0, exec: 0 };
      t[type].plan += ln.plan_netto_computed || 0;
      t[type].exec += ln.execution_netto || 0;
    });
    return t;
  }, [lines]);

  const totalPlan = lines.filter(l => !l.is_income).reduce((s, l) => s + (l.plan_netto_computed || 0), 0);
  const totalExec = lines.filter(l => !l.is_income).reduce((s, l) => s + (l.execution_netto || 0), 0);
  const totalIncomePlan = lines.filter(l => l.is_income).reduce((s, l) => s + (l.plan_netto_computed || 0), 0);
  const totalIncomeExec = lines.filter(l => l.is_income).reduce((s, l) => s + (l.execution_netto || 0), 0);
  const zyskBiezacy = totalIncomeExec - totalExec;

  return (
    <>
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base">Pozycje budżetu</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline"
            onClick={() => setManagerOpen('stages')}
            className="border-[#2A3B59] text-[#94A3B8] hover:text-white h-8" data-testid="budget-manage-stages-btn">
            Etapy ({stages.length})
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => setManagerOpen('categories')}
            className="border-[#2A3B59] text-[#94A3B8] hover:text-white h-8" data-testid="budget-manage-categories-btn">
            Kategorie ({categories.length})
          </Button>
          <Button size="sm"
            onClick={() => { setEditLine(null); setModalOpen(true); }}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8"
            data-testid="budget-add-line-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto space-y-3">
        {/* === 3 kafelki podsumowania per Typ === */}
        {!loading && lines.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2" data-testid="budget-type-cards">
            {Object.entries(BUDGET_TYPES).map(([key, cfg]) => {
              const t = totalsByType[key] || { plan: 0, exec: 0 };
              const pct = t.plan > 0 ? Math.round((t.exec / t.plan) * 100) : 0;
              return (
                <div key={key} className="rounded p-3 border" style={{ borderColor: cfg.color, backgroundColor: `${cfg.color}10` }} data-testid={`type-card-${key}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded flex items-center justify-center font-bold text-sm" style={{ backgroundColor: cfg.bg, color: cfg.textOnBg }}>
                        {cfg.short}
                      </div>
                      <div className="font-semibold text-white text-sm">{cfg.label}</div>
                    </div>
                    <div className="text-xs tabular-nums font-bold" style={{ color: cfg.color }}>{pct}%</div>
                  </div>
                  <div className="text-[10px] text-[#94A3B8] flex justify-between"><span>Plan</span><span className="text-white tabular-nums">{fmtNum(t.plan)} zł</span></div>
                  <div className="text-[10px] text-[#94A3B8] flex justify-between"><span>Wykonanie</span><span className="tabular-nums" style={{ color: cfg.color }}>{fmtNum(t.exec)} zł</span></div>
                  <div className="text-[10px] text-[#94A3B8] flex justify-between"><span>Pozostało</span><span className={`tabular-nums ${(t.plan - t.exec) < 0 ? 'text-[#FCA5A5]' : 'text-[#CBD5E1]'}`}>{fmtNum(t.plan - t.exec)} zł</span></div>
                </div>
              );
            })}
          </div>
        )}

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
                <th className="text-left p-2">Etap / Typ / Pozycja</th>
                <th className="text-right p-2">Ilość</th>
                <th className="text-right p-2">Jedn.</th>
                <th className="text-right p-2">Cena j.</th>
                <th className="text-right p-2">Budżet</th>
                <th className="text-right p-2">Kaucja GIR</th>
                <th className="text-right p-2">Kaucja DW</th>
                <th className="text-right p-2">Wykonanie</th>
                <th className="text-right p-2">%</th>
                <th className="text-right p-2">Pozostało</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([stageKey, sg]) => (
                <React.Fragment key={stageKey}>
                  <tr className="bg-[#4F6343]/30">
                    <td colSpan={11} className="p-2 font-bold text-white text-sm">
                      ▣ {sg.stage ? sg.stage.name : 'Bez etapu'}
                      {sg.stage && (sg.stage.start_date || sg.stage.end_date) && (
                        <span className="text-[#94A3B8] font-normal text-xs ml-2">
                          ({sg.stage.start_date || '?'} → {sg.stage.end_date || '?'})
                        </span>
                      )}
                      <span className="text-[#94A3B8] font-normal ml-2 text-xs">
                        — Plan: {fmtNum(sg.plan)} zł, Wyk: {fmtNum(sg.exec)} zł
                      </span>
                    </td>
                  </tr>
                  {/* Per typ - kolejnosc M/R/S */}
                  {['materials', 'labor', 'equipment'].map((typeKey) => {
                    const g = sg.types[typeKey];
                    if (!g) return null;
                    const cfg = BUDGET_TYPES[typeKey];
                    const tpct = g.plan > 0 ? Math.round((g.exec / g.plan) * 100) : 0;
                    return (
                      <React.Fragment key={`${stageKey}-${typeKey}`}>
                        <tr className="bg-[#0B1120]">
                          <td colSpan={11} className="p-2 pl-6">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px]" style={{ backgroundColor: cfg.bg, color: cfg.textOnBg }}>
                                {cfg.short}
                              </div>
                              <span className="font-semibold text-xs" style={{ color: cfg.color }}>{cfg.label}</span>
                              <span className="text-[#94A3B8] font-normal text-xs">
                                ({fmtNum(g.exec)} / {fmtNum(g.plan)} zł — {tpct}%)
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.lines.map((ln) => (
                          <tr key={ln.id} className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/40" data-testid={`budget-line-${ln.id}`}>
                            <td className="p-2 pl-12 text-white">
                              {ln.name}
                              {ln.category && <span className="ml-2 text-[10px] text-[#94A3B8]">[{ln.category}]</span>}
                            </td>
                            <td className="p-2 text-right text-[#CBD5E1] tabular-nums">{ln.quantity ? fmtNum(ln.quantity) : '—'}</td>
                            <td className="p-2 text-right text-[#94A3B8]">{ln.unit || '—'}</td>
                            <td className="p-2 text-right text-[#CBD5E1] tabular-nums">{ln.unit_price_netto ? fmtNum(ln.unit_price_netto) : '—'}</td>
                            <td className="p-2 text-right text-white font-semibold tabular-nums">{fmtNum(ln.plan_netto_computed)}</td>
                            <td className="p-2 text-right text-[#94A3B8] tabular-nums">{ln.effective_kaucja_gir_pct ? `${ln.effective_kaucja_gir_pct}% (${fmtNum(ln.kaucja_gir_amount)})` : '—'}</td>
                            <td className="p-2 text-right text-[#94A3B8] tabular-nums">{ln.effective_kaucja_dw_pct ? `${ln.effective_kaucja_dw_pct}% (${fmtNum(ln.kaucja_dw_amount)})` : '—'}</td>
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
                    );
                  })}
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
                <td className="p-2 text-white" colSpan={4}>ZYSK BIEŻĄCY (Przychody Wyk − Koszty Wyk)</td>
                <td colSpan={3}></td>
                <td className={`p-2 text-right tabular-nums ${zyskBiezacy >= 0 ? 'text-[#5F7552]' : 'text-[#FCA5A5]'}`}>{fmtNum(zyskBiezacy)}</td>
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
          categories={categories}
          stages={stages}
          budowaInfo={budowaInfo}
          onCategoriesChanged={fetchAll}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchAll(); onChange && onChange(); }}
        />
      )}
      {managerOpen === 'categories' && (
        <CategoryStageManager
          mode="categories"
          budowaId={budowaId}
          items={categories}
          onClose={() => setManagerOpen(null)}
          onChanged={fetchAll}
        />
      )}
      {managerOpen === 'stages' && (
        <CategoryStageManager
          mode="stages"
          budowaId={budowaId}
          items={stages}
          onClose={() => setManagerOpen(null)}
          onChanged={fetchAll}
        />
      )}
    </Card>
    {/* === Tabela Excel-style na dole === */}
    {!loading && lines.length > 0 && (
      <div className="mt-4">
        <BudgetExcelView lines={lines} />
      </div>
    )}
    </>
  );
};

// =================== MANAGER KATEGORII / ETAPÓW ===================
const CategoryStageManager = ({ mode, budowaId, items, onClose, onChanged }) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const isStages = mode === 'stages';
  const label = isStages ? 'Etapy budowy' : 'Kategorie kosztowe';

  const add = async () => {
    if (!name.trim()) { toast.error('Podaj nazwę'); return; }
    setBusy(true);
    try {
      const url = isStages ? '/budget/stages' : '/budget/categories';
      const payload = { budowa_id: budowaId, name: name.trim() };
      if (isStages) {
        payload.start_date = startDate || null;
        payload.end_date = endDate || null;
      }
      await api.post(url, payload);
      toast.success('Dodano');
      setName(''); setStartDate(''); setEndDate('');
      onChanged();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm(`Usunąć ${isStages ? 'etap' : 'kategorię'}? Pozycje pozostaną, ale stracą przypisanie.`)) return;
    try {
      const url = isStages ? `/budget/stages/${id}` : `/budget/categories/${id}`;
      await api.delete(url);
      toast.success('Usunięto');
      onChanged();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid={`manager-${mode}-modal`}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <p className="text-xs text-[#94A3B8] mt-1">
            {isStages
              ? 'Etapy grupują wizualnie pozycje budżetu (np. „Stan zerowy", „Konstrukcja", „Wykończenia").'
              : 'Kategorie kosztowe to predefiniowane grupy używane w pozycjach budżetu (np. „Beton", „Stal", „Robocizna").'}
          </p>
        </DialogHeader>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-xs text-[#94A3B8] py-2 text-center">Brak — dodaj pierwszy poniżej</div>
          ) : items.map((it) => (
            <div key={it.id} className="flex items-center justify-between bg-[#0B1120] rounded px-3 py-1.5 text-sm" data-testid={`manager-item-${it.id}`}>
              <div>
                <span className="text-white">{it.name}</span>
                {isStages && (it.start_date || it.end_date) && (
                  <span className="text-[#94A3B8] text-xs ml-2">({it.start_date || '?'} → {it.end_date || '?'})</span>
                )}
                {it.lines_count !== undefined && (
                  <span className="text-[#94A3B8] text-xs ml-2">[{it.lines_count} poz.]</span>
                )}
              </div>
              <button onClick={() => remove(it.id)} className="text-[#FCA5A5] hover:text-[#F87171]" data-testid={`manager-del-${it.id}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-[#2A3B59] pt-3 space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={isStages ? 'Nazwa etapu, np. Stan surowy' : 'Nazwa kategorii, np. Beton'}
            className="bg-[#0B1120] border-[#2A3B59]" data-testid={`manager-new-name-${mode}`} />
          {isStages && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                placeholder="Start" className="bg-[#0B1120] border-[#2A3B59]" data-testid="manager-stage-start" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                placeholder="Koniec" className="bg-[#0B1120] border-[#2A3B59]" data-testid="manager-stage-end" />
            </div>
          )}
          <Button onClick={add} disabled={busy} className="w-full bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid={`manager-add-${mode}`}>
            <Plus className="h-4 w-4 mr-1" /> Dodaj
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =================== MODAL POZYCJA ===================
const BudgetLineModal = ({ budowaId, editLine, categories, stages, budowaInfo, onCategoriesChanged, onClose, onSaved }) => {
  // Defaulty Kaucja z Finansów (effective_kaucja_*) gdy nowa pozycja
  const defaultGir = budowaInfo?.kaucja_gir_pct ?? 0;
  const defaultDw = budowaInfo?.kaucja_dw_pct ?? 0;
  const [form, setForm] = useState({
    category: editLine?.category || (categories[0]?.name || ''),
    stage_id: editLine?.stage_id || '',
    type: editLine?.type || 'materials',
    name: editLine?.name || '',
    unit: editLine?.unit || '',
    quantity: editLine?.quantity ?? 0,
    unit_price_netto: editLine?.unit_price_netto ?? 0,
    plan_netto_override: editLine?.plan_netto != null ? String(editLine.plan_netto) : '',  // pusty = auto
    // Override kaucji: pusty = uzyj defaultu z Finansow
    kaucja_gir_pct: editLine?.kaucja_gir_pct != null ? String(editLine.kaucja_gir_pct) : '',
    kaucja_dw_pct: editLine?.kaucja_dw_pct != null ? String(editLine.kaucja_dw_pct) : '',
    is_income: editLine?.is_income || false,
    notes: editLine?.notes || '',
  });
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [saving, setSaving] = useState(false);

  // Live auto-calc plan netto = ilosc x cena (chyba ze override)
  const autoPlan = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price_netto) || 0);
  const finalPlan = form.plan_netto_override !== ''
    ? (parseFloat(form.plan_netto_override) || 0)
    : autoPlan;

  // Efektywne kaucje (do podgladu kwot)
  const effGir = form.kaucja_gir_pct !== '' ? (parseFloat(form.kaucja_gir_pct) || 0) : defaultGir;
  const effDw = form.kaucja_dw_pct !== '' ? (parseFloat(form.kaucja_dw_pct) || 0) : defaultDw;

  const addCategory = async () => {
    if (!newCatName.trim()) { toast.error('Podaj nazwę'); return; }
    try {
      const r = await api.post('/budget/categories', { budowa_id: budowaId, name: newCatName.trim() });
      toast.success('Dodano kategorię');
      setForm({ ...form, category: r.data.name });
      setNewCatName(''); setNewCatMode(false);
      onCategoriesChanged && onCategoriesChanged();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const save = async () => {
    if (!form.category.trim()) { toast.error('Wybierz kategorię'); return; }
    if (!form.name.trim()) { toast.error('Podaj nazwę pozycji'); return; }
    setSaving(true);
    try {
      const payload = {
        budowa_id: budowaId,
        category: form.category,
        stage_id: form.stage_id || null,
        type: form.type || 'materials',
        name: form.name,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0,
        plan_netto: form.plan_netto_override === '' ? null : parseFloat(form.plan_netto_override),
        kaucja_gir_pct: form.kaucja_gir_pct === '' ? null : parseFloat(form.kaucja_gir_pct),
        kaucja_dw_pct: form.kaucja_dw_pct === '' ? null : parseFloat(form.kaucja_dw_pct),
        is_income: form.is_income,
        notes: form.notes,
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
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editLine ? 'Edytuj pozycję' : 'Nowa pozycja budżetu'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} data-testid="budget-line-is-income" />
            <span className="text-[#5F7552]">Pozycja przychodowa</span>
          </label>

          {/* Kategoria + Etap dropdowny */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Kategoria *</label>
              {!newCatMode ? (
                <div className="flex gap-1">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="flex-1 bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1.5 rounded text-sm"
                    data-testid="budget-line-category-select">
                    <option value="">— wybierz —</option>
                    {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <button onClick={() => setNewCatMode(true)} className="text-[#D4AF37] hover:text-[#B8941F] px-2"
                    title="Dodaj nową kategorię" data-testid="budget-line-new-cat-btn">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nowa kategoria" className="bg-[#0B1120] border-[#2A3B59] text-sm h-8"
                    data-testid="budget-line-new-cat-name" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }} />
                  <button onClick={addCategory} className="text-[#5F7552] hover:text-[#7CA169] px-2" data-testid="budget-line-new-cat-save">✓</button>
                  <button onClick={() => { setNewCatMode(false); setNewCatName(''); }} className="text-[#94A3B8] hover:text-white px-2">✕</button>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Etap budowy</label>
              <select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })}
                className="w-full bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1.5 rounded text-sm"
                data-testid="budget-line-stage-select">
                <option value="">— bez etapu —</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Typ budżetu - radio buttons */}
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">Typ budżetu *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(BUDGET_TYPES).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, type: key })}
                  className={`px-3 py-2 rounded text-xs font-semibold border transition flex items-center justify-center gap-2 ${
                    form.type === key
                      ? 'border-2'
                      : 'border-[#2A3B59] text-[#94A3B8] hover:text-white'
                  }`}
                  style={form.type === key ? { borderColor: cfg.color, backgroundColor: `${cfg.color}20`, color: cfg.color } : {}}
                  data-testid={`budget-line-type-${key}`}
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px]" style={{ backgroundColor: cfg.bg, color: cfg.textOnBg }}>
                    {cfg.short}
                  </div>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#94A3B8]">Nazwa pozycji *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="np. Beton C8/10 chudziaki" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-name" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Ilość</label>
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-quantity" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Jednostka</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="m3, t, mb" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-unit" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Cena j. netto</label>
              <Input type="number" step="0.01" value={form.unit_price_netto} onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-price" />
            </div>
          </div>

          {/* Auto-calc Plan netto */}
          <div className="bg-[#0B1120] rounded p-2 border border-[#2A3B59]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#94A3B8]">Plan netto = Ilość × Cena =</span>
              <span className="text-[#D4AF37] font-bold tabular-nums text-sm" data-testid="budget-line-plan-auto">
                {fmtNum(autoPlan)} zł
              </span>
            </div>
            <details className="mt-1">
              <summary className="text-xs text-[#94A3B8] cursor-pointer hover:text-white">Nadpisz wartość ręcznie</summary>
              <Input type="number" step="0.01" value={form.plan_netto_override}
                onChange={(e) => setForm({ ...form, plan_netto_override: e.target.value })}
                placeholder="puste = auto" className="bg-[#131C2F] border-[#2A3B59] mt-1 h-8 text-xs"
                data-testid="budget-line-plan-override" />
            </details>
          </div>

          {/* Kaucje z defaultem z Finansów */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">
                Kaucja GIR (%) <span className="text-[#5F7552]">domyślnie {defaultGir}%</span>
              </label>
              <Input type="number" step="0.1" value={form.kaucja_gir_pct}
                onChange={(e) => setForm({ ...form, kaucja_gir_pct: e.target.value })}
                placeholder={`${defaultGir}`} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-gir" />
              <div className="text-[10px] text-[#94A3B8] mt-0.5 tabular-nums">
                = {fmtNum(finalPlan * effGir / 100)} zł
              </div>
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">
                Kaucja DW (%) <span className="text-[#5F7552]">domyślnie {defaultDw}%</span>
              </label>
              <Input type="number" step="0.1" value={form.kaucja_dw_pct}
                onChange={(e) => setForm({ ...form, kaucja_dw_pct: e.target.value })}
                placeholder={`${defaultDw}`} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-dw" />
              <div className="text-[10px] text-[#94A3B8] mt-0.5 tabular-nums">
                = {fmtNum(finalPlan * effDw / 100)} zł
              </div>
            </div>
          </div>

          {/* Info: dane umowy/zamawiajacy (z Finansow) */}
          {budowaInfo && (
            <div className="bg-[#0B1120]/60 border border-[#2A3B59] rounded p-2 text-[10px] text-[#94A3B8]">
              <div><span className="text-[#5F7552]">Umowa:</span> {budowaInfo.umowa_nr || <em className="text-[#FCA5A5]">brak — uzupełnij przed protokołem</em>}</div>
              <div><span className="text-[#5F7552]">Zamawiający:</span> {budowaInfo.zamawiajacy ? budowaInfo.zamawiajacy.substring(0, 80) + (budowaInfo.zamawiajacy.length > 80 ? '...' : '') : <em className="text-[#FCA5A5]">brak — uzupełnij przed protokołem</em>}</div>
            </div>
          )}

          <div>
            <label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-notes" />
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

// =================== NIP LOOKUP (Biala Lista MF) ===================
const BudgetNipLookup = ({ onResult }) => {
  const [nip, setNip] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchGus = async () => {
    const cleaned = nip.replace(/\D/g, '');
    if (cleaned.length !== 10) { toast.error('NIP musi mieć 10 cyfr'); return; }
    setBusy(true);
    try {
      const r = await api.get(`/finance/gus-lookup/${cleaned}`);
      onResult(r.data.formatted);
      toast.success(`Załadowano: ${r.data.name}`);
      setNip('');
    } catch (e) {
      toast.error('GUS: ' + (e.response?.data?.detail || e.message));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex gap-1 mb-1.5">
      <Input value={nip} onChange={(e) => setNip(e.target.value)}
        placeholder="NIP (10 cyfr)" maxLength={13}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fetchGus(); } }}
        className="h-7 text-xs bg-[#0B1120] border-[#2A3B59] text-white no-spinner"
        data-testid="budget-nip-lookup-input" />
      <Button type="button" size="sm" onClick={fetchGus} disabled={busy}
        className="h-7 px-2 text-xs bg-[#4F6343] hover:bg-[#3F5235] text-white whitespace-nowrap"
        data-testid="budget-nip-lookup-btn">
        {busy ? 'Pobieram...' : 'Pobierz z GUS'}
      </Button>
    </div>
  );
};

// =================== MODAL: UZUPELNIJ DANE DO UMOWY ===================
const ContractDataModal = ({ budowaId, initial, onClose, onSaved }) => {
  const [form, setForm] = useState({
    umowa_nr: initial?.umowa_nr || '',
    umowa_data: initial?.umowa_data || '',
    zamawiajacy: initial?.zamawiajacy || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.umowa_nr.trim()) { toast.error('Podaj numer umowy'); return; }
    if (!form.zamawiajacy.trim()) { toast.error('Podaj dane zamawiającego'); return; }
    setSaving(true);
    try {
      await api.patch(`/budget/${budowaId}/contract`, form);
      toast.success('Zapisane');
      onSaved();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-lg" data-testid="contract-data-modal">
        <DialogHeader>
          <DialogTitle>Uzupełnij dane do umowy</DialogTitle>
          <p className="text-xs text-[#94A3B8] mt-1">
            Te dane pojawią się w nagłówku każdego protokołu tej budowy. Uzupełnij je raz — później będą używane automatycznie.
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">Numer umowy *</label>
            <Input value={form.umowa_nr} onChange={(e) => setForm({...form, umowa_nr: e.target.value})}
              placeholder="np. UMOWA 051/FEGRRO/PLICHTA MG LETNICA/26"
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="contract-umowa-nr" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">Data umowy</label>
            <Input value={form.umowa_data} onChange={(e) => setForm({...form, umowa_data: e.target.value})}
              placeholder="np. 15.09.2025 + ANEKS NR 1"
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="contract-umowa-data" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">Zamawiający (nazwa, adres, NIP) *</label>
            <BudgetNipLookup onResult={(text) => setForm({...form, zamawiajacy: text})} />
            <textarea value={form.zamawiajacy} onChange={(e) => setForm({...form, zamawiajacy: e.target.value})}
              rows={3}
              placeholder="np. ALLCON BUDOWNICTWO Sp. z o.o., al. marsz. Piłsudskiego 11/2.1, 81-400 Gdynia, NIP 5862181834"
              className="w-full bg-[#0B1120] border border-[#2A3B59] text-white rounded px-2 py-1.5 text-sm"
              data-testid="contract-zamawiajacy" />
          </div>
          <div className="bg-[#0B1120] border border-[#4F6343]/40 rounded p-2 text-xs">
            <div className="text-[#94A3B8] mb-1">Wykonawca (stały):</div>
            <div className="text-[#5F7552] font-semibold">FEGRRO SP. Z O.O.</div>
            <div className="text-[#CBD5E1]">NIP: 589-206-61-74</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <Button onClick={save} disabled={saving} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="contract-save">
            {saving ? 'Zapisuję...' : 'Zapisz i pobierz protokół'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =================== PROTOKOL (ZAAWANSOWANIE) — widok Excel ===================
const fmtPLN = (v) => `${Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const fmtQty = (v) => Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPrice = (v) => `${Math.round(Number(v || 0)).toLocaleString('pl-PL')} zł`;

const ProgressPanel = ({ budowaId, year }) => {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState(null); // { nr, rows, totals }
  const [loading, setLoading] = useState(true);
  // Stan lokalny dla edytowanych % miesiaca rozliczeniowego (line_id -> string)
  const [edits, setEdits] = useState({});

  const fetchData = useCallback(() => {
    if (!budowaId) return;
    setLoading(true);
    api.get(`/budget/${budowaId}/protokol-view/${year}/${month}`)
      .then((r) => { setData(r.data); setEdits({}); })
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [budowaId, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveCell = async (lineId, currentMiesiacPct, prevPct, plan, value) => {
    const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
    if (prevPct + pct > 100.01) {
      const max = Math.max(0, 100 - prevPct);
      toast.error(`Pozostało do rozdysponowania: ${max.toFixed(1)}% (poprzednie miesiące: ${prevPct.toFixed(1)}%)`);
      return null;
    }
    if (Math.abs(pct - currentMiesiacPct) < 0.001) return pct;
    try {
      await api.post(`/budget/lines/${lineId}/progress`, { year, month, progress_pct: pct });
      // Optymistyczna aktualizacja danych
      setData((d) => {
        if (!d) return d;
        const newRows = d.rows.map((row) => {
          if (row.type === 'line' && row.id === lineId) {
            const miesiac_val = Math.round(plan * pct / 100 * 100) / 100;
            const narast_pct = Math.min(100, prevPct + pct);
            const narast_val = Math.round(plan * narast_pct / 100 * 100) / 100;
            return { ...row, miesiac_pct: pct, miesiac_val, narast_pct, narast_val };
          }
          return row;
        });
        // Przelicz totale
        const lineRows = newRows.filter(r => r.type === 'line');
        const sum_budzet = lineRows.reduce((s, r) => s + (r.plan_netto || 0), 0);
        const sum_narast = lineRows.reduce((s, r) => s + (r.narast_val || 0), 0);
        const sum_prev = lineRows.reduce((s, r) => s + (r.prev_val || 0), 0);
        const sum_miesiac = lineRows.reduce((s, r) => s + (r.miesiac_val || 0), 0);
        return {
          ...d, rows: newRows,
          totals: {
            plan_netto: sum_budzet, narast_val: sum_narast, prev_val: sum_prev, miesiac_val: sum_miesiac,
            narast_pct: sum_budzet ? sum_narast / sum_budzet * 100 : 0,
            prev_pct: sum_budzet ? sum_prev / sum_budzet * 100 : 0,
            miesiac_pct: sum_budzet ? sum_miesiac / sum_budzet * 100 : 0,
          },
        };
      });
      return pct;
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
      return null;
    }
  };

  if (loading) return <div className="text-[#94A3B8] text-sm">Ładuję...</div>;
  if (!data || data.rows.length === 0) {
    return (
      <Card className="bg-[#131C2F] border-[#2A3B59]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-white text-base">Protokół zaawansowania robót</CardTitle>
            <ProtokolControls month={month} setMonth={setMonth} budowaId={budowaId} year={year} />
          </div>
        </CardHeader>
        <CardContent className="pt-6 text-[#94A3B8] text-sm text-center">
          Brak pozycji budżetowych. Dodaj najpierw pozycje w zakładce „Budżet".
        </CardContent>
      </Card>
    );
  }

  const t = data.totals;
  const olive = '#4F6343';
  const oliveDark = '#3F5235';
  const oliveStage = '#5F7552';

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-white text-base">
              PROTOKÓŁ STANU ZAAWANSOWANIA ROBÓT NR {data.nr} — {MONTHS_PL[month - 1]} {year}
            </CardTitle>
            <p className="text-xs text-[#94A3B8] mt-1">
              Wpisz <strong>% wykonania w bieżącym miesiącu</strong> w kolumnie „MIESIĄC ROZLICZENIOWY". Pozostałe wartości wyliczają się automatycznie.
            </p>
          </div>
          <ProtokolControls month={month} setMonth={setMonth} budowaId={budowaId} year={year} />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-xs border-collapse" data-testid="progress-table">
          <thead>
            {/* Naglowek - dwa rzedy, olive green w brandingu strony */}
            <tr>
              <th colSpan={6} className="bg-[#0B1120]"></th>
              <th colSpan={2} className="p-1.5 text-center font-bold text-white border border-[#2A3B59]" style={{ backgroundColor: olive }}>NARASTAJĄCO</th>
              <th colSpan={2} className="p-1.5 text-center font-bold text-white border border-[#2A3B59]" style={{ backgroundColor: olive }}>POPRZEDNI MIESIĄC</th>
              <th colSpan={2} className="p-1.5 text-center font-bold text-white border border-[#2A3B59]" style={{ backgroundColor: olive }}>MIESIĄC ROZLICZENIOWY</th>
            </tr>
            <tr style={{ backgroundColor: oliveDark }}>
              <th className="p-1.5 text-center font-bold text-white border border-[#2A3B59] w-10">LP.</th>
              <th className="p-1.5 text-left font-bold text-white border border-[#2A3B59] min-w-[280px]">Robocizna</th>
              <th className="p-1.5 text-center font-bold text-white border border-[#2A3B59] w-14">Jd.</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">Ilość</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-20">Cena</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">Wartość</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">WARTOŚĆ</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">%</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">WARTOŚĆ</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">%</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">WARTOŚĆ</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">%</th>
            </tr>
          </thead>
          <tbody className="bg-[#131C2F]">
            {data.rows.map((row, idx) => {
              if (row.type === 'section') {
                return (
                  <tr key={`s-${idx}`} style={{ backgroundColor: oliveStage }}>
                    <td className="border border-[#2A3B59] p-1.5"></td>
                    <td colSpan={11} className="border border-[#2A3B59] p-1.5 font-bold text-white uppercase tracking-wide">
                      ▣ {row.stage_name || row.category}
                    </td>
                  </tr>
                );
              }
              const editedVal = edits[row.id];
              const inputVal = editedVal !== undefined ? editedVal : (row.miesiac_pct || 0);
              return (
                <tr key={row.id} className="hover:bg-[#0B1120]/40" data-testid={`progress-row-${row.id}`}>
                  <td className="border border-[#2A3B59] p-1.5 text-center text-[#CBD5E1] tabular-nums">{row.lp}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-left text-white">{row.name}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-center text-[#94A3B8]">{row.unit || '—'}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtQty(row.quantity)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPrice(row.unit_price_netto)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums font-semibold">{fmtPLN(row.plan_netto)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#5F7552] tabular-nums">{fmtPLN(row.narast_val)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#5F7552] tabular-nums">{(row.narast_pct || 0).toFixed(2)}%</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#94A3B8] tabular-nums">{fmtPLN(row.prev_val)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#94A3B8] tabular-nums">{(row.prev_pct || 0).toFixed(2)}%</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#D4AF37] tabular-nums font-semibold">{fmtPLN(row.miesiac_val)}</td>
                  <td className="border border-[#2A3B59] p-0 text-right" style={{ backgroundColor: '#1A2540' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={inputVal}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      onBlur={async (e) => {
                        const result = await saveCell(row.id, row.miesiac_pct || 0, row.prev_pct || 0, row.plan_netto, e.target.value);
                        if (result === null) {
                          setEdits((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
                        } else {
                          setEdits((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
                        }
                      }}
                      className="w-full bg-transparent text-[#D4AF37] text-right text-xs font-bold px-1.5 py-1.5 outline-none focus:bg-[#0B1120] no-spinner"
                      data-testid={`progress-input-${row.id}`}
                    />
                  </td>
                </tr>
              );
            })}
            {/* RAZEM */}
            <tr className="font-bold" style={{ backgroundColor: olive }}>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5 text-center text-white">RAZEM</td>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{fmtPLN(t.plan_netto)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{fmtPLN(t.narast_val)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{Math.round(t.narast_pct || 0)}%</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{fmtPLN(t.prev_val)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{Math.round(t.prev_pct || 0)}%</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-[#D4AF37] tabular-nums font-bold" data-testid="progress-total-miesiac-val">{fmtPLN(t.miesiac_val)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-[#D4AF37] tabular-nums font-bold">{Math.round(t.miesiac_pct || 0)}%</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

// =================== KONTROLKI MIESIAC + DOWNLOAD ===================
const ProtokolControls = ({ month, setMonth, budowaId, year }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <label className="text-xs text-[#94A3B8]">Miesiąc rozliczeniowy:</label>
    <select
      value={month}
      onChange={(e) => setMonth(parseInt(e.target.value, 10))}
      className="bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1.5 rounded text-sm"
      data-testid="progress-month-select"
    >
      {MONTHS_PL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
    </select>
    <ProtokolDownloaderInline budowaId={budowaId} year={year} month={month} />
  </div>
);

const ProtokolDownloaderInline = ({ budowaId, year, month }) => {
  const [busy, setBusy] = useState(null);
  const [contractModal, setContractModal] = useState(null);

  const doDownload = async (fmt) => {
    setBusy(fmt);
    try {
      const url = fmt === 'pdf'
        ? `/budget/${budowaId}/protokol/${year}/${month}/pdf`
        : `/budget/${budowaId}/protokol/${year}/${month}`;
      const mime = fmt === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: mime });
      const link = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = link;
      a.download = `Protokol_${year}-${String(month).padStart(2, '0')}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(link);
      toast.success(`Protokół ${fmt.toUpperCase()} wygenerowany`);
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally {
      setBusy(null);
    }
  };

  const download = async (fmt) => {
    setBusy(fmt);
    try {
      const check = await api.get(`/budget/${budowaId}/protokol-check`);
      if (!check.data.ready) {
        setBusy(null);
        setContractModal({ format: fmt, data: check.data.budowa });
        return;
      }
      await doDownload(fmt);
    } catch (e) {
      setBusy(null);
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => download('xlsx')} disabled={busy !== null}
        className="bg-[#4F6343] hover:bg-[#3F5235] text-white h-8" data-testid="protokol-download-xlsx-btn">
        <FileDown className="h-4 w-4 mr-1" />
        {busy === 'xlsx' ? 'Generuję...' : 'XLSX'}
      </Button>
      <Button size="sm" onClick={() => download('pdf')} disabled={busy !== null}
        className="bg-[#9B2C2C] hover:bg-[#7F2424] text-white h-8" data-testid="protokol-download-pdf-btn">
        <FileDown className="h-4 w-4 mr-1" />
        {busy === 'pdf' ? 'Generuję...' : 'PDF'}
      </Button>
      {contractModal && (
        <ContractDataModal
          budowaId={budowaId}
          initial={contractModal.data}
          onClose={() => setContractModal(null)}
          onSaved={async () => {
            const fmt = contractModal.format;
            setContractModal(null);
            await doDownload(fmt);
          }}
        />
      )}
    </>
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
