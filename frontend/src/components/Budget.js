import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Plus, Trash2, Pencil, Building2, Calendar, CheckSquare, FileDown, ChevronDown, ChevronRight, FolderTree } from 'lucide-react';
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
            <BudgetLinesPanel budowaId={selectedBudowaId} year={year} onChange={fetchBudowy} />
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
const fmtCell = (v) => (v == null || v === 0) ? '—' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCellNum = (v) => (v == null || v === 0) ? '0' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// =================== INLINE EDIT KOMORKA "Koszt prognozowany" (L) ===================
const ForecastCell = ({ line, computedL, isParent, computedQty, computedCena, computedG, onSave, num }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [noteValue, setNoteValue] = useState(line?.forecast_note || '');
  const [editingNote, setEditingNote] = useState(false);
  const inputRef = useRef(null);

  // Wartosc do wyswietlenia
  const stored = line?.forecast_cost;
  const displayValue = isParent && computedL != null ? computedL : (stored != null ? Number(stored) : null);
  const tooltip = line?.forecast_note || '';

  const evaluateExpression = (raw) => {
    if (!raw) return null;
    let expr = String(raw).trim();
    if (expr.startsWith('=')) expr = expr.slice(1);
    // Zezwol tylko na cyfry, operatory, %, kropki, przecinki, nawiasy i jednoznaczne zmienne
    expr = expr.replace(/,/g, '.');
    // Wymien zmienne na wartosci
    expr = expr.replace(/\bilosc\b/gi, computedQty || 0);
    expr = expr.replace(/\bilość\b/gi, computedQty || 0);
    expr = expr.replace(/\bqty\b/gi, computedQty || 0);
    expr = expr.replace(/\bcena\b/gi, computedCena || 0);
    expr = expr.replace(/\bprice\b/gi, computedCena || 0);
    expr = expr.replace(/\bbudzet\b/gi, computedG || 0);
    expr = expr.replace(/\bbudżet\b/gi, computedG || 0);
    expr = expr.replace(/\bg\b/gi, computedG || 0);
    // Obsluga %: zamien "X%" na "X/100" (gdy obok cyfry)
    expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
    if (!/^[\d+\-*/().\s]+$/.test(expr)) {
      throw new Error('Nieprawidłowe wyrażenie. Dostępne: liczby, +, -, *, /, ( ), %, ilosc, cena, budzet');
    }
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('Wynik nie jest liczbą');
    return Math.round(result * 100) / 100;
  };

  const startEdit = () => {
    if (isParent) return; // wartosc parenta to suma dzieci - nie edytujemy
    setValue(stored != null ? String(stored) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => { setEditing(false); setValue(''); };

  const save = async () => {
    try {
      const raw = value.trim();
      const numeric = raw === '' ? null : evaluateExpression(raw);
      await onSave(line.id, { forecast_cost: numeric });
      setEditing(false);
    } catch (e) {
      toast.error(e.message || 'Błąd zapisu');
    }
  };

  const saveNote = async () => {
    try {
      await onSave(line.id, { forecast_note: noteValue });
      setEditingNote(false);
    } catch (e) {
      toast.error(e.message || 'Błąd zapisu notatki');
    }
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          onBlur={save}
          placeholder="liczba lub =ilosc*cena*0.3"
          className="w-32 bg-[#0B1120] border border-[#D4AF37] text-white text-right text-[10px] px-1 py-0.5 rounded"
          data-testid={`forecast-input-${line.id}`}
        />
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1 group" title={tooltip || (isParent ? 'Suma kosztu prognozowanego ze składowych' : 'Kliknij, aby wprowadzić koszt prognozowany. Możesz użyć wzoru np. =ilosc*cena*0.3')}>
      {displayValue != null ? (
        <button type="button" onClick={startEdit} disabled={isParent}
          className={`tabular-nums text-right ${isParent ? 'cursor-default text-white font-semibold' : 'cursor-pointer hover:text-[#D4AF37]'}`}
          data-testid={`forecast-display-${line.id}`}>
          {num(displayValue)}
        </button>
      ) : (
        !isParent && (
          <button type="button" onClick={startEdit} className="text-[#64748B] italic hover:text-[#D4AF37]"
            data-testid={`forecast-empty-${line.id}`}>
            wpisz
          </button>
        )
      )}
      {!isParent && (
        <button type="button"
          onClick={() => setEditingNote(!editingNote)}
          className="opacity-0 group-hover:opacity-100 text-[#64748B] hover:text-[#D4AF37] transition"
          title={tooltip ? `Notatka: ${tooltip}` : 'Dodaj notatkę (widoczna po najechaniu)'}
          data-testid={`forecast-note-btn-${line.id}`}>
          <span className="text-[8px]">📝</span>
        </button>
      )}
      {editingNote && (
        <div className="absolute z-50 mt-6 right-0 bg-[#0B1120] border border-[#D4AF37] rounded p-2 shadow-2xl w-56">
          <textarea value={noteValue} onChange={(e) => setNoteValue(e.target.value)}
            placeholder="np. cena z oferty firmy XYZ"
            className="w-full bg-[#131C2F] text-white text-[10px] p-1 rounded border border-[#2A3B59] min-h-[60px]"
            data-testid={`forecast-note-input-${line.id}`} />
          <div className="flex gap-1 justify-end mt-1">
            <button onClick={() => setEditingNote(false)} className="text-[10px] text-[#94A3B8] hover:text-white">Anuluj</button>
            <button onClick={saveNote} className="text-[10px] bg-[#D4AF37] text-[#0B1120] px-2 py-0.5 rounded font-bold" data-testid={`forecast-note-save-${line.id}`}>Zapisz</button>
          </div>
        </div>
      )}
    </div>
  );
};

// =================== TABELA KOSZTORYSOWA wg szablonu BUDŻET.xlsx (22 kolumny) ===================
// Hierarchia: Etap (label) -> Pozycja Główna (kod 101, auto-sum z 3 slotów) -> Podpozycje (101.1 sprzęt / 101.2 robocizna / 101.3 Materiał)
const SUB_TYPE_LABEL = { equipment: 'sprzęt', labor: 'robocizna', materials: 'Materiał' };
const SUB_TYPE_ORDER = ['equipment', 'labor', 'materials']; // kolejnosc jak w arkuszu user (Pompa, beton-robocizna, beton-material)

const BudgetExcelTemplateView = ({ positions, stages, lines, budowaInfo, loading, year, allocMonth, setAllocMonth, allocations, equalDistribution, setEqualDistribution, onAddPosition, onEditPosition, onDeletePosition, onAddSubposition, onEditLine, onAddChildLine, onDeleteLine, onSaveLine }) => {
  // iter82: stan modalu z opisem kolumny po klikniciu w naglowek
  const [infoCol, setInfoCol] = useState(null);
  // iter95g: modal z rozbiciem Q (skąd się wziął)
  const [showQBreakdown, setShowQBreakdown] = useState(false);
  // Pozycje per etap (zachowaj kolejnosc z `stages`)
  const positionsByStage = useMemo(() => {
    const m = {};
    positions.forEach((p) => {
      const sid = p.stage_id || '__none__';
      if (!m[sid]) m[sid] = [];
      m[sid].push(p);
    });
    return m;
  }, [positions]);

  // Sloty per pozycja per typ (parent_id=null)
  // iter88: obsluga LEGACY duplicate slots tego samego typu - lista zamiast pojedynczego
  const slotsByPosition = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.position_id || ln.parent_id) return;
      if (!m[ln.position_id]) m[ln.position_id] = {};
      const t = ln.type || 'materials';
      if (!m[ln.position_id][t]) m[ln.position_id][t] = [];
      m[ln.position_id][t].push(ln);
    });
    return m;
  }, [lines]);

  // Skladowe per slot
  const childrenByParent = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.parent_id) return;
      if (!m[ln.parent_id]) m[ln.parent_id] = [];
      m[ln.parent_id].push(ln);
    });
    return m;
  }, [lines]);

  // Oblicz wartosci kolumn dla pojedynczej linii (slotu)
  // iter77: kaucje (H/I) oraz koszt budowy (J) zaciagane z backendu PER LINIA (effective_*_pct + *_amount)
  // iter80: P/Q dla slotu typu 'labor' (R) z allocations.slots
  const computeRow = (line) => {
    const kids = line ? (childrenByParent[line.id] || []) : [];
    const qty = kids.length > 0 ? kids.reduce((s, k) => s + (k.quantity || 0), 0) : (line?.quantity || 0);
    let plan = line?.plan_netto_computed || 0;
    let exec = line?.execution_netto || 0;
    let H = line?.kaucja_gir_amount || 0;
    let I = line?.kaucja_dw_amount || 0;
    let J = line?.koszt_budowy_amount || 0;
    if (kids.length > 0) {
      plan = kids.reduce((s, k) => s + (k.plan_netto_computed || 0), 0);
      exec = kids.reduce((s, k) => s + (k.execution_netto || 0), 0);
      H = kids.reduce((s, k) => s + (k.kaucja_gir_amount || 0), 0);
      I = kids.reduce((s, k) => s + (k.kaucja_dw_amount || 0), 0);
      J = kids.reduce((s, k) => s + (k.koszt_budowy_amount || 0), 0);
    }
    const cena = qty > 0 ? plan / qty : (line?.unit_price_netto || 0);
    const G = plan;
    const K = G - H - I - J;
    // L = forecast_cost: jezeli pozycja ma dzieci, sumujemy forecast_cost dzieci, w przeciwnym razie z linii
    let L = null;
    let forecastNote = line?.forecast_note || null;
    if (kids.length > 0) {
      const childForecasts = kids.filter(k => k.forecast_cost != null);
      if (childForecasts.length > 0) {
        L = childForecasts.reduce((s, k) => s + Number(k.forecast_cost || 0), 0);
      }
    } else if (line?.forecast_cost != null) {
      L = Number(line.forecast_cost);
    }
    // M = K - L (Budżet Zwolniony minus Koszt Prognozowany) - prognozowany zysk
    const M = (L != null) ? K - L : null;
    const N = exec;
    const O = 0;
    // iter80: P i Q tylko dla slotu typu 'labor' (R), z allocations.slots[slot_id]
    const isLaborSlot = line && !line.parent_id && (line.type || 'materials') === 'labor';
    const slotAlloc = isLaborSlot ? (allocations?.slots?.[line.id]) : null;
    const P = slotAlloc?.P || 0;
    const Q = slotAlloc?.Q || 0;
    const R = O + P + Q + N;
    // iter95: S = R/K × 100 (Koszty Razem / Budżet Zwolniony). Wczesniej R/N dawalo astronomiczne wartosci
    // gdy N=0 a P/Q duze. R/K pokazuje % wykorzystania realnego budzetu.
    const S = K > 0 ? (R / K) * 100 : 0;
    const T = (L != null) ? L - R : null;
    const U = K - R;
    const V = (M != null) ? M - U : null;
    return { qty, cena, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, forecastNote };
  };

  // Suma slotow danej pozycji
  // iter79: O - na poziomie pozycji (z allocations.positions)
  // iter80: P i Q - sumowane z slotow (faktycznie wpadaja tylko z slotu labor)
  const computePositionRow = (positionId) => {
    const slots = slotsByPosition[positionId] || {};
    const aggregate = { qty: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, hasL: false, M: 0, hasM: false, N: 0, O: 0, P: 0, Q: 0, R: 0, U: 0 };
    let hasL = false;
    SUB_TYPE_ORDER.forEach((t) => {
      const slotsArr = slots[t] || [];
      slotsArr.forEach((slot) => {
        const r = computeRow(slot);
        aggregate.qty += r.qty;
        aggregate.G += r.G;
        aggregate.H += r.H;
        aggregate.I += r.I;
        aggregate.J += r.J;
        aggregate.K += r.K;
        if (r.L != null) { aggregate.L += r.L; hasL = true; }
        aggregate.N += r.N;
        aggregate.P += r.P;  // P trafia tylko ze slotu labor (R)
        aggregate.Q += r.Q;
      });
    });
    // iter79: O alokowane na poziomie pozycji
    const alloc = allocations?.positions?.[positionId];
    aggregate.O = alloc?.O || 0;
    aggregate.R = aggregate.O + aggregate.P + aggregate.Q + aggregate.N;
    aggregate.U = aggregate.K - aggregate.R;
    aggregate.hasL = hasL;
    aggregate.M = hasL ? aggregate.K - aggregate.L : null;
    aggregate.S = aggregate.K > 0 ? (aggregate.R / aggregate.K) * 100 : 0;
    aggregate.T = hasL ? aggregate.L - aggregate.R : null;
    aggregate.V = hasL ? aggregate.M - aggregate.U : null;
    aggregate.cena = aggregate.qty > 0 ? aggregate.G / aggregate.qty : 0;
    return aggregate;
  };

  const BORDER = '#2A3B59';
  const STAGE_BG = '#3F5235';
  const POS_BG = '#19243C';
  const SUB_BG = '#0B1120';
  const HEADER_BG = '#4F6343';
  const KAUCJA_BG = 'rgba(212, 175, 55, 0.12)';
  const EXEC_BG = 'rgba(95, 117, 82, 0.14)';
  const STICKY = { position: 'sticky', left: 0, zIndex: 5, backgroundColor: undefined };

  // Naglowki kolumn 1:1 z arkusza
  // iter82: kazda kolumna ma description + formula - klikalny modal z detalami
  const cols = [
    { k: 'A', label: 'Kod', w: 60, desc: 'Kod pozycji w hierarchii: 101 (pozycja), 101.1 (slot), 101.1.1 (składowa).' },
    { k: 'B', label: 'Rodzaj', w: 100, desc: 'Typ wiersza: Pozycja Główna / sprzęt / robocizna / Materiał / składowa.' },
    { k: 'D', label: 'NAZWA', w: 240, sticky: true, desc: 'Nazwa pozycji budżetowej. Kliknij + na pozycji aby dodać podpozycję R/M/S.' },
    { k: 'E', label: 'Ilość', w: 60, desc: 'Ilość jednostek (z podpozycji lub składowych).' },
    { k: 'F', label: 'Cena', w: 80, desc: 'Cena jednostkowa: BUDŻET / Ilość.' },
    { k: 'G', label: 'BUDŻET', w: 90, formula: 'G = Ilość × Cena', desc: 'Wartość planowana pozycji (przychód oczekiwany).' },
    { k: 'H', label: 'KAUCJA GIR', w: 90, bg: KAUCJA_BG, formula: 'H = G × % kaucji GIR', desc: 'Kaucja gwarancyjna inwestycji (zatrzymywana przez inwestora).' },
    { k: 'I', label: 'KAUCJA DW', w: 90, bg: KAUCJA_BG, formula: 'I = G × % kaucji DW', desc: 'Kaucja gwarancji wykonania (zatrzymywana do zakończenia).' },
    { k: 'J', label: 'Koszt budowy', w: 90, formula: 'J = G × % koszt budowy', desc: 'Procentowy koszt obsługi budowy (admin, projekt itp.). Odejmowany od Budżetu Zwolnionego.' },
    { k: 'K', label: 'BUDŻET Zwolniony', w: 100, formula: 'K = G − H − I − J', desc: 'Realny przychód po odjęciu kaucji i kosztu budowy. To z czego liczymy zysk i koszty.' },
    { k: 'L', label: 'Koszt prognozowany', w: 110, desc: 'Wpisana ręcznie prognoza kosztów pozycji. Obsługuje formuły, np. =10*10*0.3. Hover dla notatki.' },
    { k: 'M', label: 'Prognozowany zysk', w: 110, formula: 'M = K − L', desc: 'Zysk oczekiwany: Budżet Zwolniony minus Koszt Prognozowany. Ujemny = przewidywana strata.' },
    { k: 'N', label: 'Koszty przypisane do etapów', w: 130, bg: EXEC_BG, desc: 'Suma zapisów (faktur/zapisów) przypisanych do tej linii budżetu w module Finanse → Zapisy.' },
    { k: 'O', label: 'Koszty budowy bez etapów (% protokół)', w: 140, desc: 'Koszty budowy BEZ kodu pozycji rozproszone na pozycje proporcjonalnie do % zaawansowania z protokołów. Tryb równy włącza przycisk „Rozłóż równo".' },
    { k: 'P', label: '% wynagrodzeń budowy → robocizna', w: 130, desc: 'Wynagrodzenia BEZ kodu pozycji rozproszone tylko na sloty robocizny (R) wg % zaawansowania.' },
    { k: 'Q', label: 'Koszty nieprzyp. × % sprzedaży → robocizna', w: 130, desc: 'Firmowe koszty BEZ budowy × (Sprzedaż tej budowy / Sprzedaż firmy) w wybranym miesiącu. Następnie rozproszone na sloty robocizny proporcjonalnie do % zaawansowania pozycji z protokołów.' },
    { k: 'R', label: 'KOSZTY RAZEM', w: 100, bg: EXEC_BG, formula: 'R = N + O + P + Q', desc: 'Suma wszystkich kosztów: bezpośrednich + alokowanych pośrednich.' },
    { k: 'S', label: '% zrealizowanego', w: 90, formula: 'S = R / K × 100', desc: 'Stosunek kosztów razem do Budżetu Zwolnionego (K). 100% = wykorzystano cały realny budżet. ALERT: ≥100% czerwone, ≥80% żółte.' },
    { k: 'T', label: 'POZOSTAŁO BUDŻETU', w: 110, formula: 'T = L − R', desc: 'Ile zostało z prognozowanego kosztu. Ujemne = przekroczono prognozę. ALERT: <0 czerwone, <5%·L żółte.' },
    { k: 'U', label: 'Zysk', w: 90, formula: 'U = K − R', desc: 'Faktyczny zysk z pozycji (Budżet Zwolniony − Koszty Razem). Ujemne = STRATA. ALERT: <0 czerwone, <5%·K żółte.' },
    { k: 'V', label: 'Różnica zysku', w: 100, formula: 'V = M − U', desc: 'Różnica między prognozowanym a faktycznym zyskiem. Ujemne = realizacja gorsza niż prognoza.' },
  ];

  const totalWidth = cols.reduce((s, c) => s + c.w, 0);

  // Render komorki numerycznej z formatowaniem
  const num = (v, opts = {}) => {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
    if (opts.pct) return `${Math.round(v)}%`;
    if (typeof v !== 'number') return '—';
    if (v === 0 && !opts.showZero) return '—';
    return v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // iter81: Alert wizualny przekroczenia budzetu.
  // - col 'S' (pct): >=100% czerwone (przekroczone), >=80% zolte, <80% zielone
  // - col 'T' (pozostalo budzetu z prognozy) i col 'U' (zysk z budzetu): <0 czerwone, < 5% ref zolte, >=5% zielone
  // - col 'V' (roznica zysku): <0 czerwone, w przeciwnym razie zielone (brak progu zoltego - referencja sluzy do M)
  // Zwraca {style, icon} - icon to '⚠' tekstowo gdy alert.
  const alertCell = (val, ref, opts = {}) => {
    const base = { borderColor: BORDER };
    if (val == null || (typeof val === 'number' && !isFinite(val))) {
      return { style: { ...base, color: '#94A3B8' }, icon: null };
    }
    if (opts.pct) {
      if (val >= 100) return { style: { ...base, color: '#FFFFFF', backgroundColor: '#9B2C2C', fontWeight: 700 }, icon: '⚠' };
      if (val >= 80) return { style: { ...base, color: '#0B1120', backgroundColor: '#D4AF37', fontWeight: 700 }, icon: null };
      return { style: { ...base, color: '#5F7552', fontWeight: 700 }, icon: null };
    }
    if (val < 0) {
      return { style: { ...base, color: '#FFFFFF', backgroundColor: '#9B2C2C', fontWeight: 700 }, icon: '⚠' };
    }
    if (!opts.skipWarn) {
      const refAbs = Math.abs(ref || 0);
      if (refAbs > 0 && val < refAbs * 0.05) {
        return { style: { ...base, color: '#0B1120', backgroundColor: '#D4AF37', fontWeight: 700 }, icon: null };
      }
    }
    return { style: { ...base, color: '#5F7552', fontWeight: 700 }, icon: null };
  };

  // Renderer komorki z opcjonalnym alert icon (T, U, V, S)
  const renderAlertCell = (val, ref, opts = {}) => {
    const { style, icon } = alertCell(val, ref, opts);
    return (
      <td className="px-1 py-1 text-right tabular-nums border-r" style={style} title={icon ? (opts.warningTitle || 'Uwaga: przekroczenie/strata') : undefined}>
        {icon && <span className="mr-0.5">{icon}</span>}
        {val == null ? '—' : num(val, opts.pct ? { pct: true, showZero: true } : {})}
      </td>
    );
  };

  if (loading) return <Card className="bg-[#131C2F] border-[#2A3B59]"><CardContent className="p-6 text-[#94A3B8] text-sm">Ładuję...</CardContent></Card>;

  const stagesWithPositions = stages.filter((s) => positionsByStage[s.id]?.length > 0);
  const orphanPositions = positionsByStage['__none__'] || [];

  // iter90: SUMY KOLUMN (caly budet) - liczone z agregatow pozycji
  const grandTotals = (() => {
    const tot = { qty: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, hasL: false, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, T: 0, hasT: false, U: 0, V: 0, hasV: false };
    const allPositions = [...stagesWithPositions.flatMap(s => positionsByStage[s.id] || []), ...orphanPositions];
    allPositions.forEach((pos) => {
      const a = computePositionRow(pos.id);
      tot.qty += a.qty || 0;
      tot.G += a.G || 0;
      tot.H += a.H || 0;
      tot.I += a.I || 0;
      tot.J += a.J || 0;
      tot.K += a.K || 0;
      if (a.hasL) { tot.L += a.L; tot.hasL = true; }
      if (a.M != null) tot.M += a.M;
      tot.N += a.N || 0;
      tot.O += a.O || 0;
      tot.P += a.P || 0;
      tot.Q += a.Q || 0;
      tot.R += a.R || 0;
      if (a.T != null) { tot.T += a.T; tot.hasT = true; }
      tot.U += a.U || 0;
      if (a.V != null) { tot.V += a.V; tot.hasV = true; }
    });
    tot.S = tot.K > 0 ? (tot.R / tot.K) * 100 : 0;
    tot.cena = tot.qty > 0 ? tot.G / tot.qty : 0;
    return tot;
  })();

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]" data-testid="budget-excel-template-view">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <FolderTree className="h-5 w-5" style={{ color: '#D4AF37' }} />
          Tabela kosztorysowa (szablon BUDŻET.xlsx)
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {/* iter79: Selektor okresu dla alokacji O/P/Q */}
          {setAllocMonth && (
            <div className="flex items-center gap-1 text-xs">
              <label className="text-[#94A3B8]">Alokacja (O/P/Q):</label>
              <select
                value={allocMonth || 0}
                onChange={(e) => setAllocMonth(parseInt(e.target.value, 10) || 0)}
                className="bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1 rounded text-xs"
                data-testid="budget-alloc-period">
                <option value={0}>Cały rok {year}</option>
                {MONTHS_PL.map((m, i) => <option key={i} value={i + 1}>{m} {year}</option>)}
              </select>
            </div>
          )}
          <Button size="sm"
            onClick={onAddPosition}
            disabled={stages.length === 0}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8 disabled:opacity-40"
            data-testid="template-add-position-btn"
            title={stages.length === 0 ? 'Najpierw utwórz etap' : 'Dodaj nową pozycję (kod 1xx) z 3 podpozycjami'}>
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
          </Button>
        </div>
      </CardHeader>
      {/* iter94: Banner gdy fallback dystrybucji (brak protokolu) - dystrybucja proporcjonalna do planu lub rowna */}
      {allocations?.distributed && allocations.fallback_mode && (
        (allocations.pools?.O > 0 || allocations.pools?.P > 0 || allocations.pools?.Q > 0) && (
          <div className="mx-4 mt-2 mb-1 rounded p-3 border border-[#D4AF37]/60 bg-[#D4AF37]/10" data-testid="alloc-fallback-banner">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1">
                <div className="text-[#D4AF37] font-bold text-sm mb-1">
                  {allocations.fallback_mode === 'plan'
                    ? 'ℹ Auto-dystrybucja proporcjonalna do BUDŻETU pozycji'
                    : 'ℹ Dystrybucja równa na wszystkie pozycje'}
                </div>
                <div className="text-[#FCE99A] text-xs">
                  Brak wpisów % zaawansowania w wybranym okresie. Pule:
                  {' '}O = <b>{fmtNum(allocations.pools.O)} zł</b>,
                  {' '}P = <b>{fmtNum(allocations.pools.P)} zł</b>,
                  {' '}Q = <b>{fmtNum(allocations.pools.Q)} zł</b>
                  {' '}{allocations.fallback_mode === 'plan'
                    ? '— rozdzielone proporcjonalnie do wartości planu G pozycji. Wpisz progresy w zakładce „% Protokół" aby użyć dystrybucji wg zaawansowania.'
                    : '— wszystkie pozycje mają plan=0, więc rozdzielone równo.'}
                </div>
              </div>
              {allocations.fallback_mode === 'plan' && (
                <Button size="sm"
                  onClick={() => setEqualDistribution && setEqualDistribution(!equalDistribution)}
                  className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-7 text-xs"
                  data-testid="alloc-equal-distribute-btn">
                  {equalDistribution ? 'Wg planu (G)' : 'Rozłóż równo'}
                </Button>
              )}
            </div>
          </div>
        )
      )}
      {/* iter80: Banner gdy P/Q nie trafiajaja do robocizny bo pozycja nie ma slotu labor */}
      {allocations?.distributed && (allocations.undistributed_labor?.P > 0 || allocations.undistributed_labor?.Q > 0) && (
        <div className="mx-4 mt-2 mb-1 rounded p-2 border border-[#9B2C2C]/60 bg-[#9B2C2C]/15 text-[#FCA5A5] text-xs" data-testid="alloc-labor-missing-banner">
          ⚠ Nie wszystkie pozycje mają slot <b>robocizny (R)</b>:
          {' '}<b>{fmtNum(allocations.undistributed_labor.P)} zł</b> (P) +
          {' '}<b>{fmtNum(allocations.undistributed_labor.Q)} zł</b> (Q)
          {' '}nie zostało przypisane do żadnej komórki (pozycje bez robocizny: {allocations.undistributed_labor.positions_without_labor?.length || 0}). Dodaj slot „robocizna" do tych pozycji aby koszty wynagrodzeń się rozpisały.
        </div>
      )}
      {/* iter95: Diagnostyczny banner pul allokacji - pokazuje DLACZEGO Q=0 (lub niskie) */}
      {allocations?.pools && (
        <div className="mx-4 mt-2 mb-1 rounded p-2 border border-[#2A3B59] bg-[#0B1120] text-[#94A3B8] text-xs"
             data-testid="alloc-pools-diagnostic">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>📊 <b className="text-[#CBD5E1]">Pule alokacji</b> ({allocMonth ? `${MONTHS_PL[allocMonth-1]} ${year}` : `cały rok ${year}`}{allocations.date_range ? ` · zakres: ${allocations.date_range.start} → ${allocations.date_range.end}` : ''}):</span>
            <span>O (koszty bez etapów) = <b className={allocations.pools.O > 0 ? 'text-[#D4AF37]' : 'text-[#64748B]'}>{fmtNum(allocations.pools.O)} zł</b></span>
            <span>P (wynagrodzenia bez etapów) = <b className={allocations.pools.P > 0 ? 'text-[#D4AF37]' : 'text-[#64748B]'}>{fmtNum(allocations.pools.P)} zł</b></span>
            <span>Q (firmowe × %sprzedaży) = <button onClick={() => setShowQBreakdown(true)}
              className={`underline decoration-dotted hover:decoration-solid font-bold ${allocations.pools.Q > 0 ? 'text-[#D4AF37]' : 'text-[#FCA5A5]'}`}
              data-testid="q-breakdown-btn" title="Kliknij aby zobaczyć rozbicie Q per miesiąc i kategoria">
              {fmtNum(allocations.pools.Q)} zł 🔍
            </button></span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px]">
            <span>↳ Sprzedaż firmy = <b>{fmtNum(allocations.pools.sprzedaz_total_firma)} zł</b></span>
            <span>Sprzedaż tej budowy = <b className={allocations.pools.sprzedaz_budowa > 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>{fmtNum(allocations.pools.sprzedaz_budowa)} zł</b></span>
            <span>% sprzedaży = <b>{((allocations.pools.sprzedaz_ratio || 0) * 100).toFixed(2)}%</b></span>
            <span>Koszty firmowe nieprzyp. (bez budowy) = <b className={allocations.pools.unassigned_company > 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>{fmtNum(allocations.pools.unassigned_company)} zł</b></span>
          </div>
          {(allocations.pools.q_categorized != null || allocations.pools.q_leftover != null) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-[#94A3B8]">
              <span>Q skład: kategoryzowane (KP/KSP/PPE pro-rata jak Sprzedaż) = <b className="text-[#CBD5E1]">{fmtNum(allocations.pools.q_categorized)} zł</b></span>
              <span>+ pozostałe (KSB bez budowy, kod=brak) × %sprzedaży = <b className="text-[#CBD5E1]">{fmtNum(allocations.pools.q_leftover)} zł</b></span>
            </div>
          )}
          {allocations.pools.Q === 0 && (
            <div className="mt-1 text-[10px] text-[#FCA5A5]">
              ⚠ Q = 0 bo:
              {allocations.pools.sprzedaz_budowa === 0 && ' brak sprzedaży przypisanej do tej budowy NA POZIOMIE POZYCJI (kliknij „Propaguj budowy → pozycje" w Finanse).'}
              {allocations.pools.unassigned_company === 0 && allocations.pools.sprzedaz_budowa > 0 && ' brak kosztów firmowych BEZ przypisanej budowy w tym okresie.'}
              {allocations.pools.sprzedaz_total_firma === 0 && ' brak żadnej sprzedaży firmy w okresie (sprawdź faktury sprzedażowe z is_income=true).'}
            </div>
          )}
        </div>
      )}
      <CardContent className="p-0">
        {positions.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-8 text-center" data-testid="template-empty">
            {stages.length === 0 ? (
              <div>
                <div className="text-base mb-3">Aby zacząć tworzyć kosztorys, najpierw utwórz <b className="text-white">etap budowy</b> (np. „Mury oporowe", „Roboty zewnętrzne").</div>
                <div className="text-xs text-[#64748B]">Etap to grupa pozycji kosztorysowych. Najczęściej odpowiada fazom realizacji budowy.</div>
              </div>
            ) : (
              'Kliknij „Dodaj pozycję" aby zacząć.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ maxHeight: '70vh' }}>
            <table className="text-[10px] border-collapse" style={{ minWidth: totalWidth, width: '100%' }}>
              <thead className="sticky top-0 z-20" style={{ backgroundColor: HEADER_BG }}>
                <tr>
                  {cols.map((c) => (
                    <th key={c.k}
                      className="px-1 py-2 text-center font-bold text-white border-r border-b text-[9px] uppercase cursor-pointer hover:bg-[#5F7552] transition-colors"
                      style={{
                        borderColor: BORDER,
                        width: c.w,
                        minWidth: c.w,
                        ...(c.sticky ? { position: 'sticky', left: 0, zIndex: 21, backgroundColor: HEADER_BG } : {}),
                        ...(c.bg ? { backgroundColor: c.bg } : {}),
                      }}
                      onClick={() => setInfoCol(c)}
                      data-testid={`col-header-${c.k}`}
                      title={'Kliknij aby zobaczyć opis kolumny: ' + c.label}>
                      <div className="leading-tight flex items-center justify-center gap-0.5">
                        {c.label}
                        <span className="text-[#D4AF37] text-[8px] opacity-70">ⓘ</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-1 py-2 sticky right-0 bg-[#3F5235] text-white text-[9px] uppercase border-l border-b" style={{ borderColor: BORDER, width: 70, minWidth: 70, zIndex: 21 }}>Akcje</th>
                </tr>
                {/* iter90: Wiersz SUM kolumn (sticky pod naglowkami) */}
                <tr data-testid="grand-totals-row" style={{ backgroundColor: '#0F1A30', borderTop: `2px solid #D4AF37`, borderBottom: `2px solid ${BORDER}` }}>
                  <td className="px-1 py-1.5 text-center font-bold text-[#D4AF37] text-[10px] uppercase border-r" style={{ borderColor: BORDER }} colSpan={2}>Σ SUMA</td>
                  <td className="px-1 py-1.5 text-left font-bold text-[#D4AF37] text-[10px] border-r" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 18, backgroundColor: '#0F1A30' }}>Wszystkie pozycje budowy</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.qty)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#94A3B8] text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.cena)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.G)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(grandTotals.H)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(grandTotals.I)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.J)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.K)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{grandTotals.hasL ? num(grandTotals.L) : '—'}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{grandTotals.hasL ? num(grandTotals.M) : '—'}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(grandTotals.N)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.O)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.P)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.Q)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(grandTotals.R)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums font-bold text-[10px] border-r" style={{ borderColor: BORDER, color: grandTotals.S >= 100 ? '#FCA5A5' : grandTotals.S >= 80 ? '#D4AF37' : '#5F7552' }}>{num(grandTotals.S, { pct: true, showZero: true })}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{grandTotals.hasT ? num(grandTotals.T) : '—'}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums font-bold text-[10px] border-r" style={{ borderColor: BORDER, color: (grandTotals.U || 0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{num(grandTotals.U)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums font-bold text-[10px] border-r" style={{ borderColor: BORDER, color: (grandTotals.V || 0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{grandTotals.hasV ? num(grandTotals.V) : '—'}</td>
                  <td className="px-1 py-1.5 sticky right-0" style={{ backgroundColor: '#0F1A30', zIndex: 17 }}></td>
                </tr>
              </thead>
              <tbody>
                {stagesWithPositions.map((stage, sIdx) => {
                  const stagePositions = positionsByStage[stage.id] || [];
                  return (
                    <React.Fragment key={stage.id}>
                      <tr>
                        <td colSpan={cols.length + 1} className="px-2 py-1.5 font-bold text-white text-[11px] uppercase tracking-wide"
                          style={{ backgroundColor: STAGE_BG, borderTop: `2px solid #D4AF37` }}
                          data-testid={`stage-label-${stage.id}`}>
                          {`▣ Etap ${sIdx + 1}: ${stage.name}`}
                        </td>
                      </tr>
                      {stagePositions.map((pos, pIdx) => {
                        const kod = `${100 + pIdx + 1}`;
                        const slots = slotsByPosition[pos.id] || {};
                        const agg = computePositionRow(pos.id);
                        return (
                          <React.Fragment key={pos.id}>
                            {/* Pozycja Glowna - auto suma */}
                            <tr data-testid={`pos-main-${pos.id}`} style={{ backgroundColor: POS_BG, borderTop: `1px solid ${BORDER}` }}>
                              <td className="px-1 py-1 text-center font-bold text-white border-r" style={{ borderColor: BORDER }}>{kod}</td>
                              <td className="px-1 py-1 text-center text-[#D4AF37] font-semibold border-r" style={{ borderColor: BORDER }}>Pozycja Główna</td>
                              <td className="px-1 py-1 text-left text-white font-bold border-r truncate" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 4, backgroundColor: POS_BG }} title={pos.name}>
                                <div className="flex items-center gap-1">
                                  <span className="truncate flex-1">{pos.name}</span>
                                  {pos.include_in_protocol === false && (
                                    <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-[#9B2C2C]/30 text-[#FCA5A5] border border-[#9B2C2C]/50" title="Pozycja NIE jest zaciągana do protokołu zaawansowania">
                                      bez prot.
                                    </span>
                                  )}
                                  <button onClick={() => onAddSubposition(pos)} className="text-[#5F7552] hover:text-[#9DBC85] shrink-0 p-0.5 rounded bg-[#0B1120] border border-[#5F7552]/40" data-testid={`pos-add-sub-${pos.id}`} title="Dodaj podpozycję (Robocizna / Materiał / Sprzęt)">
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{fmtCellNum(agg.qty)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }}>{num(agg.cena)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-white font-bold border-r" style={{ borderColor: BORDER }}>{num(agg.G)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(agg.H)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(agg.I)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }}>{num(agg.J)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-white font-bold border-r" style={{ borderColor: BORDER }}>{num(agg.K)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r relative" style={{ borderColor: BORDER }} title={agg.hasL ? 'Suma kosztu prognozowanego ze składowych' : 'Brak wartości - wpisz w podpozycjach'}>{agg.hasL ? num(agg.L) : '—'}</td>
                              <td className="px-1 py-1 text-right tabular-nums border-r font-semibold" style={{ borderColor: BORDER, color: (agg.M||0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{agg.M != null ? num(agg.M) : '—'}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(agg.N)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }} title="O = koszty bez budget_line_id na tej budowie (z wyl. KP), rozproszone wg % protokol pozycji">{num(agg.O)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }} title="P = wynagrodzenia tej budowy alokowane do slotu robocizny pozycji">{num(agg.P)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }} title="Q = firmowe koszty bez budowy x (KP_budowa / KP_firma), alokowane do slotu robocizny">{num(agg.Q)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] font-bold border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(agg.R)}</td>
                              {renderAlertCell(agg.S, null, { pct: true, warningTitle: 'Przekroczono 100% kosztu jednostkowego - sprawdz alokacje O/P/Q vs N' })}
                              {renderAlertCell(agg.T, agg.L, { warningTitle: 'Przekroczono prognozowany koszt (T = L - R < 0)' })}
                              {renderAlertCell(agg.U, agg.K, { warningTitle: 'STRATA - koszty przekraczaja Budzet Zwolniony (U = K - R < 0)' })}
                              {renderAlertCell(agg.V, null, { skipWarn: true, warningTitle: 'Zysk faktyczny gorszy od prognozowanego' })}
                              <td className="px-1 py-1 text-center sticky right-0" style={{ backgroundColor: POS_BG, zIndex: 4, borderLeft: `1px solid ${BORDER}` }}>
                                <button onClick={() => onEditPosition(pos)} className="text-[#94A3B8] hover:text-white p-1" data-testid={`pos-edit-${pos.id}`} title="Edytuj nazwę/etap"><Pencil className="h-3 w-3" /></button>
                                <button onClick={() => onDeletePosition(pos)} className="text-[#94A3B8] hover:text-[#FCA5A5] p-1" data-testid={`pos-del-${pos.id}`} title="Usuń pozycję (wraz z podpozycjami)"><Trash2 className="h-3 w-3" /></button>
                              </td>
                            </tr>
                            {/* Podpozycje (3 sloty R/M/S w kolejnosci sprzet/robocizna/material) */}
                            {(() => {
                              const hasAnySub = SUB_TYPE_ORDER.some((t) => (slots[t] || []).length > 0);
                              if (!hasAnySub) {
                                return (
                                  <tr data-testid={`pos-empty-${pos.id}`} style={{ backgroundColor: SUB_BG }}>
                                    <td colSpan={cols.length + 1} className="px-3 py-2 text-center text-[#94A3B8] text-[10px] italic border-r" style={{ borderColor: BORDER }}>
                                      Brak podpozycji. Kliknij <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#0B1120] border border-[#5F7552]/40 text-[#5F7552]"><Plus className="h-2.5 w-2.5" /></span> przy nazwie pozycji aby dodać Robociznę / Materiał / Sprzęt.
                                    </td>
                                  </tr>
                                );
                              }
                              return null;
                            })()}
                            {(() => {
                              // iter88: rozwijamy wszystkie sloty (tez duplikaty legacy)
                              const flatSlots = [];
                              let counter = 1;
                              SUB_TYPE_ORDER.forEach((type) => {
                                (slots[type] || []).forEach((slot) => {
                                  flatSlots.push({ slot, type, subKod: `${kod}.${counter++}` });
                                });
                              });
                              return flatSlots.map(({ slot, type, subKod }) => {
                                const r = computeRow(slot);
                                const children = childrenByParent[slot.id] || [];
                                return (
                                  <React.Fragment key={`${pos.id}-${slot.id}`}>
                                  <tr data-testid={`pos-sub-${slot.id}`} style={{ backgroundColor: SUB_BG }}>
                                    <td className="px-1 py-1 text-center text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{subKod}</td>
                                    <td className="px-1 py-1 text-center border-r" style={{ borderColor: BORDER, color: BUDGET_TYPES[type].color }}>{SUB_TYPE_LABEL[type]}</td>
                                    <td className="px-1 py-1 text-left text-[#CBD5E1] border-r truncate pl-4" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 4, backgroundColor: SUB_BG }} title={slot.name}>
                                      <span className="text-[#64748B] mr-1">↳</span>{slot.name}
                                    </td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{fmtCellNum(r.qty)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{num(r.cena)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-white border-r" style={{ borderColor: BORDER }}>{num(r.G)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(r.H)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(r.I)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }}>{num(r.J)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{num(r.K)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums border-r relative" style={{ borderColor: BORDER }} data-testid={`forecast-cell-${slot.id}`}>
                                      <ForecastCell line={slot} computedL={r.L} isParent={false} computedQty={r.qty} computedCena={r.cena} computedG={r.G} onSave={onSaveLine} num={num} />
                                    </td>
                                    <td className="px-1 py-1 text-right tabular-nums border-r font-semibold" style={{ borderColor: BORDER, color: (r.M||0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{r.M != null ? num(r.M) : '—'}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(r.N)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#64748B] border-r" style={{ borderColor: BORDER }}>{num(r.O)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#64748B] border-r" style={{ borderColor: BORDER }}>{num(r.P)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#64748B] border-r" style={{ borderColor: BORDER }}>{num(r.Q)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] font-bold border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(r.R)}</td>
                                    {renderAlertCell(r.S, null, { pct: true, warningTitle: 'Slot: przekroczono 100% kosztu (R/K)' })}
                                    {renderAlertCell(r.T, r.L, { warningTitle: 'Slot: przekroczono prognoze (T = L - R)' })}
                                    {renderAlertCell(r.U, r.K, { warningTitle: 'Slot: strata (U = K - R)' })}
                                    {renderAlertCell(r.V, null, { skipWarn: true })}
                                    <td className="px-1 py-1 text-center sticky right-0" style={{ backgroundColor: SUB_BG, zIndex: 4, borderLeft: `1px solid ${BORDER}` }}>
                                      <button onClick={() => onAddChildLine(slot)} className="text-[#5F7552] hover:text-[#9DBC85] p-0.5" data-testid={`sub-add-child-${slot.id}`} title="Dodaj składową (rozwiń podpozycję)"><Plus className="h-3 w-3" /></button>
                                      <button onClick={() => onEditLine(slot)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`sub-edit-${slot.id}`} title="Edytuj wartości"><Pencil className="h-3 w-3" /></button>
                                    </td>
                                  </tr>
                                  {/* Skladowe (np. cement, piasek) - wciecie x2 */}
                                  {children.map((c) => {
                                    const cr = computeRow(c);
                                    return (
                                      <tr key={c.id} data-testid={`pos-skladowa-${c.id}`} style={{ backgroundColor: '#0a0f1d' }}>
                                        <td className="px-1 py-0.5 text-center text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER }}>{subKod}.</td>
                                        <td className="px-1 py-0.5 text-center text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER }}>składowa</td>
                                        <td className="px-1 py-0.5 text-left text-[#94A3B8] italic text-[9px] border-r truncate pl-8" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 4, backgroundColor: '#0a0f1d' }} title={c.name}>
                                          <span className="text-[#D4AF37] mr-1">↳↳</span>{c.name}
                                        </td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#94A3B8] text-[9px] border-r" style={{ borderColor: BORDER }}>{fmtCellNum(cr.qty)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#94A3B8] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.cena)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#CBD5E1] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.G)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(cr.H)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(cr.I)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.J)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#94A3B8] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.K)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums border-r text-[9px] relative" style={{ borderColor: BORDER }} data-testid={`forecast-cell-skladowa-${c.id}`}>
                                          <ForecastCell line={c} computedL={cr.L} isParent={false} computedQty={cr.qty} computedCena={cr.cena} computedG={cr.G} onSave={onSaveLine} num={num} />
                                        </td>
                                        <td colSpan={10} className="px-1 py-0.5 text-[9px] text-[#64748B] text-center border-r" style={{ borderColor: BORDER }}>(składowa — wartości agregują się do podpozycji)</td>
                                        <td className="px-1 py-0.5 text-center sticky right-0" style={{ backgroundColor: '#0a0f1d', zIndex: 4, borderLeft: `1px solid ${BORDER}` }}>
                                          <button onClick={() => onEditLine(c)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`skladowa-edit-${c.id}`}><Pencil className="h-3 w-3" /></button>
                                          <button onClick={() => onDeleteLine(c.id)} className="text-[#94A3B8] hover:text-[#FCA5A5] p-0.5" data-testid={`skladowa-del-${c.id}`}><Trash2 className="h-3 w-3" /></button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            });
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
                {orphanPositions.length > 0 && (
                  <tr>
                    <td colSpan={cols.length + 1} className="px-2 py-2 text-[#FCA5A5] bg-[#9B2C2C]/20 text-xs font-bold">
                      ⚠ Pozycje bez etapu ({orphanPositions.length}) - przypisz je do etapu klikając ikonę ✎
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3 py-2 bg-[#0B1120] border-t border-[#2A3B59] text-[10px] text-[#94A3B8]">
          <div className="flex items-center gap-2 flex-wrap" data-testid="budget-legend">
            <span className="text-[#D4AF37] font-semibold">ⓘ</span>
            <span>Kliknij nagłówek kolumny aby zobaczyć opis i wzór.</span>
            <span className="text-[#475569]">·</span>
            <span>Alerty:</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: '#9B2C2C', color: '#fff' }}>⚠ czerwone</span>
            <span>= strata / przekroczenie</span>
            <span className="text-[#475569]">·</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: '#D4AF37', color: '#0B1120' }}>żółte</span>
            <span>= rezerwa &lt; 5%</span>
            <span className="text-[#475569]">·</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: '#5F7552' }}>zielone</span>
            <span>= bezpieczny zapas</span>
          </div>
        </div>
      </CardContent>
      {/* iter82: Modal opisu kolumny */}
      <Dialog open={!!infoCol} onOpenChange={(o) => { if (!o) setInfoCol(null); }}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-lg" data-testid="col-info-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-[#4F6343] text-white text-xs font-mono">{infoCol?.k}</span>
              <span>{infoCol?.label}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {infoCol?.formula && (
              <div>
                <div className="text-[#94A3B8] text-xs uppercase mb-1">Wzór</div>
                <code className="block bg-[#0B1120] border border-[#2A3B59] rounded px-3 py-2 text-[#D4AF37] font-mono">{infoCol.formula}</code>
              </div>
            )}
            <div>
              <div className="text-[#94A3B8] text-xs uppercase mb-1">Opis</div>
              <div className="text-[#CBD5E1] leading-relaxed">{infoCol?.desc || 'Brak opisu.'}</div>
            </div>
            {['S', 'T', 'U', 'V'].includes(infoCol?.k) && (
              <div>
                <div className="text-[#94A3B8] text-xs uppercase mb-1">Alerty kolorów</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#9B2C2C', color: '#fff' }}>⚠ czerwone</span>
                    <span>strata lub przekroczenie planu</span>
                  </div>
                  {['T', 'U'].includes(infoCol?.k) && (
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#D4AF37', color: '#0B1120' }}>żółte</span>
                      <span>mała rezerwa (mniej niż 5% wartości referencyjnej)</span>
                    </div>
                  )}
                  {infoCol?.k === 'S' && (
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#D4AF37', color: '#0B1120' }}>żółte</span>
                      <span>≥ 80% i &lt; 100%</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded font-bold" style={{ color: '#5F7552' }}>zielone</span>
                    <span>w normie / bezpieczny zapas</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* iter95g: Modal rozbicia Q (skąd się wziął) */}
      <Dialog open={showQBreakdown} onOpenChange={setShowQBreakdown}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-3xl" data-testid="q-breakdown-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-[#4F6343] text-white text-xs font-mono">Q</span>
              <span>Skąd wzięła się ta kwota? Rozbicie kolumny Q</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
            <div className="rounded bg-[#0B1120] border border-[#2A3B59] p-3">
              <div className="text-[#D4AF37] font-bold text-lg mb-1">
                Q = {fmtNum(allocations?.pools?.Q || 0)} zł
              </div>
              <div className="text-xs text-[#94A3B8]">
                Suma kosztów firmowych BEZ przypisanej budowy, rozdzielonych pomiędzy budowy proporcjonalnie do sprzedaży.
                Następnie ta kwota trafia tylko na sloty <b>robocizny (R)</b> proporcjonalnie do % zaawansowania pozycji.
              </div>
            </div>

            {/* Skład Q */}
            <div>
              <div className="text-[#94A3B8] text-xs uppercase mb-2">Skład Q (jak liczone)</div>
              <table className="w-full text-xs border border-[#2A3B59] rounded overflow-hidden">
                <tbody>
                  <tr className="border-b border-[#2A3B59]">
                    <td className="px-2 py-1.5">🔹 Kategoryzowane (KP/KSP/PPE pro-rata jak Sprzedaż)</td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#D4AF37]">{fmtNum(allocations?.pools?.q_categorized || 0)} zł</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5">🔹 Pozostałe (KSB bez budowy, kod=brak) × %sprzedaży</td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#D4AF37]">{fmtNum(allocations?.pools?.q_leftover || 0)} zł</td>
                  </tr>
                  <tr className="bg-[#0B1120] border-t border-[#D4AF37]/40">
                    <td className="px-2 py-1.5 font-bold">SUMA Q</td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#D4AF37]">{fmtNum(allocations?.pools?.Q || 0)} zł</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Per miesiąc */}
            {allocations?.q_monthly?.length > 0 && (
              <div>
                <div className="text-[#94A3B8] text-xs uppercase mb-2">
                  Rozbicie per miesiąc (w widoku rocznym sumujemy Q liczone NIEZALEŻNIE dla każdego miesiąca)
                </div>
                <table className="w-full text-xs border border-[#2A3B59] rounded overflow-hidden">
                  <thead className="bg-[#131C2F] text-[#94A3B8]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Miesiąc</th>
                      <th className="px-2 py-1.5 text-right">Sprzedaż tej budowy</th>
                      <th className="px-2 py-1.5 text-right">Sprzedaż firmy</th>
                      <th className="px-2 py-1.5 text-right">% sprzedaży</th>
                      <th className="px-2 py-1.5 text-right">Kategoryzow.</th>
                      <th className="px-2 py-1.5 text-right">Pozostałe × %</th>
                      <th className="px-2 py-1.5 text-right">Q miesiąca</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.q_monthly.map((m) => (
                      <tr key={m.month} className="border-t border-[#2A3B59]">
                        <td className="px-2 py-1.5 font-mono">{MONTHS_PL[m.month-1]} {m.year}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.sprzedaz_budowa)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.sprzedaz_firma)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{(m.ratio * 100).toFixed(2)}%</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.q_cat)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.q_left)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-[#D4AF37]">{fmtNum(m.q)}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#0B1120] border-t border-[#D4AF37]/40 font-bold">
                      <td className="px-2 py-1.5">SUMA</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.sprzedaz_budowa)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.sprzedaz_total_firma)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{((allocations.pools.sprzedaz_ratio || 0) * 100).toFixed(2)}%</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.q_categorized)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.q_leftover)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[#D4AF37]">{fmtNum(allocations.pools.Q)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-[10px] text-[#64748B] mt-2">
                  ℹ Miesiące, w których budowa nie miała żadnego zapisu (faktury/kosztu), są pomijane.
                  Q jest liczone osobno per miesiąc i sumowane — dzięki temu różne miesięczne ratio
                  sprzedaży są poprawnie odzwierciedlone.
                </div>
              </div>
            )}

            {/* Wyjaśnienie metody */}
            <div className="rounded bg-[#0B1120] border border-[#2A3B59] p-3 text-xs">
              <div className="text-[#94A3B8] uppercase mb-1">Jak działa „Kategoryzowane"</div>
              <ul className="space-y-0.5 list-disc list-inside text-[#CBD5E1]">
                <li>KP (wynagrodzenia) nieprzyp. × (KP tej budowy / suma KP wszystkich budów)</li>
                <li>KSP_STAWKI nieprzyp. × ((KP+KBB) tej budowy / suma)</li>
                <li>KSP_UKLADY nieprzyp. × udział KP</li>
                <li>Pozostałe KSP × udział KP</li>
                <li>PPE (podatki) × (sprzedaż tej budowy / sprzedaż całej firmy)</li>
              </ul>
              <div className="text-[#94A3B8] uppercase mt-3 mb-1">Jak działa „Pozostałe"</div>
              <div className="text-[#CBD5E1]">
                Wszystkie firmowe koszty BEZ budowy które NIE są w kategoriach KP/KSP/PPE
                (np. faktury Hilti, NOE bez kodu — patrz screenshot).
                Mnożone przez: <code className="bg-[#19243C] px-1 rounded">sprzedaż_budowy / sprzedaż_firmy</code> dla danego miesiąca.
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowQBreakdown(false)}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white px-4 py-2 rounded text-sm"
              data-testid="q-breakdown-close">Zamknij</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const BudgetExcelView = ({ lines, onProgressChange, onEdit, onDelete, onAddChild }) => {
  // Helper: zbuduj displayRows per typ - parent + jego dzieci (max 2 poziomy)
  const buildDisplay = (typeLines) => {
    const parents = typeLines.filter(l => !l.parent_id);
    const childrenByParent = {};
    typeLines.filter(l => l.parent_id).forEach(c => {
      if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
      childrenByParent[c.parent_id].push(c);
    });
    const rows = [];
    let nr = 1;
    parents.forEach((p) => {
      const kids = childrenByParent[p.id] || [];
      let aggregated = null;
      if (kids.length > 0) {
        const sumPlan = kids.reduce((s, k) => s + (k.plan_netto_computed || 0), 0);
        const sumExec = kids.reduce((s, k) => s + (k.execution_netto || 0), 0);
        const sumGir = kids.reduce((s, k) => s + (k.kaucja_gir_amount || 0), 0);
        const sumDw = kids.reduce((s, k) => s + (k.kaucja_dw_amount || 0), 0);
        const sumQty = kids.reduce((s, k) => s + (k.quantity || 0), 0);
        const pct = sumPlan > 0 ? Math.round((sumExec / sumPlan) * 100) : 0;
        aggregated = { plan: sumPlan, exec: sumExec, kg: sumGir, kd: sumDw, qty: sumQty, pct };
      }
      const parentNr = nr;
      rows.push({ line: p, isChild: false, nrLabel: String(parentNr), aggregated, hasChildren: kids.length > 0 });
      kids.forEach((k, ci) => {
        rows.push({ line: k, isChild: true, nrLabel: `${parentNr}.${ci + 1}`, aggregated: null, hasChildren: false });
      });
      nr++;
    });
    return rows;
  };

  // Filtruj wedlug typu, potem zbuduj rzedy display z parentami i dziecmi
  const materialsRows = useMemo(() => buildDisplay(lines.filter(l => !l.is_income && (l.type || 'materials') === 'materials')), [lines]);
  const laborRows = useMemo(() => buildDisplay(lines.filter(l => !l.is_income && l.type === 'labor')), [lines]);
  const equipmentRows = useMemo(() => buildDisplay(lines.filter(l => !l.is_income && l.type === 'equipment')), [lines]);
  const maxRows = Math.max(materialsRows.length, laborRows.length, equipmentRows.length, 1);

  // Liczniki glownych pozycji (parent count) dla naglowkow blokow
  const materialsCount = materialsRows.filter(r => !r.isChild).length;
  const laborCount = laborRows.filter(r => !r.isChild).length;
  const equipmentCount = equipmentRows.filter(r => !r.isChild).length;

  const KAUCJA_BG = 'rgba(79, 99, 67, 0.25)';
  const PRZEROB_BG = 'rgba(212, 175, 55, 0.18)';
  const CHILD_BG = 'rgba(15, 23, 42, 0.6)'; // ciemniejsze tlo dla skladowych
  const HEADER_BG = '#4F6343';
  const HEADER_DARK = '#3F5235';
  const BORDER = '#2A3B59';
  const SEPARATOR = '#D4AF37'; // złoty pionowy separator między blokami

  // Renderuje przyciski akcji w komorce NAZWA
  const renderNameActions = (line, isChild) => (
    <div className="flex items-center gap-1">
      {isChild && <span className="text-[#D4AF37] shrink-0">↳</span>}
      <span className="truncate flex-1" style={isChild ? { color: '#94A3B8', fontStyle: 'italic' } : {}}>{line.name}</span>
      {!isChild && onAddChild && (
        <button onClick={() => onAddChild(line)} className="text-[#5F7552] hover:text-[#9DBC85] shrink-0" data-testid={`excel-add-child-${line.id}`} title="Dodaj składową kosztową">
          <Plus className="h-3 w-3" />
        </button>
      )}
      {onEdit && (
        <button onClick={() => onEdit(line)} className="text-[#94A3B8] hover:text-white shrink-0" data-testid={`excel-edit-${line.id}`} title="Edytuj">
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button onClick={() => onDelete(line.id)} className="text-[#94A3B8] hover:text-[#FCA5A5] shrink-0" data-testid={`excel-del-${line.id}`} title={isChild ? 'Usuń składową' : 'Usuń (wraz ze składowymi)'}>
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]" data-testid="budget-excel-view">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <span style={{ color: '#D4AF37' }}>▦</span> Widok zestawienia kosztorysowego
        </CardTitle>
        <p className="text-[10px] text-[#94A3B8] mt-1">
          Pełna tabela 1:1 z arkuszem wykonawczym. Kolumny <span style={{ color: '#5F7552' }}>zielone</span> = kaucje (K.GIR / K.DW). Kolumny <span style={{ color: '#D4AF37' }}>złote</span> = przeroby. Klik <Plus className="h-3 w-3 inline-block text-[#5F7552]" /> obok nazwy = dodaj składową. Pozycja z ↳ = składowa kosztowa; wartości pozycji nadrzędnej liczą się jako suma składowych.
        </p>
      </CardHeader>
      <CardContent className="p-2">
        <div className="overflow-x-auto">
        <table className="text-[9px] border-collapse w-full table-fixed" style={{ minWidth: '1400px' }} data-testid="excel-combined-table">
          <thead>
            {/* Wiersz 1: 3 grupowe naglowki */}
            <tr>
              <th colSpan={13} className="px-1 py-1 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER }}>
                MATERIAŁY ({materialsCount})
              </th>
              <th colSpan={8} className="px-1 py-1 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER, borderLeft: `2px solid ${SEPARATOR}` }}>
                ROBOCIZNA ({laborCount})
              </th>
              <th colSpan={11} className="px-1 py-1 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER, borderLeft: `2px solid ${SEPARATOR}` }}>
                SPRZĘT ({equipmentCount})
              </th>
            </tr>
            {/* Wiersz 2: nazwy kolumn — krotsze etykiety */}
            <tr style={{ backgroundColor: HEADER_BG }}>
              {[
                { l: 'KOD', w: '2%' },
                { l: 'NAZWA', w: '7%' },
                { l: 'JD.', w: '2%' },
                { l: 'ILOŚĆ', w: '2%' },
                { l: 'CENA MAT.', w: '3%' },
                { l: 'BUDŻET', w: '4%' },
                { l: 'K.GIR', w: '3%' },
                { l: 'K.DW', w: '3%' },
                { l: 'B.ZW.', w: '4%' },
                { l: 'C.B.JD.', w: '3%' },
                { l: 'PRZER.M', w: '4%' },
                { l: 'K.ZAK.', w: '4%' },
                { l: 'C.ZAK.', w: '3%' },
              ].map((c, i) => (
                <th key={`m-${i}`} className="px-0.5 py-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER, width: c.w }}>{c.l}</th>
              ))}
              {[
                { l: 'KOD', w: '2%' },
                { l: 'NAZWA', w: '7%' },
                { l: 'BUDŻET', w: '4%' },
                { l: 'K.GIR', w: '3%' },
                { l: 'K.DW', w: '3%' },
                { l: 'B.ZW.', w: '4%' },
                { l: 'PRZER.R', w: '4%' },
                { l: '%', w: '2%' },
              ].map((c, i) => (
                <th key={`r-${i}`} className="px-0.5 py-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER, width: c.w, ...(i === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>{c.l}</th>
              ))}
              {[
                { l: 'KOD', w: '2%' },
                { l: 'NAZWA', w: '7%' },
                { l: 'JD.', w: '2%' },
                { l: 'ILOŚĆ', w: '2%' },
                { l: 'CENA', w: '3%' },
                { l: 'KOSZT', w: '4%' },
                { l: 'K.GIR', w: '3%' },
                { l: 'K.DW', w: '3%' },
                { l: 'B.ZW.', w: '4%' },
                { l: 'PRZER.S', w: '4%' },
                { l: '%', w: '2%' },
              ].map((c, i) => (
                <th key={`s-${i}`} className="px-0.5 py-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER, width: c.w, ...(i === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>{c.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(materialsRows.length === 0 && laborRows.length === 0 && equipmentRows.length === 0) ? (
              <tr><td colSpan={32} className="p-4 text-center text-[#94A3B8] border" style={{ borderColor: BORDER }}>Brak pozycji. Dodaj najpierw pozycje budżetu.</td></tr>
            ) : Array.from({ length: maxRows }, (_, i) => {
              const mRow = materialsRows[i];
              const rRow = laborRows[i];
              const sRow = equipmentRows[i];
              return (
                <tr key={i} className="hover:bg-[#0B1120]/40">
                  {/* MATERIAŁY (13 kolumn) */}
                  {mRow ? (() => {
                    const m = mRow.line;
                    const agg = mRow.aggregated;
                    // Tryb mieszany: jezeli ma dzieci -> suma; jezeli nie -> wlasne wartosci
                    const plan = agg ? agg.plan : (m.plan_netto_computed || 0);
                    const ilosc = agg ? agg.qty : (m.quantity || 0);
                    const cena = ilosc > 0 ? plan / ilosc : (m.unit_price_netto || 0);
                    const kg = agg ? agg.kg : (m.kaucja_gir_amount || 0);
                    const kd = agg ? agg.kd : (m.kaucja_dw_amount || 0);
                    const bzw = plan - kg - kd;
                    const cenaBjd = ilosc > 0 ? plan / ilosc : 0;
                    const przerob = agg ? agg.exec : (m.execution_netto || 0);
                    const cenaZakupu = ilosc > 0 ? przerob / ilosc : 0;
                    const rowBg = mRow.isChild ? CHILD_BG : undefined;
                    const cellStyle = { borderColor: BORDER, ...(rowBg ? { backgroundColor: rowBg } : {}) };
                    return (
                      <>
                        <td className="px-1 py-0.5 text-center text-[#CBD5E1] border tabular-nums" style={cellStyle}>{mRow.nrLabel}</td>
                        <td className="px-1 py-0.5 text-left text-white border" style={{ ...cellStyle, maxWidth: 0 }} title={m.name}>
                          {renderNameActions(m, mRow.isChild)}
                        </td>
                        <td className="px-0.5 py-0.5 text-center text-[#94A3B8] border" style={cellStyle}>{m.unit || '—'}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCellNum(ilosc)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(cena)}</td>
                        <td className="px-0.5 py-0.5 text-right text-white font-semibold border tabular-nums" style={cellStyle}>{fmtCell(plan)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(bzw)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#94A3B8] border tabular-nums" style={cellStyle}>{fmtCell(cenaBjd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#94A3B8] border tabular-nums" style={cellStyle}>{fmtCell(przerob)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#94A3B8] border tabular-nums" style={cellStyle}>{fmtCell(cenaZakupu)}</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 13 }, (_, j) => (
                      <td key={`em-${j}`} className="px-0.5 py-0.5 border bg-[#0B1120]/30" style={{ borderColor: BORDER }}>&nbsp;</td>
                    ))}</>
                  )}
                  {/* ROBOCIZNA (8 kolumn) */}
                  {rRow ? (() => {
                    const r = rRow.line;
                    const agg = rRow.aggregated;
                    const plan = agg ? agg.plan : (r.plan_netto_computed || 0);
                    const kg = agg ? agg.kg : (r.kaucja_gir_amount || 0);
                    const kd = agg ? agg.kd : (r.kaucja_dw_amount || 0);
                    const bzw = plan - kg - kd;
                    const przerob = agg ? agg.exec : (r.execution_netto || 0);
                    const pct = agg ? agg.pct : (r.progress_pct || 0);
                    const rowBg = rRow.isChild ? CHILD_BG : undefined;
                    const cellStyle = { borderColor: BORDER, ...(rowBg ? { backgroundColor: rowBg } : {}) };
                    return (
                      <>
                        <td className="px-1 py-0.5 text-center text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, borderLeft: `2px solid ${SEPARATOR}` }}>{rRow.nrLabel}</td>
                        <td className="px-1 py-0.5 text-left text-white border" style={{ ...cellStyle, maxWidth: 0 }} title={r.name}>
                          {renderNameActions(r, rRow.isChild)}
                        </td>
                        <td className="px-0.5 py-0.5 text-right text-white font-semibold border tabular-nums" style={cellStyle}>{fmtCell(plan)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(bzw)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className={`px-0.5 py-0.5 text-right border tabular-nums font-semibold ${pct >= 100 ? 'text-[#9B2C2C]' : pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`} style={cellStyle}>{Math.round(pct)}%</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 8 }, (_, j) => (
                      <td key={`er-${j}`} className="px-0.5 py-0.5 border bg-[#0B1120]/30" style={{ borderColor: BORDER, ...(j === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>&nbsp;</td>
                    ))}</>
                  )}
                  {/* SPRZĘT (11 kolumn) */}
                  {sRow ? (() => {
                    const s = sRow.line;
                    const agg = sRow.aggregated;
                    const plan = agg ? agg.plan : (s.plan_netto_computed || 0);
                    const ilosc = agg ? agg.qty : (s.quantity || 0);
                    const cena = ilosc > 0 ? plan / ilosc : (s.unit_price_netto || 0);
                    const kg = agg ? agg.kg : (s.kaucja_gir_amount || 0);
                    const kd = agg ? agg.kd : (s.kaucja_dw_amount || 0);
                    const bzw = plan - kg - kd;
                    const przerob = agg ? agg.exec : (s.execution_netto || 0);
                    const pct = agg ? agg.pct : (s.progress_pct || 0);
                    const rowBg = sRow.isChild ? CHILD_BG : undefined;
                    const cellStyle = { borderColor: BORDER, ...(rowBg ? { backgroundColor: rowBg } : {}) };
                    return (
                      <>
                        <td className="px-1 py-0.5 text-center text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, borderLeft: `2px solid ${SEPARATOR}` }}>{sRow.nrLabel}</td>
                        <td className="px-1 py-0.5 text-left text-white border" style={{ ...cellStyle, maxWidth: 0 }} title={s.name}>
                          {renderNameActions(s, sRow.isChild)}
                        </td>
                        <td className="px-0.5 py-0.5 text-center text-[#94A3B8] border" style={cellStyle}>{s.unit || '—'}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCellNum(ilosc)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(cena)}</td>
                        <td className="px-0.5 py-0.5 text-right text-white font-semibold border tabular-nums" style={cellStyle}>{fmtCell(plan)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(bzw)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className={`px-0.5 py-0.5 text-right border tabular-nums font-semibold ${pct >= 100 ? 'text-[#9B2C2C]' : pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`} style={cellStyle}>{Math.round(pct)}%</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 11 }, (_, j) => (
                      <td key={`es-${j}`} className="px-0.5 py-0.5 border bg-[#0B1120]/30" style={{ borderColor: BORDER, ...(j === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>&nbsp;</td>
                    ))}</>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
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

// Kolejnosc wyswietlania w widoku kosztorysowym
const TYPE_ORDER = ['labor', 'materials', 'equipment'];

// =================== WIDOK KOSZTORYSOWY (Stage > Position > R/M/S) ===================
const BudgetCostingView = ({
  positions, stages, lines, loading,
  onAddPosition, onEditPosition, onDeletePosition,
  onEditLine, onAddChildLine, onDeleteLine,
}) => {
  const [collapsedStages, setCollapsedStages] = useState({});
  const [collapsedPositions, setCollapsedPositions] = useState({});

  const toggleStage = (id) => setCollapsedStages((s) => ({ ...s, [id]: !s[id] }));
  const togglePosition = (id) => setCollapsedPositions((s) => ({ ...s, [id]: !s[id] }));

  // Grupuj pozycje per etap
  const positionsByStage = useMemo(() => {
    const m = {};
    positions.forEach((p) => {
      const sid = p.stage_id || '__none__';
      if (!m[sid]) m[sid] = [];
      m[sid].push(p);
    });
    return m;
  }, [positions]);

  // Sloty (parent_id=null, position_id ustawione) i skladowe (parent_id != null)
  const slotsByPosition = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.position_id || ln.parent_id) return;
      const k = ln.position_id;
      if (!m[k]) m[k] = {};
      m[k][ln.type || 'materials'] = ln;
    });
    return m;
  }, [lines]);

  const childrenByParent = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.parent_id) return;
      if (!m[ln.parent_id]) m[ln.parent_id] = [];
      m[ln.parent_id].push(ln);
    });
    return m;
  }, [lines]);

  // Agreguj wartosci pozycji (suma slotow + skladowych)
  const computePositionTotals = (positionId) => {
    const slots = slotsByPosition[positionId] || {};
    const byType = {};
    let totalPlan = 0;
    let totalExec = 0;
    TYPE_ORDER.forEach((t) => {
      const slot = slots[t];
      if (!slot) { byType[t] = { plan: 0, exec: 0, pct: 0, hasChildren: false }; return; }
      const kids = childrenByParent[slot.id] || [];
      let plan = slot.plan_netto_computed || 0;
      let exec = slot.execution_netto || 0;
      if (kids.length > 0) {
        plan = kids.reduce((s, k) => s + (k.plan_netto_computed || 0), 0);
        exec = kids.reduce((s, k) => s + (k.execution_netto || 0), 0);
      }
      const pct = plan > 0 ? Math.round((exec / plan) * 100) : 0;
      byType[t] = { plan, exec, pct, hasChildren: kids.length > 0, slot };
      totalPlan += plan;
      totalExec += exec;
    });
    const totalPct = totalPlan > 0 ? Math.round((totalExec / totalPlan) * 100) : 0;
    return { byType, totalPlan, totalExec, totalPct };
  };

  const computeStageTotals = (stageId) => {
    const stagePositions = positionsByStage[stageId] || [];
    let plan = 0; let exec = 0;
    stagePositions.forEach((p) => {
      const tt = computePositionTotals(p.id);
      plan += tt.totalPlan;
      exec += tt.totalExec;
    });
    return { plan, exec, pct: plan > 0 ? Math.round((exec / plan) * 100) : 0, count: stagePositions.length };
  };

  // Suma calego kosztorysu
  const grandTotals = useMemo(() => {
    let plan = 0; let exec = 0;
    positions.forEach((p) => {
      const tt = computePositionTotals(p.id);
      plan += tt.totalPlan;
      exec += tt.totalExec;
    });
    return { plan, exec, pct: plan > 0 ? Math.round((exec / plan) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, slotsByPosition, childrenByParent]);

  const stagesWithPositions = stages.filter((s) => positionsByStage[s.id]?.length > 0);
  const orphanPositions = positionsByStage['__none__'] || [];

  if (loading) return <Card className="bg-[#131C2F] border-[#2A3B59]"><CardContent className="p-6 text-[#94A3B8] text-sm">Ładuję...</CardContent></Card>;

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]" data-testid="budget-costing-view">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <FolderTree className="h-5 w-5" style={{ color: '#D4AF37' }} />
          Kosztorys: Etapy → Pozycje → Robocizna · Materiały · Sprzęt
        </CardTitle>
        <Button size="sm"
          onClick={onAddPosition}
          disabled={stages.length === 0}
          className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8 disabled:opacity-40"
          data-testid="costing-add-position-btn"
          title={stages.length === 0 ? 'Najpierw utwórz etap' : 'Dodaj nową pozycję kosztorysową'}>
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
      </CardHeader>
      <CardContent className="p-2 space-y-2">
        {positions.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-8 text-center" data-testid="costing-empty">
            Brak pozycji kosztorysowych. {stages.length === 0 ? <>Najpierw utwórz <b>etap</b> (np. „Roboty zewnętrzne"), potem dodaj pozycje.</> : 'Kliknij „Dodaj pozycję" aby zacząć.'}
          </div>
        ) : (
          <>
            {stagesWithPositions.map((stage) => {
              const collapsed = collapsedStages[stage.id];
              const stagePositions = positionsByStage[stage.id] || [];
              const st = computeStageTotals(stage.id);
              return (
                <div key={stage.id} className="rounded border border-[#2A3B59] overflow-hidden" data-testid={`stage-block-${stage.id}`}>
                  <button
                    type="button"
                    onClick={() => toggleStage(stage.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-gradient-to-r from-[#3F5235] to-[#4F6343] hover:from-[#4F6343] hover:to-[#5F7552] text-left"
                    data-testid={`stage-toggle-${stage.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {collapsed ? <ChevronRight className="h-4 w-4 text-white shrink-0" /> : <ChevronDown className="h-4 w-4 text-white shrink-0" />}
                      <span className="text-white font-bold text-sm uppercase tracking-wide truncate">{stage.name}</span>
                      <span className="text-[#0B1120] bg-[#D4AF37] text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">{st.count}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] tabular-nums shrink-0">
                      <span className="text-[#0B1120] bg-white/85 px-2 py-0.5 rounded font-semibold">Plan: {fmtNum(st.plan)} zł</span>
                      <span className="text-[#0B1120] bg-[#D4AF37] px-2 py-0.5 rounded font-bold">Wyk: {fmtNum(st.exec)} zł ({st.pct}%)</span>
                    </div>
                  </button>
                  {!collapsed && (
                    <div className="bg-[#0B1120]/40 p-2 space-y-2">
                      {stagePositions.map((pos) => (
                        <PositionCard
                          key={pos.id}
                          position={pos}
                          totals={computePositionTotals(pos.id)}
                          collapsed={collapsedPositions[pos.id]}
                          onToggle={() => togglePosition(pos.id)}
                          onEditPosition={onEditPosition}
                          onDeletePosition={onDeletePosition}
                          onEditLine={onEditLine}
                          onAddChildLine={onAddChildLine}
                          onDeleteLine={onDeleteLine}
                          childrenByParent={childrenByParent}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {orphanPositions.length > 0 && (
              <div className="rounded border border-dashed border-[#9B2C2C]" data-testid="orphan-positions">
                <div className="px-3 py-2 bg-[#9B2C2C]/20 text-[#FCA5A5] text-xs font-bold uppercase tracking-wide">
                  ⚠ Pozycje bez etapu ({orphanPositions.length}) - przypisz je do etapu
                </div>
                <div className="bg-[#0B1120]/40 p-2 space-y-2">
                  {orphanPositions.map((pos) => (
                    <PositionCard
                      key={pos.id}
                      position={pos}
                      totals={computePositionTotals(pos.id)}
                      collapsed={collapsedPositions[pos.id]}
                      onToggle={() => togglePosition(pos.id)}
                      onEditPosition={onEditPosition}
                      onDeletePosition={onDeletePosition}
                      onEditLine={onEditLine}
                      onAddChildLine={onAddChildLine}
                      onDeleteLine={onDeleteLine}
                      childrenByParent={childrenByParent}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Suma calego kosztorysu */}
            <div className="rounded border-2 border-[#D4AF37] bg-gradient-to-r from-[#3F5235] to-[#1a2436] px-3 py-2 mt-2 flex items-center justify-between" data-testid="costing-grand-total">
              <div className="text-white font-bold text-sm uppercase tracking-wide">SUMA KOSZTORYSU</div>
              <div className="flex items-center gap-4 text-xs tabular-nums">
                <span className="text-white">Plan: <b>{fmtNum(grandTotals.plan)} zł</b></span>
                <span className="text-[#D4AF37] font-bold">Wykonanie: {fmtNum(grandTotals.exec)} zł ({grandTotals.pct}%)</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Karta pojedynczej pozycji kosztorysowej z 3 slotami (R/M/S)
const PositionCard = ({
  position, totals, collapsed,
  onToggle, onEditPosition, onDeletePosition,
  onEditLine, onAddChildLine, onDeleteLine,
  childrenByParent,
}) => {
  return (
    <div className="rounded bg-[#131C2F] border border-[#2A3B59] overflow-hidden" data-testid={`position-card-${position.id}`}>
      {/* Naglowek pozycji - klikalny */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#19243C] border-b border-[#2A3B59]">
        <button type="button" onClick={onToggle} className="shrink-0 text-[#D4AF37] hover:text-white" data-testid={`position-toggle-${position.id}`}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="text-white text-sm font-semibold flex-1 truncate" title={position.name}>{position.name}</div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] tabular-nums">
          {TYPE_ORDER.map((t) => {
            const cfg = BUDGET_TYPES[t];
            const td = totals.byType[t] || { plan: 0, exec: 0, pct: 0 };
            return (
              <span key={t} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }} title={cfg.label}>
                {cfg.short}: {fmtNum(td.exec)}/{fmtNum(td.plan)}
              </span>
            );
          })}
          <span className="px-1.5 py-0.5 rounded bg-[#D4AF37] text-[#0B1120] font-bold">
            Σ {fmtNum(totals.totalExec)}/{fmtNum(totals.totalPlan)} zł ({totals.totalPct}%)
          </span>
        </div>
        <button onClick={() => onEditPosition(position)} className="text-[#94A3B8] hover:text-white shrink-0 p-1" data-testid={`position-edit-${position.id}`} title="Edytuj pozycję">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDeletePosition(position)} className="text-[#94A3B8] hover:text-[#FCA5A5] shrink-0 p-1" data-testid={`position-del-${position.id}`} title="Usuń pozycję (wraz z wszystkimi kosztami)">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!collapsed && (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-3 gap-px bg-[#2A3B59] min-w-[900px]">
            {TYPE_ORDER.map((type) => {
              const cfg = BUDGET_TYPES[type];
              const td = totals.byType[type] || {};
              const slot = td.slot;
              const children = slot ? (childrenByParent[slot.id] || []) : [];
              return (
                <div key={type} className="bg-[#0B1120] p-2" data-testid={`position-${position.id}-slot-${type}`}>
                  <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b" style={{ borderColor: `${cfg.color}40` }}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] shrink-0" style={{ backgroundColor: cfg.bg, color: cfg.textOnBg }}>{cfg.short}</div>
                      <div className="text-xs font-semibold truncate" style={{ color: cfg.color }}>{cfg.label}</div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {slot && (
                        <>
                          <button onClick={() => onAddChildLine(slot)} className="text-[#5F7552] hover:text-[#9DBC85] p-0.5" data-testid={`slot-add-child-${slot.id}`} title="Dodaj składową">
                            <Plus className="h-3 w-3" />
                          </button>
                          <button onClick={() => onEditLine(slot)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`slot-edit-${slot.id}`} title="Edytuj wartości slotu">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Wartosci slotu (lub agregat ze skladowych) */}
                  <div className="text-[10px] grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
                    <span className="text-[#94A3B8]">Plan:</span>
                    <span className="text-white font-semibold text-right">{fmtNum(td.plan || 0)} zł</span>
                    <span className="text-[#94A3B8]">Wykonanie:</span>
                    <span className="text-right" style={{ color: cfg.color }}>{fmtNum(td.exec || 0)} zł</span>
                    <span className="text-[#94A3B8]">Postęp:</span>
                    <span className={`text-right font-bold ${td.pct >= 100 ? 'text-[#9B2C2C]' : td.pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`}>{td.pct || 0}%</span>
                    {slot && (slot.kaucja_gir_amount || slot.kaucja_dw_amount) ? (
                      <>
                        <span className="text-[#94A3B8]">Kaucje:</span>
                        <span className="text-[#94A3B8] text-right">{fmtNum((slot.kaucja_gir_amount || 0) + (slot.kaucja_dw_amount || 0))} zł</span>
                      </>
                    ) : null}
                  </div>
                  {/* Skladowe */}
                  {children.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-[#2A3B59]/50 space-y-0.5">
                      <div className="text-[9px] text-[#64748B] uppercase tracking-wide mb-0.5">Składowe ({children.length})</div>
                      {children.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-1 text-[10px] hover:bg-[#19243C]/60 px-1 py-0.5 rounded">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[#D4AF37] shrink-0">↳</span>
                            <span className="text-[#CBD5E1] truncate" title={c.name}>{c.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-white tabular-nums">{fmtNum(c.plan_netto_computed || 0)}</span>
                            <button onClick={() => onEditLine(c)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`child-edit-${c.id}`} title="Edytuj składową">
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                            <button onClick={() => onDeleteLine(c.id)} className="text-[#94A3B8] hover:text-[#FCA5A5] p-0.5" data-testid={`child-del-${c.id}`} title="Usuń składową">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// =================== BUDZET (POZYCJE) ===================
const BudgetLinesPanel = ({ budowaId, year, onChange }) => {
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

// =================== PODPOZYCJA - MODAL (Robocizna / Materiał / Sprzęt) ===================
const SubpositionModal = ({ budowaId, position, stageId, existingLines = [], onClose, onSaved }) => {
  const [form, setForm] = useState({
    type: 'labor', // labor | materials | equipment
    name: position?.name || '',
    unit: '',
    quantity: '',
    unit_price_netto: '',
    kaucja_gir_pct: '',
    kaucja_dw_pct: '',
  });
  const [busy, setBusy] = useState(false);

  // iter86: znajdz istniejacy slot tego typu dla tej pozycji (sa "kontenery" - parent_id=null)
  const existingSlot = (existingLines || []).find(
    (l) => l.position_id === position?.id && !l.parent_id && (l.type || 'materials') === form.type,
  );

  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę podpozycji'); return; }
    setBusy(true);
    try {
      const payload = {
        budowa_id: budowaId,
        category: BUDGET_TYPES[form.type]?.label || 'Podpozycja',
        name: form.name.trim(),
        type: form.type,
        unit: form.unit || null,
        quantity: parseFloat(form.quantity) || 0,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0,
        position_id: position.id,
        stage_id: stageId || position.stage_id,
        kaucja_gir_pct: form.kaucja_gir_pct === '' ? null : parseFloat(form.kaucja_gir_pct),
        kaucja_dw_pct: form.kaucja_dw_pct === '' ? null : parseFloat(form.kaucja_dw_pct),
      };
      // iter86: jezeli slot tego typu juz istnieje, dodaj jako skladowa (child)
      if (existingSlot) {
        payload.parent_id = existingSlot.id;
      }
      await api.post('/budget/lines', payload);
      toast.success(
        existingSlot
          ? `Dodano składową do: ${BUDGET_TYPES[form.type].label}`
          : `Dodano podpozycję: ${BUDGET_TYPES[form.type].label}`,
      );
      onSaved && onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="subposition-modal">
        <DialogHeader>
          <DialogTitle>Dodaj podpozycję do: {position?.name}</DialogTitle>
          <p className="text-xs text-[#94A3B8] mt-1">Wybierz kategorię kosztu i wprowadź wartości.</p>
        </DialogHeader>
        {existingSlot && (
          <div className="rounded p-2 border border-[#5F7552]/60 bg-[#5F7552]/15 text-[#A7D29E] text-xs mb-2" data-testid="subposition-existing-slot-hint">
            ℹ <b>{BUDGET_TYPES[form.type].label}</b> już istnieje (<span className="font-mono">{existingSlot.name}</span>). Nowy wpis zostanie dodany jako <b>kolejna składowa</b> do tego samego rodzaju.
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Kategoria *</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'labor', label: 'Robocizna' },
                { v: 'materials', label: 'Materiał' },
                { v: 'equipment', label: 'Sprzęt' },
              ].map((opt) => {
                const cfg = BUDGET_TYPES[opt.v];
                const selected = form.type === opt.v;
                return (
                  <button key={opt.v} type="button"
                    onClick={() => setForm({ ...form, type: opt.v })}
                    className={`px-3 py-2 rounded border text-xs font-semibold transition ${selected ? 'ring-2 ring-[#D4AF37]' : ''}`}
                    style={{ backgroundColor: selected ? cfg.bg : `${cfg.color}15`, color: selected ? cfg.textOnBg : cfg.color, borderColor: cfg.color }}
                    data-testid={`subposition-type-${opt.v}`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Nazwa podpozycji *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="np. Beton C8/10 chudziak"
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="subposition-name-input" autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">Jedn.</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="m³, mb, szt"
                className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="subposition-unit-input" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">Ilość</label>
              <Input type="number" min="0" step="0.01" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="subposition-quantity-input" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">Cena netto</label>
              <Input type="number" min="0" step="0.01" value={form.unit_price_netto}
                onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="subposition-price-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">Kaucja GIR % (opcjonalne)</label>
              <Input type="number" min="0" step="0.1" value={form.kaucja_gir_pct}
                onChange={(e) => setForm({ ...form, kaucja_gir_pct: e.target.value })}
                placeholder="dziedziczy z budowy" className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="subposition-gir-input" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] mb-1 block">Kaucja DW % (opcjonalne)</label>
              <Input type="number" min="0" step="0.1" value={form.kaucja_dw_pct}
                onChange={(e) => setForm({ ...form, kaucja_dw_pct: e.target.value })}
                placeholder="dziedziczy z budowy" className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="subposition-dw-input" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose} data-testid="subposition-cancel-btn">Anuluj</Button>
          <ActionButton onAction={save} disabled={busy || !form.name.trim()}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
            data-testid="subposition-save-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj podpozycję
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// =================== POZYCJA - MODAL ===================
const PositionModal = ({ budowaId, editPosition, stages, onClose, onSaved }) => {
  const [name, setName] = useState(editPosition?.name || '');
  const [stageId, setStageId] = useState(editPosition?.stage_id || (stages[0]?.id || ''));
  const [notes, setNotes] = useState(editPosition?.notes || '');
  const [includeInProtocol, setIncludeInProtocol] = useState(
    editPosition ? (editPosition.include_in_protocol !== false) : true
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error('Podaj nazwę pozycji'); return; }
    if (!stageId) { toast.error('Wybierz etap'); return; }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        stage_id: stageId,
        notes,
        include_in_protocol: includeInProtocol,
      };
      if (editPosition) {
        await api.patch(`/budget/positions/${editPosition.id}`, payload);
        toast.success('Pozycja zaktualizowana');
      } else {
        await api.post('/budget/positions', { budowa_id: budowaId, ...payload });
        toast.success('Pozycja utworzona. Kliknij + przy nazwie aby dodać podpozycje.');
      }
      onSaved && onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="position-modal">
        <DialogHeader>
          <DialogTitle>{editPosition ? 'Edytuj pozycję kosztorysową' : 'Nowa pozycja kosztorysowa'}</DialogTitle>
          {!editPosition && (
            <p className="text-xs text-[#94A3B8] mt-1">
              Po utworzeniu pozycji kliknij <b className="text-[#D4AF37]">+</b> przy nazwie aby dodać podpozycje (Robocizna / Materiał / Sprzęt).
            </p>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Etap budowy *</label>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#2A3B59] text-white rounded px-2 py-1.5 text-sm"
              data-testid="position-stage-select">
              {stages.length === 0 ? <option value="">-- najpierw utwórz etap --</option> :
                stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Nazwa pozycji *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="np. Wykonanie chodnika"
              className="bg-[#0B1120] border-[#2A3B59] text-white"
              data-testid="position-name-input"
              autoFocus />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Notatki (opcjonalnie)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="bg-[#0B1120] border-[#2A3B59] text-white"
              data-testid="position-notes-input" />
          </div>
          {/* Checkbox: zaciagac do protokolu */}
          <label className="flex items-start gap-2 cursor-pointer p-2 rounded bg-[#0B1120] border border-[#2A3B59] hover:border-[#D4AF37]/60 transition">
            <input type="checkbox" checked={includeInProtocol}
              onChange={(e) => setIncludeInProtocol(e.target.checked)}
              className="mt-0.5 accent-[#D4AF37]"
              data-testid="position-include-in-protocol" />
            <div className="flex-1 text-xs">
              <div className="text-white font-semibold">Zaciągaj do protokołu zaawansowania</div>
              <div className="text-[#94A3B8] mt-0.5">Gdy ZAZNACZONE, pozycja pojawi się w protokole z możliwością wpisania % wykonania. Odznacz dla pozycji pomocniczych (np. „ZUS", „Wynajem biura").</div>
            </div>
          </label>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose} data-testid="position-cancel-btn">Anuluj</Button>
          <ActionButton onAction={save} disabled={busy || !name.trim() || !stageId}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
            data-testid="position-save-btn">
            <Plus className="h-4 w-4 mr-1" /> {editPosition ? 'Zapisz' : 'Utwórz pozycję'}
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
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
          <ActionButton onAction={add} disabled={busy} className="w-full bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid={`manager-add-${mode}`}><Plus className="h-4 w-4 mr-1" /> Dodaj</ActionButton>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =================== MODAL POZYCJA ===================
const BudgetLineModal = ({ budowaId, editLine, parentLine, categories, stages, budowaInfo, onCategoriesChanged, onClose, onSaved }) => {
  // Defaulty Kaucja z Finansów (effective_kaucja_*) gdy nowa pozycja
  const defaultGir = budowaInfo?.kaucja_gir_pct ?? 0;
  const defaultDw = budowaInfo?.kaucja_dw_pct ?? 0;
  const isChildMode = !editLine && !!parentLine; // tryb "dodaj skladowa"
  const [form, setForm] = useState({
    category: editLine?.category || parentLine?.category || (categories[0]?.name || ''),
    stage_id: editLine?.stage_id || parentLine?.stage_id || '',
    type: editLine?.type || parentLine?.type || 'materials',
    name: editLine?.name || '',
    unit: editLine?.unit || '',
    quantity: editLine?.quantity ?? 0,
    unit_price_netto: editLine?.unit_price_netto ?? 0,
    plan_netto_override: editLine?.plan_netto != null ? String(editLine.plan_netto) : '',  // pusty = auto
    // Override kaucji: pusty = uzyj defaultu z Finansow
    kaucja_gir_pct: editLine?.kaucja_gir_pct != null ? String(editLine.kaucja_gir_pct) : '',
    kaucja_dw_pct: editLine?.kaucja_dw_pct != null ? String(editLine.kaucja_dw_pct) : '',
    is_income: editLine?.is_income || parentLine?.is_income || false,
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
      if (isChildMode) {
        payload.parent_id = parentLine.id;
      }
      if (editLine) {
        delete payload.budowa_id;
        await api.patch(`/budget/lines/${editLine.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/budget/lines', payload);
        toast.success(isChildMode ? 'Dodano składową' : 'Dodano pozycję');
      }
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editLine ? 'Edytuj pozycję' : (isChildMode ? `Dodaj składową do: ${parentLine.name}` : 'Nowa pozycja budżetu')}
          </DialogTitle>
          {isChildMode && (
            <p className="text-xs text-[#94A3B8] mt-1">
              Składowa dziedziczy typ <b style={{ color: BUDGET_TYPES[parentLine.type || 'materials']?.color }}>{BUDGET_TYPES[parentLine.type || 'materials']?.label}</b> z pozycji nadrzędnej.
              Wartości pozycji głównej będą automatycznie sumą składowych.
            </p>
          )}
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
          <ActionButton onAction={save} disabled={saving} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="budget-line-save">{saving ? 'Zapisuję...' : 'Zapisz'}</ActionButton>
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
          <ActionButton onAction={save} disabled={saving} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="contract-save">{saving ? 'Zapisuję...' : 'Zapisz i pobierz protokół'}</ActionButton>
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
  // iter95h: ktore pozycje sa rozwiniete (pokazuja subrows)
  const [expandedPos, setExpandedPos] = useState(() => new Set());

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
      // iter72+: protokol operuje na pozycjach (BudgetPosition), lineId tutaj = position_id
      await api.post(`/budget/positions/${lineId}/progress`, { year, month, progress_pct: pct });
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

  // iter95h: zapis % subpozycji + auto-przeliczenie % pozycji (suma wazona)
  const saveSubCell = async (posRow, subId, value) => {
    const sub = (posRow.subrows || []).find((s) => s.id === subId);
    if (!sub) return null;
    const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
    if ((sub.prev_pct || 0) + pct > 100.01) {
      const max = Math.max(0, 100 - (sub.prev_pct || 0));
      toast.error(`Subpozycja: pozostało ${max.toFixed(1)}% (poprzednie mc: ${(sub.prev_pct || 0).toFixed(1)}%)`);
      return null;
    }
    try {
      // Zapis subpozycji - klucz: budget_line_id
      await api.post(`/budget/lines/${subId}/progress`, { year, month, progress_pct: pct });
      // Wylicz nowy % pozycji jako srednia wazona z subrows
      const updatedSubs = (posRow.subrows || []).map((s) =>
        s.id === subId
          ? { ...s, miesiac_pct: pct, miesiac_val: Math.round(s.plan_netto * pct / 100 * 100) / 100,
              narast_pct: Math.min(100, (s.prev_pct || 0) + pct),
              narast_val: Math.round(s.plan_netto * Math.min(100, (s.prev_pct || 0) + pct) / 100 * 100) / 100 }
          : s
      );
      const sub_plan_total = updatedSubs.reduce((acc, s) => acc + (s.plan_netto || 0), 0) || 1;
      const new_pos_pct = updatedSubs.reduce((acc, s) => acc + (s.plan_netto || 0) * (s.miesiac_pct || 0), 0) / sub_plan_total;
      const new_prev_pct = updatedSubs.reduce((acc, s) => acc + (s.plan_netto || 0) * (s.prev_pct || 0), 0) / sub_plan_total;
      // Zapisz tez % pozycji (zeby alokacje O/P/Q dalej dzialaly)
      try {
        await api.post(`/budget/positions/${posRow.id}/progress`, { year, month, progress_pct: Math.round(new_pos_pct * 100) / 100 });
      } catch (e) {
        // Nie blokujemy - subpozycja juz zapisana
      }
      // Optymistyczna aktualizacja
      setData((d) => {
        if (!d) return d;
        const newRows = d.rows.map((row) => {
          if (row.type === 'line' && row.id === posRow.id) {
            const narast_pct = Math.min(100, new_prev_pct + new_pos_pct);
            return {
              ...row, subrows: updatedSubs, sub_has_progress: true,
              miesiac_pct: new_pos_pct,
              miesiac_val: Math.round(row.plan_netto * new_pos_pct / 100 * 100) / 100,
              prev_pct: new_prev_pct,
              prev_val: Math.round(row.plan_netto * new_prev_pct / 100 * 100) / 100,
              narast_pct, narast_val: Math.round(row.plan_netto * narast_pct / 100 * 100) / 100,
            };
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

  const toggleExpand = (posId) => {
    setExpandedPos((prev) => {
      const n = new Set(prev);
      if (n.has(posId)) n.delete(posId); else n.add(posId);
      return n;
    });
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
              const hasSubs = (row.subrows || []).length > 0;
              const isExpanded = expandedPos.has(row.id);
              const subLocked = row.sub_has_progress;  // gdy True - % pozycji wyliczane z subrows
              return (
                <React.Fragment key={row.id}>
                <tr className="hover:bg-[#0B1120]/40" data-testid={`progress-row-${row.id}`}>
                  <td className="border border-[#2A3B59] p-1.5 text-center text-[#CBD5E1] tabular-nums">{row.lp}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-left text-white">
                    {hasSubs && (
                      <button type="button" onClick={() => toggleExpand(row.id)}
                        className="mr-1.5 text-[#D4AF37] hover:text-[#FCE99A] text-xs"
                        data-testid={`progress-expand-${row.id}`}
                        title={isExpanded ? 'Zwiń podpozycje' : `Rozwiń ${row.subrows.length} podpozycji`}>
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    )}
                    {row.name}
                    {hasSubs && (
                      <span className="ml-2 text-[10px] text-[#94A3B8]">({row.subrows.length} podpoz.)</span>
                    )}
                  </td>
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
                    {subLocked ? (
                      <div className="text-[#D4AF37] text-right text-xs font-bold px-1.5 py-1.5"
                           title="% wyliczone automatycznie ze średniej ważonej podpozycji">
                        {(row.miesiac_pct || 0).toFixed(2)}% 🔒
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={inputVal}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          onBlur={async (e) => {
                            await saveCell(row.id, row.miesiac_pct || 0, row.prev_pct || 0, row.plan_netto, e.target.value);
                            setEdits((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
                          }}
                          className="w-full bg-transparent text-[#D4AF37] text-right text-xs font-bold pl-1.5 pr-5 py-1.5 outline-none focus:bg-[#0B1120] no-spinner"
                          data-testid={`progress-input-${row.id}`}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#D4AF37] text-xs font-bold pointer-events-none">%</span>
                      </div>
                    )}
                  </td>
                </tr>
                {/* iter95h: subrows - rozwijane R/M/S z wlasnym % */}
                {isExpanded && (row.subrows || []).map((sub) => {
                  const subEditedVal = edits[`sub:${sub.id}`];
                  const subInputVal = subEditedVal !== undefined ? subEditedVal : (sub.miesiac_pct || 0);
                  const subTypeColor = sub.type === 'labor' ? '#9DBC85' : sub.type === 'equipment' ? '#D4AF37' : '#CBD5E1';
                  return (
                    <tr key={sub.id} className="bg-[#0B1120]/30 text-[11px]" data-testid={`progress-subrow-${sub.id}`}>
                      <td className="border border-[#2A3B59] p-1 text-center text-[#64748B]">↳</td>
                      <td className="border border-[#2A3B59] p-1 pl-8 text-left">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded mr-1" style={{ backgroundColor: '#2A3B59', color: subTypeColor }}>
                          {sub.type_label || sub.type}
                        </span>
                        <span className="text-[#CBD5E1]">{sub.name}</span>
                      </td>
                      <td className="border border-[#2A3B59] p-1" colSpan={3}></td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(sub.plan_netto)}</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#5F7552] tabular-nums">{fmtPLN(sub.narast_val)}</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#5F7552] tabular-nums">{(sub.narast_pct || 0).toFixed(2)}%</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#94A3B8] tabular-nums">{fmtPLN(sub.prev_val)}</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#94A3B8] tabular-nums">{(sub.prev_pct || 0).toFixed(2)}%</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#D4AF37] tabular-nums">{fmtPLN(sub.miesiac_val)}</td>
                      <td className="border border-[#2A3B59] p-0 text-right" style={{ backgroundColor: '#0B1830' }}>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={subInputVal}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [`sub:${sub.id}`]: e.target.value }))}
                            onBlur={async (e) => {
                              await saveSubCell(row, sub.id, e.target.value);
                              setEdits((prev) => { const n = { ...prev }; delete n[`sub:${sub.id}`]; return n; });
                            }}
                            className="w-full bg-transparent text-[#D4AF37] text-right text-xs font-bold pl-1.5 pr-5 py-1 outline-none focus:bg-[#0B1120] no-spinner"
                            data-testid={`progress-sub-input-${sub.id}`}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#D4AF37] text-xs font-bold pointer-events-none">%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </React.Fragment>
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
                <th className="text-left p-2">Planowany koniec</th>
                <th className="text-left p-2">Faktyczny koniec</th>
                <th className="text-right p-2">Dni</th>
                <th className="text-right p-2">% wyk.</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const days = Math.ceil((new Date(t.end_date) - new Date(t.start_date)) / (1000 * 60 * 60 * 24)) + 1;
                const isAuto = t.progress_source === 'auto';
                const finishedEarly = t.actual_end_date && t.actual_end_date < t.end_date;
                const earlyDays = finishedEarly ? Math.ceil((new Date(t.end_date) - new Date(t.actual_end_date)) / (1000 * 60 * 60 * 24)) : 0;
                return (
                  <tr key={t.id} className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/40">
                    <td className="p-2 text-white">
                      <span className="inline-block w-3 h-3 rounded mr-2 align-middle" style={{ backgroundColor: t.color || '#D4AF37' }} />
                      {t.name}
                      {isAuto && <span className="ml-1 text-[10px] text-[#9DBC85]" title="Progres auto z protokołu">🔗</span>}
                    </td>
                    <td className="p-2 text-[#CBD5E1]">{t.start_date}</td>
                    <td className="p-2 text-[#CBD5E1]">{t.end_date}</td>
                    <td className="p-2 text-[#9DBC85]">
                      {t.actual_end_date ? (
                        <span title={finishedEarly ? `Wcześniej o ${earlyDays} dni` : ''}>
                          {t.actual_end_date}{finishedEarly && <span className="ml-1">⚡</span>}
                        </span>
                      ) : <span className="text-[#64748B]">—</span>}
                    </td>
                    <td className="p-2 text-right text-[#94A3B8] tabular-nums">{days}</td>
                    <td className="p-2 text-right text-[#D4AF37] tabular-nums">{(t.progress_pct || 0).toFixed(1)}%</td>
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
    position_id: editTask?.position_id || '',
    actual_end_date: editTask?.actual_end_date || '',
  });
  const [saving, setSaving] = useState(false);
  const [positions, setPositions] = useState([]);

  // iter95i: pobierz pozycje budzetu do dropdown
  useEffect(() => {
    if (!budowaId) return;
    api.get(`/budget/${budowaId}/template`).then((r) => {
      const allPos = [];
      (r.data?.stages || []).forEach((s) => {
        (s.positions || []).forEach((p) => allPos.push({ id: p.id, name: `${s.name} → ${p.name}` }));
      });
      setPositions(allPos);
    }).catch(() => setPositions([]));
  }, [budowaId]);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę'); return; }
    if (form.end_date < form.start_date) { toast.error('Data końca musi być po dacie startu'); return; }
    // iter95i: walidacja actual_end_date - musi byc <= end_date (data szybszego wykonania)
    if (form.actual_end_date && form.actual_end_date > form.end_date) {
      toast.error('Data faktycznego zakończenia musi być wcześniejsza lub równa planowanej dacie końca');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, budowa_id: budowaId, progress_pct: parseFloat(form.progress_pct) || 0 };
      // Puste stringi -> null/clear flags
      if (!payload.position_id) {
        delete payload.position_id;
        if (editTask?.position_id) payload.clear_position_id = true;
      }
      if (!payload.actual_end_date) {
        delete payload.actual_end_date;
        if (editTask?.actual_end_date) payload.clear_actual_end_date = true;
      }
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

  const isAutoProgress = !!form.position_id;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{editTask ? 'Edytuj zadanie' : 'Nowe zadanie'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs text-[#94A3B8]">Nazwa zadania *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-name" />
          </div>
          {/* iter95i: link do pozycji budzetu - auto-progres z protokolu */}
          <div>
            <label className="text-xs text-[#94A3B8] flex items-center gap-1">
              Powiąż z pozycją budżetu <span className="text-[10px] text-[#64748B]">(opcjonalnie - auto-progres z protokołu)</span>
            </label>
            <select
              value={form.position_id}
              onChange={(e) => setForm({ ...form, position_id: e.target.value })}
              className="w-full bg-[#0B1120] border border-[#2A3B59] rounded text-white text-sm p-2"
              data-testid="task-position-id"
            >
              <option value="">— brak (% wpisywane ręcznie) —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Start *</label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-start" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Planowany koniec *</label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-end" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8] flex items-center gap-1">
                % wykonania
                {isAutoProgress && <span className="text-[10px] text-[#9DBC85]">(auto z protokołu)</span>}
              </label>
              <Input type="number" min="0" max="100"
                disabled={isAutoProgress}
                value={isAutoProgress ? (editTask?.progress_pct || 0) : form.progress_pct}
                onChange={(e) => setForm({ ...form, progress_pct: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59] disabled:opacity-60"
                data-testid="task-progress" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Kolor</label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="bg-[#0B1120] border-[#2A3B59] h-9" data-testid="task-color" />
            </div>
          </div>
          {/* iter95i: data szybszego wykonania - admin only (caly Budget i tak jest admin-only) */}
          <div className="rounded p-2 border border-[#2A3B59] bg-[#0B1120]/50">
            <label className="text-xs text-[#94A3B8] flex items-center gap-1">
              🔐 Data faktycznego zakończenia <span className="text-[10px] text-[#64748B]">(tylko admin - gdy zadanie ukończono wcześniej)</span>
            </label>
            <Input type="date" value={form.actual_end_date} onChange={(e) => setForm({ ...form, actual_end_date: e.target.value })}
              max={form.end_date}
              className="bg-[#0B1120] border-[#2A3B59] mt-1"
              data-testid="task-actual-end" />
            {form.actual_end_date && form.end_date && form.actual_end_date < form.end_date && (
              <div className="text-[10px] text-[#9DBC85] mt-1">
                ✓ Wykonane szybciej o {Math.ceil((new Date(form.end_date) - new Date(form.actual_end_date)) / (1000 * 60 * 60 * 24))} dni
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <ActionButton onAction={save} disabled={saving} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="task-save">{saving ? 'Zapisuję...' : 'Zapisz'}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Budget;
