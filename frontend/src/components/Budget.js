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

// iter95bc: subkomponenty wydzielone z Budget.js (refaktor)
import { BudgetCostingView } from './budget/BudgetCostingView';
import { BudgetExcelTemplateView } from './budget/BudgetExcelTemplateView';
import { BudgetExcelView } from './budget/BudgetExcelView';
import { BudgetLineModal } from './budget/BudgetLineModal';
import { BudgetLinesPanel } from './budget/BudgetLinesPanel';
import { BudgetNipLookup } from './budget/BudgetNipLookup';
import { CategoryStageManager } from './budget/CategoryStageManager';
import { ContractDataModal } from './budget/ContractDataModal';
import { GanttView } from './budget/GanttView';
import { GenerateScheduleModal } from './budget/GenerateScheduleModal';
import { PositionCard } from './budget/PositionCard';
import { PositionModal } from './budget/PositionModal';
import { ProgressPanel } from './budget/ProgressPanel';
import { ProtokolControls } from './budget/ProtokolControls';
import { ProtokolDownloaderInline } from './budget/ProtokolDownloaderInline';
import { SchedulePanel } from './budget/SchedulePanel';
import { ScheduleTaskModal } from './budget/ScheduleTaskModal';
import { SubpositionModal } from './budget/SubpositionModal';


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

// iter95bc: BudgetExcelTemplateView wydzielony do ./budget/BudgetExcelTemplateView.js


// iter95bc: BudgetExcelView wydzielony do ./budget/BudgetExcelView.js


// =================== TYPY BUDŻETU ===================
const BUDGET_TYPES = {
  materials: { label: 'Materiały', short: 'M', color: '#D4AF37', bg: '#D4AF37', textOnBg: '#0B1120' },
  labor:     { label: 'Robocizna', short: 'R', color: '#5F7552', bg: '#5F7552', textOnBg: '#FFFFFF' },
  equipment: { label: 'Sprzęt',    short: 'S', color: '#94A3B8', bg: '#64748B', textOnBg: '#FFFFFF' },
};

// Kolejnosc wyswietlania w widoku kosztorysowym
const TYPE_ORDER = ['labor', 'materials', 'equipment'];

// =================== WIDOK KOSZTORYSOWY (Stage > Position > R/M/S) ===================
// iter95bc: BudgetCostingView wydzielony do ./budget/BudgetCostingView.js


// Karta pojedynczej pozycji kosztorysowej z 3 slotami (R/M/S)
// iter95bc: PositionCard wydzielony do ./budget/PositionCard.js


// =================== BUDZET (POZYCJE) ===================
// iter95bc: BudgetLinesPanel wydzielony do ./budget/BudgetLinesPanel.js


// =================== PODPOZYCJA - MODAL (Robocizna / Materiał / Sprzęt) ===================
// iter95bc: SubpositionModal wydzielony do ./budget/SubpositionModal.js


// =================== POZYCJA - MODAL ===================
// iter95bc: PositionModal wydzielony do ./budget/PositionModal.js


// =================== MANAGER KATEGORII / ETAPÓW ===================
// iter95bc: CategoryStageManager wydzielony do ./budget/CategoryStageManager.js


// =================== MODAL POZYCJA ===================
// iter95bc: BudgetLineModal wydzielony do ./budget/BudgetLineModal.js


// =================== NIP LOOKUP (Biala Lista MF) ===================
// iter95bc: BudgetNipLookup wydzielony do ./budget/BudgetNipLookup.js


// =================== MODAL: UZUPELNIJ DANE DO UMOWY ===================
// iter95bc: ContractDataModal wydzielony do ./budget/ContractDataModal.js


// =================== PROTOKOL (ZAAWANSOWANIE) — widok Excel ===================
const fmtPLN = (v) => `${Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const fmtQty = (v) => Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPrice = (v) => `${Math.round(Number(v || 0)).toLocaleString('pl-PL')} zł`;

// iter95bc: ProgressPanel wydzielony do ./budget/ProgressPanel.js


// =================== KONTROLKI MIESIAC + DOWNLOAD ===================
// iter95bc: ProtokolControls wydzielony do ./budget/ProtokolControls.js


// iter95bc: ProtokolDownloaderInline wydzielony do ./budget/ProtokolDownloaderInline.js


// =================== HARMONOGRAM ===================
// iter95bc: SchedulePanel wydzielony do ./budget/SchedulePanel.js


// iter95bc: GanttView wydzielony do ./budget/GanttView.js


// iter95bc: ScheduleTaskModal wydzielony do ./budget/ScheduleTaskModal.js


// iter95bc: GenerateScheduleModal wydzielony do ./budget/GenerateScheduleModal.js


export default Budget;
