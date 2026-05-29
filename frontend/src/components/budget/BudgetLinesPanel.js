// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { SubpositionModal } from './SubpositionModal';
import { PositionModal } from './PositionModal';
import { CategoryStageManager } from './CategoryStageManager';
import { BudgetLineModal } from './BudgetLineModal';
import { BudgetExcelTemplateView } from './BudgetExcelTemplateView';
import { BUDGET_TYPES, TYPE_ORDER, fmtNum } from './_shared';

export const BudgetLinesPanel = ({ budowaId, year, onChange }) => {
  const [lines, setLines] = useState([]);
  const [positions, setPositions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stages, setStages] = useState([]);
  const [budowaInfo, setBudowaInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLine, setEditLine] = useState(null);
  const [parentLine, setParentLine] = useState(null); // gdy ustawione - tryb "dodaj skladowa do"
  const [managerOpen, setManagerOpen] = useState(null); // null | 'categories' | 'stages'
  // Nowy widok kosztorysowy - modal dodawania pozycji
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [editPosition, setEditPosition] = useState(null); // do edycji nazwy pozycji
  // Modal dodawania podpozycji (Robocizna/Materiał/Sprzęt) do istniejącej pozycji
  const [subpositionFor, setSubpositionFor] = useState(null); // gdy ustawione - obiekt pozycji glownej
  // iter79: okres alokacji kosztow O/P/Q (0 = caly rok, 1..12 = konkretny miesiac)
  const [allocMonth, setAllocMonth] = useState(0);
  const [allocations, setAllocations] = useState(null); // { pools, positions, distributed }
  const [equalDistribution, setEqualDistribution] = useState(false);

  const fetchAllocations = useCallback(() => {
    if (!budowaId || !year) return;
    const qs = allocMonth > 0 ? `&month=${allocMonth}` : '';
    const eq = equalDistribution ? '&equal_distribution=true' : '';
    api.get(`/budget/${budowaId}/allocations?year=${year}${qs}${eq}`)
      .then((r) => setAllocations(r.data || null))
      .catch(() => setAllocations(null));
  }, [budowaId, year, allocMonth, equalDistribution]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  const fetchAll = useCallback(() => {
    if (!budowaId) return;
    setLoading(true);
    Promise.all([
      api.get(`/budget/${budowaId}/lines`),
      api.get(`/budget/${budowaId}/categories`),
      api.get(`/budget/${budowaId}/stages`),
      api.get(`/budget/${budowaId}/budowa-info`),
      api.get(`/budget/${budowaId}/positions`),
    ]).then(([l, c, s, b, p]) => {
      setLines(l.data?.rows || []);
      setCategories(c.data?.rows || []);
      setStages(s.data?.rows || []);
      setBudowaInfo(b.data || null);
      setPositions(p.data?.rows || []);
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

  const removePosition = async (pos) => {
    if (!window.confirm(`Usunąć pozycję „${pos.name}" wraz z kosztami Robocizny / Materiałów / Sprzętu i ich składowymi?`)) return;
    try {
      const r = await api.delete(`/budget/positions/${pos.id}`);
      toast.success(`Pozycja usunięta (${r.data?.deleted_lines || 0} linii)`);
      fetchAll();
      onChange && onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const wipeBudget = async () => {
    if (!window.confirm('⚠ Wyczyścić CAŁY budżet tej budowy?\n\nUsunięte zostaną:\n• wszystkie pozycje\n• wszystkie podpozycje (R/M/S)\n• wszystkie składowe\n• wszystkie wpisy % wykonania\n\nEtapy i kategorie zostają — usuwasz je osobno.')) return;
    if (!window.confirm('Operacja nieodwracalna. Potwierdź ponownie aby usunąć.')) return;
    try {
      const r = await api.delete(`/budget/${budowaId}/wipe`);
      toast.success(`Wyczyszczono: ${r.data?.deleted_lines || 0} linii, ${r.data?.deleted_positions || 0} pozycji`);
      fetchAll();
      onChange && onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // iter78: inline-update pola linii (uzywane przez inline-edit Koszt prognozowany L)
  const saveLineInline = useCallback(async (lineId, patch) => {
    // Optymistyczna aktualizacja lokalna
    setLines((prev) => prev.map((line) => line.id === lineId ? { ...line, ...patch } : line));
    try {
      await api.patch(`/budget/lines/${lineId}`, patch);
      // Cichy fetchAll w tle by przeladowac obliczone pola (plan_netto_computed itp.)
      fetchAll();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
      fetchAll();
      throw e;
    }
  }, [fetchAll]);

  // Sumy per typ (do kafelkow podsumowania)
  // iter73: liczymy TYLKO linie powiazane z pozycjami (position_id) - sieroty (stare dane sprzed iter68) sa pomijane
  const linkedLines = useMemo(() => lines.filter(l => l.position_id || l.is_income), [lines]);
  // iter88: zbior idek linii ktore maja dzieci (slot kontener) - wykluczamy z sum aby uniknac podwojnego liczenia
  const hasChildSet = useMemo(() => {
    const s = new Set();
    lines.forEach((ln) => { if (ln.parent_id) s.add(ln.parent_id); });
    return s;
  }, [lines]);
  const leafLines = useMemo(() => linkedLines.filter(l => !hasChildSet.has(l.id)), [linkedLines, hasChildSet]);
  const totalsByType = useMemo(() => {
    const t = { materials: { plan: 0, exec: 0 }, labor: { plan: 0, exec: 0 }, equipment: { plan: 0, exec: 0 } };
    leafLines.filter(l => !l.is_income).forEach((ln) => {
      const type = ln.type || 'materials';
      if (!t[type]) t[type] = { plan: 0, exec: 0 };
      t[type].plan += ln.plan_netto_computed || 0;
      t[type].exec += ln.execution_netto || 0;
    });
    return t;
  }, [leafLines]);

  const totalPlan = leafLines.filter(l => !l.is_income).reduce((s, l) => s + (l.plan_netto_computed || 0), 0);
  const totalExec = leafLines.filter(l => !l.is_income).reduce((s, l) => s + (l.execution_netto || 0), 0);
  const totalIncomePlan = leafLines.filter(l => l.is_income).reduce((s, l) => s + (l.plan_netto_computed || 0), 0);
  const totalIncomeExec = leafLines.filter(l => l.is_income).reduce((s, l) => s + (l.execution_netto || 0), 0);
  const zyskBiezacy = totalIncomeExec - totalExec;
  // Czy sa stare linie sieroty (bez position_id, nie-przychod) - do pokazania ostrzezenia
  const orphanCount = lines.filter(l => !l.position_id && !l.is_income).length;

  return (
    <>
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base">Pozycje budżetu</CardTitle>
        <div className="flex gap-2 flex-wrap">
          {stages.length === 0 && (
            <Button size="sm"
              onClick={() => setManagerOpen('stages')}
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8 animate-pulse"
              data-testid="budget-create-first-stage-btn"
              title="Budowa nie ma jeszcze etapów - kliknij aby utworzyć pierwszy">
              <Plus className="h-4 w-4 mr-1" /> Utwórz pierwszy etap
            </Button>
          )}
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
          {(lines.length > 0 || positions.length > 0) && (
            <Button size="sm" variant="outline"
              onClick={wipeBudget}
              className="border-[#9B2C2C] text-[#FCA5A5] hover:bg-[#9B2C2C]/30 h-8" data-testid="budget-wipe-btn"
              title="Wyczyść CAŁY budżet (wszystkie pozycje + składowe + protokół)">
              <Trash2 className="h-4 w-4 mr-1" /> Wyczyść
            </Button>
          )}
          <Button size="sm"
            onClick={() => { setEditPosition(null); setPositionModalOpen(true); }}
            disabled={stages.length === 0}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8 disabled:opacity-40"
            data-testid="budget-add-position-btn"
            title={stages.length === 0 ? 'Najpierw utwórz etap' : 'Dodaj nową pozycję kosztorysową'}>
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto space-y-3">
        {/* Ostrzezenie o starych liniach sierotach (sprzed iter68) */}
        {orphanCount > 0 && (
          <div className="rounded p-3 border border-[#9B2C2C]/60 bg-[#9B2C2C]/15" data-testid="orphan-warning">
            <div className="flex items-start gap-2">
              <div className="text-[#FCA5A5] font-bold text-sm">⚠ Stare dane budżetu ({orphanCount} linii)</div>
            </div>
            <div className="text-[#FCA5A5] text-xs mt-1">
              Znaleziono {orphanCount} starych linii budżetu bez przypisania do pozycji (sprzed reorganizacji). Nie są one widoczne w nowej tabeli kosztorysowej ani w kafelkach poniżej. Kliknij <b>Wyczyść</b> w nagłówku aby je usunąć.
            </div>
          </div>
        )}
        {/* === 3 kafelki podsumowania per Typ === */}
        {!loading && linkedLines.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2" data-testid="budget-type-cards">
            {TYPE_ORDER.map((key) => {
              const cfg = BUDGET_TYPES[key];
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

        {/* === Karty RAZEM (przychody/koszty/zysk) === */}
        {!loading && linkedLines.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t-2 border-[#D4AF37]" data-testid="budget-totals-footer">
            <div className="rounded p-3 bg-[#0B1120] border border-[#5F7552]/40">
              <div className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Razem przychody (Plan / Wyk)</div>
              <div className="text-sm text-[#5F7552] font-bold tabular-nums mt-1">{fmtNum(totalIncomePlan)} / {fmtNum(totalIncomeExec)} zł</div>
            </div>
            <div className="rounded p-3 bg-[#0B1120] border border-[#D4AF37]/40">
              <div className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Razem koszty (Plan / Wyk)</div>
              <div className="text-sm text-[#D4AF37] font-bold tabular-nums mt-1">{fmtNum(totalPlan)} / {fmtNum(totalExec)} zł</div>
            </div>
            <div className={`rounded p-3 bg-[#0B1120] border ${zyskBiezacy >= 0 ? 'border-[#5F7552]/40' : 'border-[#FCA5A5]/40'}`}>
              <div className="text-[10px] text-[#94A3B8] uppercase tracking-wide">Zysk bieżący (Przych. Wyk − Koszty Wyk)</div>
              <div className={`text-sm font-bold tabular-nums mt-1 ${zyskBiezacy >= 0 ? 'text-[#5F7552]' : 'text-[#FCA5A5]'}`}>{fmtNum(zyskBiezacy)} zł</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-[#94A3B8] text-sm">Ładuję...</div>
        ) : lines.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="budget-empty">
            Brak pozycji. Kliknij „Dodaj pozycję" aby zacząć.
          </div>
        ) : null}
      </CardContent>
      {modalOpen && (
        <BudgetLineModal
          budowaId={budowaId}
          editLine={editLine}
          parentLine={parentLine}
          categories={categories}
          stages={stages}
          budowaInfo={budowaInfo}
          onCategoriesChanged={fetchAll}
          onClose={() => { setModalOpen(false); setParentLine(null); }}
          onSaved={() => { setModalOpen(false); setParentLine(null); fetchAll(); onChange && onChange(); }}
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
    {/* === Tabela kosztorysowa wg szablonu BUDŻET.xlsx (Etap → Pozycja → Podpozycje R/M/S) === */}
    <div className="mt-4">
      <BudgetExcelTemplateView
        positions={positions}
        stages={stages}
        lines={lines}
        budowaInfo={budowaInfo}
        loading={loading}
        year={year}
        allocMonth={allocMonth}
        setAllocMonth={setAllocMonth}
        allocations={allocations}
        equalDistribution={equalDistribution}
        setEqualDistribution={setEqualDistribution}
        onAddPosition={() => { setEditPosition(null); setPositionModalOpen(true); }}
        onEditPosition={(pos) => { setEditPosition(pos); setPositionModalOpen(true); }}
        onDeletePosition={removePosition}
        onAddSubposition={(pos) => setSubpositionFor(pos)}
        onEditLine={(ln) => { setEditLine(ln); setParentLine(null); setModalOpen(true); }}
        onAddChildLine={(ln) => { setEditLine(null); setParentLine(ln); setModalOpen(true); }}
        onDeleteLine={remove}
        onSaveLine={saveLineInline}
      />
    </div>
    {positionModalOpen && (
      <PositionModal
        budowaId={budowaId}
        editPosition={editPosition}
        stages={stages}
        onClose={() => { setPositionModalOpen(false); setEditPosition(null); }}
        onSaved={() => { setPositionModalOpen(false); setEditPosition(null); fetchAll(); onChange && onChange(); }}
      />
    )}
    {subpositionFor && (
      <SubpositionModal
        budowaId={budowaId}
        position={subpositionFor}
        stageId={subpositionFor.stage_id}
        existingLines={lines}
        onClose={() => setSubpositionFor(null)}
        onSaved={() => { setSubpositionFor(null); fetchAll(); onChange && onChange(); }}
      />
    )}
    </>
  );
};

