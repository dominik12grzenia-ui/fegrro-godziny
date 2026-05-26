/**
 * Wyceny - standalone module (iter95k)
 * 4 zakladki:
 *   1. Lista wycen + edytor (wycena -> etapy -> pozycje -> podpozycje R/M/S)
 *   2. Ceny materialow
 *   3. Ceny robocizny
 *   4. Ceny sprzetu
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Plus, Trash2, Pencil, ChevronRight, ChevronDown, FileText, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../context/AuthContext';

const fmtPLN = (v) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const TYPE_LABEL = { materials: 'Materiał', labor: 'Robocizna', equipment: 'Sprzęt' };
const TYPE_COLOR = { materials: '#CBD5E1', labor: '#9DBC85', equipment: '#D4AF37' };

export const Wyceny = () => {
  const [tab, setTab] = useState('list');
  const [selectedId, setSelectedId] = useState(null);  // id otwartej wyceny

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#D4AF37]" />
            Wyceny ofertowe
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#0B1120] border border-[#2A3B59] mb-3">
            <TabsTrigger value="list" data-testid="wyceny-tab-list"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Wyceny
            </TabsTrigger>
            <TabsTrigger value="materials" data-testid="wyceny-tab-materials"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Ceny materiałów
            </TabsTrigger>
            <TabsTrigger value="labor" data-testid="wyceny-tab-labor"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Ceny robocizny
            </TabsTrigger>
            <TabsTrigger value="equipment" data-testid="wyceny-tab-equipment"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Ceny sprzętu
            </TabsTrigger>
          </TabsList>
          <TabsContent value="list">
            {selectedId ? (
              <WycenaEditor wycenaId={selectedId} onBack={() => setSelectedId(null)} />
            ) : (
              <WycenyList onOpen={(id) => setSelectedId(id)} />
            )}
          </TabsContent>
          <TabsContent value="materials">
            <MaterialsPriceBook />
          </TabsContent>
          <TabsContent value="labor">
            <LaborPriceBook />
          </TabsContent>
          <TabsContent value="equipment">
            <EquipmentPriceBook />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// =============== LISTA WYCEN ===============
const WycenyList = ({ onOpen }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    api.get('/wyceny').then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const create = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Podaj nazwę wyceny'); return; }
    try {
      const r = await api.post('/wyceny', { name });
      toast.success('Utworzono wycenę');
      setNewName(''); setCreating(false);
      fetchRows();
      onOpen(r.data.id);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`Usunąć wycenę "${name}"? Wszystkie etapy/pozycje zostaną usunięte.`)) return;
    try {
      await api.delete(`/wyceny/${id}`);
      toast.success('Usunięto');
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Nazwa nowej wyceny..." className="bg-[#0B1120] border-[#2A3B59] flex-1"
          data-testid="wyceny-new-name" />
        <Button onClick={create} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="wyceny-create-btn">
          <Plus className="h-4 w-4 mr-1" /> Utwórz wycenę
        </Button>
      </div>
      {loading ? <div className="text-[#94A3B8] text-sm">Ładuję...</div>
        : rows.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="wyceny-empty">
            Brak wycen. Wpisz nazwę i kliknij „Utwórz wycenę".
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="wyceny-list">
            <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
              <tr>
                <th className="text-left p-2">Nazwa</th>
                <th className="text-right p-2">Pozycje</th>
                <th className="text-right p-2">Suma netto</th>
                <th className="text-left p-2">Utworzono</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/40 cursor-pointer"
                    onClick={() => onOpen(w.id)} data-testid={`wycena-row-${w.id}`}>
                  <td className="p-2 text-white font-semibold">{w.name}</td>
                  <td className="p-2 text-right text-[#CBD5E1] tabular-nums">{w.lines_count || 0}</td>
                  <td className="p-2 text-right text-[#D4AF37] tabular-nums font-semibold">{fmtPLN(w.total_netto)}</td>
                  <td className="p-2 text-[#94A3B8] text-xs">{(w.created_at || '').slice(0, 10)}</td>
                  <td className="p-2 text-right">
                    <button onClick={(e) => { e.stopPropagation(); remove(w.id, w.name); }}
                      className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`wycena-del-${w.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
};

// =============== EDYTOR WYCENY (Excel-style: 13 kolumn jak budżet) ===============
// Kolumny: KOD, RODZAJ, NAZWA, ILOŚĆ, CENA, BUDŻET, KAUCJA GIR, KAUCJA DW,
//          KOSZT BUDOWY, BUDŻET ZWOLNIONY, KOSZT PROGNOZOWANY, PROGNOZY (ZYSK), AKCJE
const SUB_TYPE_LABEL = { labor: 'robocizna', materials: 'Materiał', equipment: 'Sprzęt' };
const SUB_TYPE_COLOR = { labor: '#9DBC85', materials: '#D4AF37', equipment: '#7AB3D6' };

// iter95t: narzut na zapas materialu i marza - addytywne (mnoza cene)
// Wzor: budzet_zwolniony_sub = ilosc * cena * (1 + narzut% + marza%)
//       koszt_prognozowany_sub = ilosc * cena * (1 + narzut%)   [BEZ marzy]
const computeSubRow = (sub, defaults = {}) => {
  const qty = parseFloat(sub.quantity) || 0;
  const cena = parseFloat(sub.unit_price_netto) || 0;
  const narzutPct = parseFloat(sub.narzut_zapas_pct ?? defaults.narzut ?? 0) || 0;
  const marzaPct = parseFloat(sub.marza_pct ?? defaults.marza ?? 0) || 0;
  const budzetZwolniony = qty * cena * (1 + narzutPct / 100 + marzaPct / 100);
  const kosztPrognozowany = qty * cena * (1 + narzutPct / 100);
  return { qty, cena, budzetZwolniony, kosztPrognozowany, narzutPct, marzaPct };
};

const computePosRow = (p, defaults = {}) => {
  const subs = p.slots || [];
  let qty = 0, budzetZwolniony = 0, kosztPrognozowany = 0;
  if (subs.length > 0) {
    qty = Math.max(...subs.map((s) => parseFloat(s.quantity) || 0));
    // sumy z subpozycji
    subs.forEach((s) => {
      const r = computeSubRow(s, defaults);
      budzetZwolniony += r.budzetZwolniony;
      kosztPrognozowany += r.kosztPrognozowany;
    });
  }
  // iter95r: jezeli pozycja nie ma wlasnych pct, uzyj domyslnych z wyceny
  const girPct = parseFloat(p.kaucja_gir_pct ?? defaults.gir ?? 2);
  const dwPct = parseFloat(p.kaucja_dw_pct ?? defaults.dw ?? 2);
  const kosztPct = parseFloat(p.koszt_budowy_pct ?? defaults.koszt ?? 2);
  // Kaucje i koszt budowy sa LICZONE OD BUDZETU ZWOLNIONEGO (bazowej kwoty zwolnionej)
  const kaucjaGir = budzetZwolniony * girPct / 100;
  const kaucjaDw = budzetZwolniony * dwPct / 100;
  const kosztBudowy = budzetZwolniony * kosztPct / 100;
  // BUDZET (cena koncowa) = zwolniony + wszystkie naliczenia po stronie klienta
  const budzet = budzetZwolniony + kaucjaGir + kaucjaDw + kosztBudowy;
  const cena = qty > 0 ? budzet / qty : 0;
  // Zysk prognozowany = budzet zwolniony - koszt prognozowany
  const prognozy = budzetZwolniony - kosztPrognozowany;
  // Zysk + kaucja DW (ile dostane gdy DW zostanie zwolniona)
  const zyskPlusDw = prognozy + kaucjaDw;
  return { qty, cena, budzet, kaucjaGir, kaucjaDw, kosztBudowy, budzetZwolniony, kosztPrognozowany, prognozy, zyskPlusDw };
};

const Th = ({ children, w }) => (
  <th className="bg-[#3F5235]/80 text-white font-semibold text-[10px] uppercase tracking-wide
                  border border-[#2A3B59] px-2 py-2 text-center align-middle" style={w ? { minWidth: w } : null}>
    {children}
  </th>
);

const PctInput = ({ label, testId, value, onSave }) => {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <label className="flex items-center gap-1.5 text-xs text-[#CBD5E1]">
      <span>{label}:</span>
      <input
        type="number" step="0.1" min="0" max="100"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSave(v)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        className="w-16 bg-[#0B1120] border border-[#2A3B59] rounded text-[#D4AF37] text-right tabular-nums font-bold px-1.5 py-0.5 outline-none focus:border-[#D4AF37]"
        data-testid={testId}
      />
      <span className="text-[#94A3B8]">%</span>
    </label>
  );
};

const WycenaEditor = ({ wycenaId, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsedStages, setCollapsedStages] = useState(() => new Set());
  const [collapsedPos, setCollapsedPos] = useState(() => new Set());
  const [newStageName, setNewStageName] = useState('');

  const fetchData = useCallback(() => {
    setLoading(true);
    api.get(`/wyceny/${wycenaId}/template`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [wycenaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Lokalne aktualizacje bez fetchu (utrzymanie focusu)
  const updateLineLocal = useCallback((lineId, patch) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stages: (prev.stages || []).map((st) => ({
          ...st,
          positions: (st.positions || []).map((p) => ({
            ...p,
            slots: (p.slots || []).map((s) => s.id === lineId ? { ...s, ...patch } : s),
          })),
        })),
      };
    });
  }, []);
  const updatePosLocal = useCallback((posId, patch) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stages: (prev.stages || []).map((st) => ({
          ...st,
          positions: (st.positions || []).map((p) => p.id === posId ? { ...p, ...patch } : p),
        })),
      };
    });
  }, []);

  const defaults = useMemo(() => ({
    gir: data?.wycena?.default_gir_pct ?? 2,
    dw: data?.wycena?.default_dw_pct ?? 2,
    koszt: data?.wycena?.default_koszt_pct ?? 2,
    narzut: data?.wycena?.default_narzut_pct ?? 0,
    marza: data?.wycena?.default_marza_pct ?? 0,
  }), [data]);

  const saveDefault = async (field, value) => {
    const num = value === '' ? null : parseFloat(value);
    try {
      await api.patch(`/wyceny/${wycenaId}`, { [field]: num });
      setData((prev) => prev ? { ...prev, wycena: { ...prev.wycena, [field]: num } } : prev);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const grandTotal = useMemo(() => {
    if (!data) return { qty: 0, cena: 0, budzet: 0, kaucjaGir: 0, kaucjaDw: 0, kosztBudowy: 0, budzetZwolniony: 0, kosztPrognozowany: 0, prognozy: 0, zyskPlusDw: 0 };
    let qty = 0, budzet = 0, kaucjaGir = 0, kaucjaDw = 0, kosztBudowy = 0, budzetZwolniony = 0, kosztPrognozowany = 0, prognozy = 0, zyskPlusDw = 0;
    (data.stages || []).forEach((st) => (st.positions || []).forEach((p) => {
      const r = computePosRow(p, defaults);
      qty += r.qty; budzet += r.budzet;
      kaucjaGir += r.kaucjaGir; kaucjaDw += r.kaucjaDw;
      kosztBudowy += r.kosztBudowy; budzetZwolniony += r.budzetZwolniony;
      kosztPrognozowany += r.kosztPrognozowany; prognozy += r.prognozy; zyskPlusDw += r.zyskPlusDw;
    }));
    return { qty, cena: qty > 0 ? budzet / qty : 0, budzet, kaucjaGir, kaucjaDw, kosztBudowy, budzetZwolniony, kosztPrognozowany, prognozy, zyskPlusDw };
  }, [data, defaults]);

  const addStage = async () => {
    if (!newStageName.trim()) return;
    try {
      await api.post('/wyceny/stages', { wycena_id: wycenaId, name: newStageName.trim(), order: (data?.stages?.length || 0) });
      setNewStageName(''); fetchData();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  const delStage = async (id) => {
    if (!window.confirm('Usunąć etap?')) return;
    try { await api.delete(`/wyceny/stages/${id}`); fetchData(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  const addPosition = async (stageId) => {
    const name = window.prompt('Nazwa pozycji:');
    if (!name) return;
    try {
      await api.post('/wyceny/positions', { wycena_id: wycenaId, stage_id: stageId, name, order: 0 });
      fetchData();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  const delPosition = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/positions/${id}`); fetchData(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  const addSlot = async (posId, stageId, type) => {
    try {
      await api.post('/wyceny/lines', {
        wycena_id: wycenaId, stage_id: stageId, position_id: posId,
        type, name: SUB_TYPE_LABEL[type], quantity: 0, unit_price_netto: 0, order: 0,
      });
      fetchData();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  const delSlot = async (id) => {
    if (!window.confirm('Usunąć podpozycję?')) return;
    try { await api.delete(`/wyceny/lines/${id}`); fetchData(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const toggleStage = (id) => { setCollapsedStages((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const togglePos = (id) => { setCollapsedPos((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  if (loading) return <div className="text-[#94A3B8]">Ładuję wycenę...</div>;
  if (!data) return null;
  const w = data.wycena;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button onClick={onBack} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]" data-testid="wycena-back-btn">
          <ArrowLeft className="h-4 w-4 mr-1" /> Lista wycen
        </Button>
        <div className="flex-1">
          <div className="text-white text-lg font-semibold">{w.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[#94A3B8] uppercase">Budżet wyceny</div>
          <div className="text-[#D4AF37] text-xl font-bold tabular-nums" data-testid="wycena-total">
            {fmtPLN(grandTotal.budzet)} zł
          </div>
        </div>
      </div>

      {/* iter95r: panel domyslnych % dla calej wyceny */}
      <div className="border border-[#5F7552]/40 bg-[#3F5235]/15 rounded p-3 flex items-center gap-4 flex-wrap"
           data-testid="wycena-defaults-panel">
        <div className="text-[#9DBC85] text-xs uppercase font-semibold">⚙ Domyślne stawki dla całej wyceny:</div>
        <PctInput label="Kaucja GIR" testId="default-gir" value={defaults.gir}
          onSave={(v) => saveDefault('default_gir_pct', v)} />
        <PctInput label="Kaucja DW" testId="default-dw" value={defaults.dw}
          onSave={(v) => saveDefault('default_dw_pct', v)} />
        <PctInput label="Koszt budowy" testId="default-koszt" value={defaults.koszt}
          onSave={(v) => saveDefault('default_koszt_pct', v)} />
        <PctInput label="Narzut na zapas" testId="default-narzut" value={defaults.narzut}
          onSave={(v) => saveDefault('default_narzut_pct', v)} />
        <PctInput label="Marża materiał" testId="default-marza" value={defaults.marza}
          onSave={(v) => saveDefault('default_marza_pct', v)} />
        <div className="text-[10px] text-[#94A3B8] flex-1 text-right">
          Stosowane do wszystkich pozycji które nie mają własnych wartości
        </div>
      </div>

      <div className="overflow-x-auto border border-[#2A3B59] rounded">
        <table className="w-full text-xs border-collapse" data-testid="wycena-excel-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <Th w="60">KOD</Th>
              <Th w="110">RODZAJ</Th>
              <Th w="240">NAZWA</Th>
              <Th w="80">ILOŚĆ</Th>
              <Th w="70">CENA</Th>
              <Th w="80">NARZUT %</Th>
              <Th w="80">MARŻA %</Th>
              <Th w="100">BUDŻET</Th>
              <Th w="90">KAUCJA GIR</Th>
              <Th w="90">KAUCJA DW</Th>
              <Th w="100">KOSZT BUDOWY</Th>
              <Th w="110">BUDŻET ZWOLNIONY</Th>
              <Th w="110">KOSZT PROGNOZOWANY</Th>
              <Th w="100">ZYSK PROGNOZOWANY</Th>
              <Th w="110">ZYSK + KAUCJA DW</Th>
              <Th w="70">AKCJE</Th>
            </tr>
            <tr className="bg-[#0B1120] text-[#D4AF37] font-bold">
              <td className="border border-[#2A3B59] px-2 py-2 text-center">Σ SUMA</td>
              <td className="border border-[#2A3B59] px-2 py-2"></td>
              <td className="border border-[#2A3B59] px-2 py-2 text-[#CBD5E1]">Wszystkie pozycje wyceny</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-center tabular-nums">{grandTotal.qty || '—'}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-center tabular-nums text-[#94A3B8]">{grandTotal.cena ? grandTotal.cena.toFixed(0) : '—'}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-[#94A3B8] text-center">—</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-[#94A3B8] text-center">—</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.budzet)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.kaucjaGir)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.kaucjaDw)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.kosztBudowy)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums font-bold">{fmtPLN(grandTotal.budzetZwolniony)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.kosztPrognozowany)}</td>
              <td className={`border border-[#2A3B59] px-2 py-2 text-right tabular-nums font-bold ${grandTotal.prognozy >= 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}`}>{fmtPLN(grandTotal.prognozy)}</td>
              <td className={`border border-[#2A3B59] px-2 py-2 text-right tabular-nums font-bold ${grandTotal.zyskPlusDw >= 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}`}>{fmtPLN(grandTotal.zyskPlusDw)}</td>
              <td className="border border-[#2A3B59] px-2 py-2"></td>
            </tr>
          </thead>
          <tbody>
            {(data.stages || []).map((st, sIdx) => {
              const stCollapsed = collapsedStages.has(st.id);
              return (
                <React.Fragment key={st.id}>
                  <tr className="bg-[#3F5235]/40 text-white font-semibold">
                    <td colSpan={15} className="border border-[#2A3B59] px-2 py-1.5">
                      <button onClick={() => toggleStage(st.id)} className="mr-2 text-[#D4AF37]" data-testid={`stage-toggle-${st.id}`}>
                        {stCollapsed ? '▶' : '▼'}
                      </button>
                      📁 ETAP {sIdx + 1}: {st.name.toUpperCase()}
                      <button onClick={() => addPosition(st.id)} className="ml-3 text-[10px] text-[#9DBC85] border border-[#5F7552] px-1.5 py-0.5 rounded hover:bg-[#5F7552]/30" data-testid={`pos-add-${st.id}`}>
                        + Pozycja
                      </button>
                    </td>
                    <td className="border border-[#2A3B59] px-2 py-1.5 text-right">
                      <button onClick={() => delStage(st.id)} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`stage-del-${st.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {!stCollapsed && (st.positions || []).map((p, pIdx) => {
                    const code = `${sIdx + 1}0${pIdx + 1}`;
                    const r = computePosRow(p, defaults);
                    const posCollapsed = collapsedPos.has(p.id);
                    return (
                      <React.Fragment key={p.id}>
                        <PosRow code={code} position={p} row={r} collapsed={posCollapsed}
                          onToggle={() => togglePos(p.id)}
                          onLocalUpdate={updatePosLocal}
                          onDel={() => delPosition(p.id)} />
                        {!posCollapsed && (p.slots || []).map((sub, subIdx) => (
                          <SubRow key={sub.id} code={`${code}.${subIdx + 1}`} sub={sub}
                            posComputed={r} defaults={defaults}
                            onLocalUpdate={updateLineLocal}
                            onDel={() => delSlot(sub.id)} />
                        ))}
                        {!posCollapsed && (
                          <tr className="bg-[#0B1120]/40">
                            <td colSpan={16} className="border border-[#2A3B59] px-2 py-1">
                              <div className="flex gap-2 items-center pl-12">
                                <span className="text-[10px] text-[#64748B]">+ Dodaj podpozycję:</span>
                                <button onClick={() => addSlot(p.id, st.id, 'labor')} className="text-[10px] text-[#9DBC85] border border-[#5F7552] px-2 py-0.5 rounded hover:bg-[#5F7552]/30" data-testid={`add-sub-lab-${p.id}`}>+ Robocizna</button>
                                <button onClick={() => addSlot(p.id, st.id, 'materials')} className="text-[10px] text-[#D4AF37] border border-[#D4AF37]/40 px-2 py-0.5 rounded hover:bg-[#D4AF37]/10" data-testid={`add-sub-mat-${p.id}`}>+ Materiał</button>
                                <button onClick={() => addSlot(p.id, st.id, 'equipment')} className="text-[10px] text-[#7AB3D6] border border-[#7AB3D6]/40 px-2 py-0.5 rounded hover:bg-[#7AB3D6]/10" data-testid={`add-sub-equ-${p.id}`}>+ Sprzęt</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-[#2A3B59]">
        <Input value={newStageName} onChange={(e) => setNewStageName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStage()}
          placeholder="Nazwa nowego etapu..." className="bg-[#0B1120] border-[#2A3B59]"
          data-testid="stage-new-name" />
        <Button onClick={addStage} variant="outline" className="border-[#5F7552] text-[#9DBC85]" data-testid="stage-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj etap
        </Button>
      </div>
    </div>
  );
};

const Td = ({ children, right = false, className = '' }) => (
  <td className={`border border-[#2A3B59] px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className}`}>
    {children}
  </td>
);

const PosRow = ({ code, position, row, collapsed, onToggle, onLocalUpdate, onDel }) => {
  const [edit, setEdit] = useState(position);
  useEffect(() => { setEdit(position); }, [position]);

  const save = async (patch) => {
    try {
      await api.patch(`/wyceny/positions/${position.id}`, patch);
      onLocalUpdate(position.id, patch);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-6 text-xs w-full focus:bg-[#0B1120] outline-none";

  return (
    <tr className="bg-[#19243C] text-white font-semibold" data-testid={`pos-row-${position.id}`}>
      <Td>
        <button onClick={onToggle} className="text-[#D4AF37] mr-1 text-[10px]" data-testid={`pos-toggle-${position.id}`}>
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="tabular-nums">{code}</span>
      </Td>
      <Td><span className="text-[#D4AF37] text-[11px]">Pozycja Główna</span></Td>
      <Td>
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={() => save({ name: edit.name })} className={`${inputCls} text-white font-semibold`}
          data-testid={`pos-name-${position.id}`} />
      </Td>
      <Td right>{row.qty ? row.qty.toFixed(1) : '—'}</Td>
      <Td right className="text-[#94A3B8]">{row.cena ? row.cena.toFixed(0) : '—'}</Td>
      <Td right className="text-[#64748B]">—</Td>
      <Td right className="text-[#64748B]">—</Td>
      <Td right>{fmtPLN(row.budzet)}</Td>
      <Td right>{fmtPLN(row.kaucjaGir)}</Td>
      <Td right>{fmtPLN(row.kaucjaDw)}</Td>
      <Td right>{fmtPLN(row.kosztBudowy)}</Td>
      <Td right className="font-bold">{fmtPLN(row.budzetZwolniony)}</Td>
      <Td right className="text-[#D4AF37] tabular-nums" data-testid={`pos-koszt-progn-${position.id}`}>
        {fmtPLN(row.kosztPrognozowany)}
      </Td>
      <Td right className={row.prognozy >= 0 ? 'text-[#9DBC85] font-semibold' : 'text-[#FCA5A5] font-semibold'}
          data-testid={`pos-zysk-${position.id}`}>
        {fmtPLN(row.prognozy)}
      </Td>
      <Td right className={row.zyskPlusDw >= 0 ? 'text-[#9DBC85] font-semibold' : 'text-[#FCA5A5] font-semibold'}
          data-testid={`pos-zysk-dw-${position.id}`}>
        {fmtPLN(row.zyskPlusDw)}
      </Td>
      <Td right>
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`pos-del-${position.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Td>
    </tr>
  );
};

const SubRow = ({ code, sub, posComputed, defaults = {}, onLocalUpdate, onDel }) => {
  const [edit, setEdit] = useState(sub);
  useEffect(() => { setEdit(sub); }, [sub]);

  const save = async () => {
    const payload = {
      name: edit.name || '',
      quantity: parseFloat(edit.quantity) || 0,
      unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
      narzut_zapas_pct: edit.narzut_zapas_pct === '' || edit.narzut_zapas_pct == null
        ? null : parseFloat(edit.narzut_zapas_pct) || 0,
      marza_pct: edit.marza_pct === '' || edit.marza_pct == null
        ? null : parseFloat(edit.marza_pct) || 0,
    };
    try {
      await api.patch(`/wyceny/lines/${sub.id}`, payload);
      onLocalUpdate(sub.id, payload);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const r = computeSubRow(edit, defaults);
  // Proporcjonalne kaucje/koszty w stosunku do zwolnionego sub-pozycji
  const ratio = posComputed.budzetZwolniony > 0 ? r.budzetZwolniony / posComputed.budzetZwolniony : 0;
  const inputCls = "bg-transparent border-0 h-6 text-xs w-full focus:bg-[#0B1120] outline-none";
  // placeholdery pokazuja domysla z poziomu wyceny
  const narzutPlaceholder = (defaults.narzut ?? 0) ? String(defaults.narzut) : '0';
  const marzaPlaceholder = (defaults.marza ?? 0) ? String(defaults.marza) : '0';

  return (
    <tr className="bg-[#0B1120]/30" data-testid={`sub-row-${sub.id}`}>
      <Td className="text-[#94A3B8]">{code}</Td>
      <Td>
        <span className="text-[10px]" style={{ color: SUB_TYPE_COLOR[sub.type] }}>{SUB_TYPE_LABEL[sub.type]}</span>
      </Td>
      <Td>
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save} className={`${inputCls} text-[#CBD5E1] pl-3`}
          placeholder="↳ nazwa" data-testid={`sub-name-${sub.id}`} />
      </Td>
      <Td right>
        <input type="number" step="0.01" value={edit.quantity ?? ''}
          onChange={(e) => setEdit({ ...edit, quantity: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`}
          data-testid={`sub-qty-${sub.id}`} />
      </Td>
      <Td right>
        <input type="number" step="0.01" value={edit.unit_price_netto ?? ''}
          onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`}
          data-testid={`sub-price-${sub.id}`} />
      </Td>
      <Td right>
        <input type="number" step="0.1" min="0" value={edit.narzut_zapas_pct ?? ''}
          onChange={(e) => setEdit({ ...edit, narzut_zapas_pct: e.target.value })}
          onBlur={save} placeholder={narzutPlaceholder}
          className={`${inputCls} text-right tabular-nums text-[#9DBC85]`}
          data-testid={`sub-narzut-${sub.id}`} />
      </Td>
      <Td right>
        <input type="number" step="0.1" min="0" value={edit.marza_pct ?? ''}
          onChange={(e) => setEdit({ ...edit, marza_pct: e.target.value })}
          onBlur={save} placeholder={marzaPlaceholder}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37]`}
          data-testid={`sub-marza-${sub.id}`} />
      </Td>
      <Td right className="text-white font-semibold">{fmtPLN(posComputed.budzet * ratio)}</Td>
      <Td right className="text-[#94A3B8]">{fmtPLN(posComputed.kaucjaGir * ratio)}</Td>
      <Td right className="text-[#94A3B8]">{fmtPLN(posComputed.kaucjaDw * ratio)}</Td>
      <Td right className="text-[#94A3B8]">{fmtPLN(posComputed.kosztBudowy * ratio)}</Td>
      <Td right className="text-[#CBD5E1]">{fmtPLN(r.budzetZwolniony)}</Td>
      <Td right className="text-[#94A3B8]">{fmtPLN(r.kosztPrognozowany)}</Td>
      <Td right className={(r.budzetZwolniony - r.kosztPrognozowany) >= 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>
        {fmtPLN(r.budzetZwolniony - r.kosztPrognozowany)}
      </Td>
      <Td right className={((r.budzetZwolniony - r.kosztPrognozowany) + posComputed.kaucjaDw * ratio) >= 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>
        {fmtPLN((r.budzetZwolniony - r.kosztPrognozowany) + posComputed.kaucjaDw * ratio)}
      </Td>
      <Td right>
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`sub-del-${sub.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </Td>
    </tr>
  );
};

// =============== PRICE BOOK (MATERIALS - Excel-style) ===============
const MATERIAL_SUB_CATS = ['izolacje', 'betony', 'stal', 'murowane', 'drobnica', 'pozostałe'];

const MaterialsPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'materials' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja wiersza bez fetchRows (zachowuje focus + brak migotania)
  const updateLocal = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = async (subCategory) => {
    try {
      await api.post('/wyceny/cennik', {
        category: 'materials', sub_category: subCategory, name: '',
        unit_price_netto: 0,
      });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // Grupuj po sub_category - zachowaj zdefiniowana kolejnosc
  const grouped = useMemo(() => {
    const g = {};
    MATERIAL_SUB_CATS.forEach((c) => { g[c] = []; });
    rows.forEach((r) => {
      const sc = (r.sub_category || 'pozostałe').toLowerCase();
      const key = MATERIAL_SUB_CATS.includes(sc) ? sc : 'pozostałe';
      g[key].push(r);
    });
    return g;
  }, [rows]);

  return (
    <div className="space-y-2" data-testid="materials-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj produktu..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="materials-search" />
        <div className="text-xs text-[#94A3B8]">
          {rows.length} pozycji · 11 kolumn (kategoria · nazwa produktu · cena · oferent · opakowanie · ilość · jd · zapotrzebowanie · jd. do jd. · warstw · uwagi)
        </div>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div> : (
        <div className="overflow-x-auto border border-[#2A3B59] rounded">
          <table className="w-full text-xs" data-testid="materials-table">
            <thead className="bg-[#0B1120] text-[#94A3B8] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[100px]">kategoria</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[160px]">nazwa produktu</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[100px]">cena oferty</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[120px]">oferent</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[100px]">opakowanie</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[70px]">ilość</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[60px]">jd</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">zapotrzebowanie</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[90px]">jd. do jd.</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[90px]">warstw</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[140px]">uwagi</th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {MATERIAL_SUB_CATS.map((sc) => (
                <React.Fragment key={sc}>
                  <tr className="bg-[#131C2F]">
                    <td colSpan="11" className="p-1.5 border-b border-[#2A3B59] text-[#D4AF37] font-semibold text-[11px] uppercase">
                      📁 {sc}
                    </td>
                    <td className="p-1 border-b border-[#2A3B59] text-right">
                      <button onClick={() => addRow(sc)} className="text-[#9DBC85] hover:text-[#C8E4B5] text-[11px]"
                        title="Dodaj pozycję w kategorii" data-testid={`mat-add-${sc}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {(grouped[sc] || []).length === 0 ? (
                    <tr><td colSpan="12" className="p-2 text-[#64748B] text-center text-[10px]">— brak pozycji —</td></tr>
                  ) : (
                    grouped[sc].map((it) => (
                      <MaterialRow key={it.id} item={it} onLocalUpdate={updateLocal} onCategoryChange={fetchRows} onDel={() => remove(it.id)} />
                    ))
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const MaterialRow = ({ item, onLocalUpdate, onCategoryChange, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  // iter95p: zapis bez triggera fetch - aktualizuje tylko lokalnie (zachowuje focus)
  const save = async (extra = {}) => {
    const payload = {
      name: edit.name || '',
      unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
      oferent: edit.oferent || '',
      opakowanie: edit.opakowanie || '',
      pkg_qty: edit.pkg_qty === '' || edit.pkg_qty == null ? null : parseFloat(edit.pkg_qty),
      pkg_unit: edit.pkg_unit || '',
      zapotrzebowanie: edit.zapotrzebowanie === '' || edit.zapotrzebowanie == null ? null : parseFloat(edit.zapotrzebowanie),
      zap_unit: edit.zap_unit || '',
      liczba_warstw: edit.liczba_warstw === '' || edit.liczba_warstw == null ? null : parseFloat(edit.liczba_warstw),
      notes: edit.notes || '',
      sub_category: edit.sub_category || '',
      ...extra,
    };
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      onLocalUpdate(item.id, payload);  // optimistic update parent state
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#0B1120] outline-none px-1";

  return (
    <tr className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/30" data-testid={`mat-row-${item.id}`}>
      <td className="border-r border-[#2A3B59]/40">
        <select value={edit.sub_category || ''}
          onChange={(e) => { setEdit({ ...edit, sub_category: e.target.value }); save({ sub_category: e.target.value }).then(onCategoryChange); }}
          className={`${inputCls} text-[#CBD5E1]`}>
          {MATERIAL_SUB_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save} className={`${inputCls} text-white`} data-testid={`mat-name-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.01" value={edit.unit_price_netto ?? ''}
          onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right text-[#D4AF37] tabular-nums`} data-testid={`mat-price-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.oferent || ''} onChange={(e) => setEdit({ ...edit, oferent: e.target.value })}
          onBlur={save} className={`${inputCls} text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.opakowanie || ''} onChange={(e) => setEdit({ ...edit, opakowanie: e.target.value })}
          onBlur={save} placeholder="wiaderko/paleta..."
          className={`${inputCls} text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.001" value={edit.pkg_qty ?? ''}
          onChange={(e) => setEdit({ ...edit, pkg_qty: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.pkg_unit || ''} onChange={(e) => setEdit({ ...edit, pkg_unit: e.target.value })}
          onBlur={save} placeholder="kg/m2..." className={`${inputCls} text-[#94A3B8]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.001" value={edit.zapotrzebowanie ?? ''}
          onChange={(e) => setEdit({ ...edit, zapotrzebowanie: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.zap_unit || ''} onChange={(e) => setEdit({ ...edit, zap_unit: e.target.value })}
          onBlur={save} placeholder="kg/m2..." className={`${inputCls} text-[#94A3B8]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.5" value={edit.liczba_warstw ?? ''}
          onChange={(e) => setEdit({ ...edit, liczba_warstw: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
          onBlur={save} className={`${inputCls} text-[#94A3B8]`} />
      </td>
      <td className="text-right pr-1">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`mat-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

// =============== PRICE BOOK (LABOR - Excel-style: m2/m3 + historia) ===============
const fmtPrice = (v) => v == null || v === '' ? '—' : new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const LaborPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'labor' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja bez fetchRows (zachowuje focus)
  const updateLocal = useCallback((id, patch, fullDoc = null) => {
    setRows((prev) => prev.map((r) => r.id === id ? (fullDoc || { ...r, ...patch }) : r));
  }, []);

  // iter95p: po zmianie ceny refetch tylko TEGO wiersza (zeby zaktualizowac price_history)
  const refetchOne = useCallback(async (id) => {
    try {
      const r = await api.get('/wyceny/cennik', { params: { category: 'labor' } });
      const fresh = (r.data?.rows || []).find((x) => x.id === id);
      if (fresh) updateLocal(id, {}, fresh);
    } catch (_e) { /* ignore */ }
  }, [updateLocal]);

  const addRow = async () => {
    try {
      await api.post('/wyceny/cennik', { category: 'labor', name: '' });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-2" data-testid="labor-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy robocizny..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="labor-search" />
        <Button onClick={addRow} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="labor-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
        <div className="text-xs text-[#94A3B8]">{rows.length} pozycji</div>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div> : rows.length === 0 ? (
        <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="labor-empty">
          Brak pozycji. Kliknij „Dodaj pozycję".
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#2A3B59] rounded">
          <table className="w-full text-xs" data-testid="labor-table">
            <thead className="bg-[#0B1120] text-[#94A3B8] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[260px]">nazwa robocizny</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[120px]">cena za m²</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[120px]">cena za m³</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[280px]">
                  Wartości historyczne po zmianach (historia)
                </th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <LaborRow key={it.id} item={it} onLocalUpdate={updateLocal} onPriceChange={refetchOne} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const LaborRow = ({ item, onLocalUpdate, onPriceChange, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  const save = async () => {
    const payload = {
      name: edit.name || '',
      price_m2: edit.price_m2 === '' || edit.price_m2 == null ? null : parseFloat(edit.price_m2),
      price_m3: edit.price_m3 === '' || edit.price_m3 == null ? null : parseFloat(edit.price_m3),
    };
    // iter95p: czy zmienila sie cena? jezeli tak - refetch (zeby zaktualizowac price_history)
    const priceChanged = (item.price_m2 !== payload.price_m2) || (item.price_m3 !== payload.price_m3);
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      if (priceChanged) {
        await onPriceChange(item.id);
      } else {
        onLocalUpdate(item.id, payload);
      }
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#0B1120] outline-none px-1";
  const history = item.price_history || [];

  return (
    <tr className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/30 align-top" data-testid={`labor-row-${item.id}`}>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save}
          placeholder="np. tynkowanie ścian, malowanie..."
          className={`${inputCls} text-white`} data-testid={`labor-name-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m2 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m2: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m2-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m3 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m3: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m3-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        {history.length === 0 ? (
          <span className="text-[10px] text-[#64748B]">— brak zmian —</span>
        ) : (
          <div className="space-y-0.5 max-h-32 overflow-y-auto" data-testid={`labor-history-${item.id}`}>
            {history.slice().reverse().map((h, i) => (
              <div key={i} className="text-[10px] flex gap-1.5 items-baseline">
                <span className="text-[#64748B] tabular-nums">{(h.date || '').slice(0, 10)}</span>
                <span className="text-[#94A3B8]">
                  {h.field === 'price_m2' ? 'm²' : h.field === 'price_m3' ? 'm³' : h.field}:
                </span>
                <span className="text-[#FCA5A5] tabular-nums line-through">{fmtPrice(h.old)}</span>
                <span className="text-[#64748B]">→</span>
                <span className="text-[#9DBC85] tabular-nums font-semibold">{fmtPrice(h.new)}</span>
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="text-right pr-1 pt-1">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`labor-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

// =============== PRICE BOOK (EQUIPMENT - Excel-style: 3 ceny + wynajmujący + koszty poboczne) ===============
const EquipmentPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'equipment' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja bez fetchRows
  const updateLocal = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = async () => {
    try {
      await api.post('/wyceny/cennik', { category: 'equipment', name: '' });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-2" data-testid="equipment-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy sprzętu..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="equipment-search" />
        <Button onClick={addRow} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="equipment-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
        <div className="text-xs text-[#94A3B8]">{rows.length} pozycji</div>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div> : rows.length === 0 ? (
        <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="equipment-empty">
          Brak pozycji. Kliknij „Dodaj pozycję".
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#2A3B59] rounded">
          <table className="w-full text-xs" data-testid="equipment-table">
            <thead className="bg-[#0B1120] text-[#94A3B8] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[200px]">nazwa sprzętu</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">koszt za godzinę</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">koszt za dzień</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">koszt za miesiąc</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[160px]">wynajmujący</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[100px]">koszty poboczne</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[200px]">opis kosztów pobocznych</th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <EquipmentRow key={it.id} item={it} onLocalUpdate={updateLocal} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
          <div className="bg-[#0B1120]/50 text-[10px] text-[#64748B] p-2 border-t border-[#2A3B59]">
            ℹ Koszty poboczne są doliczane do każdej jednostki rozliczeniowej (godzina/dzień/miesiąc). Opis pozwala wyjaśnić co wchodzi w skład tej dopłaty (np. transport, paliwo, operator).
          </div>
        </div>
      )}
    </div>
  );
};

const EquipmentRow = ({ item, onLocalUpdate, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  const save = async () => {
    const payload = {
      name: edit.name || '',
      price_hour: edit.price_hour === '' || edit.price_hour == null ? null : parseFloat(edit.price_hour),
      price_day: edit.price_day === '' || edit.price_day == null ? null : parseFloat(edit.price_day),
      price_month: edit.price_month === '' || edit.price_month == null ? null : parseFloat(edit.price_month),
      wynajmujacy: edit.wynajmujacy || '',
      extra_cost: edit.extra_cost === '' || edit.extra_cost == null ? null : parseFloat(edit.extra_cost),
      extra_cost_desc: edit.extra_cost_desc || '',
    };
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      onLocalUpdate(item.id, payload);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#0B1120] outline-none px-1";

  return (
    <tr className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/30" data-testid={`equipment-row-${item.id}`}>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save}
          placeholder="np. zagęszczarka, młot udarowy..."
          className={`${inputCls} text-white`} data-testid={`equipment-name-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_hour ?? ''}
          onChange={(e) => setEdit({ ...edit, price_hour: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-hour-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_day ?? ''}
          onChange={(e) => setEdit({ ...edit, price_day: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-day-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_month ?? ''}
          onChange={(e) => setEdit({ ...edit, price_month: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-month-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.wynajmujacy || ''} onChange={(e) => setEdit({ ...edit, wynajmujacy: e.target.value })}
          onBlur={save}
          placeholder="np. Ramirent, własny..."
          className={`${inputCls} text-[#CBD5E1]`} data-testid={`equipment-wyn-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.extra_cost ?? ''}
          onChange={(e) => setEdit({ ...edit, extra_cost: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#FCA5A5]`}
          data-testid={`equipment-extra-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.extra_cost_desc || ''} onChange={(e) => setEdit({ ...edit, extra_cost_desc: e.target.value })}
          onBlur={save}
          placeholder="np. transport, paliwo..."
          className={`${inputCls} text-[#94A3B8]`} data-testid={`equipment-extra-desc-${item.id}`} />
      </td>
      <td className="text-right pr-1">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`equipment-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

// =============== PRICE BOOK (LABOR / EQUIPMENT - simple) ===============
const PriceBook = ({ category }) => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [category, search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję cennika?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-3" data-testid={`pricebook-${category}`}>
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="pricebook-search" />
        <Button onClick={() => setAdding(true)} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="pricebook-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div>
        : rows.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center">Brak pozycji w cenniku.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
              <tr>
                <th className="text-left p-2">Nazwa</th>
                <th className="text-left p-2">J.m.</th>
                <th className="text-right p-2">Cena netto (zł)</th>
                <th className="text-left p-2">Notatki</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <PriceBookRow key={it.id} item={it} onChange={fetchRows} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
        )}
      {adding && (
        <PriceBookAddModal category={category} onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); fetchRows(); }} />
      )}
    </div>
  );
};

const PriceBookRow = ({ item, onChange, onDel }) => {
  const [edit, setEdit] = useState({ name: item.name, unit: item.unit || '', unit_price_netto: item.unit_price_netto, notes: item.notes || '' });

  useEffect(() => {
    setEdit({ name: item.name, unit: item.unit || '', unit_price_netto: item.unit_price_netto, notes: item.notes || '' });
  }, [item]);

  const save = async () => {
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, {
        name: edit.name, unit: edit.unit,
        unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
        notes: edit.notes,
      });
      onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <tr className="border-b border-[#2A3B59]/40">
      <td className="p-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs" /></td>
      <td className="p-2"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs w-24" /></td>
      <td className="p-2"><Input type="number" step="0.01" value={edit.unit_price_netto}
        onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs text-right tabular-nums w-32" /></td>
      <td className="p-2"><Input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs" /></td>
      <td className="p-2 text-right">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`pricebook-del-${item.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
};

const PriceBookAddModal = ({ category, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: '', unit: '', unit_price_netto: 0, notes: '' });
  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę'); return; }
    try {
      await api.post('/wyceny/cennik', {
        category, name: form.name.trim(), unit: form.unit,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0, notes: form.notes,
      });
      toast.success('Dodano');
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="pricebook-modal">
        <DialogHeader>
          <DialogTitle>Dodaj pozycję cennika ({TYPE_LABEL[category]})</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div><label className="text-xs text-[#94A3B8]">Nazwa *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" data-testid="pricebook-modal-name" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-[#94A3B8]">J.m.</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="szt / m / kg / h..." className="bg-[#0B1120] border-[#2A3B59]" /></div>
            <div><label className="text-xs text-[#94A3B8]">Cena netto</label>
              <Input type="number" step="0.01" value={form.unit_price_netto}
                onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59]" data-testid="pricebook-modal-price" /></div>
          </div>
          <div><label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <Button onClick={save} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="pricebook-modal-save">Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PriceBookPicker = ({ category, onPick, onClose }) => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const params = { category };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params }).then((r) => setRows(r.data?.rows || [])).catch(() => setRows([]));
  }, [category, search]);
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="pricebook-picker">
        <DialogHeader>
          <DialogTitle>Wybierz z cennika ({TYPE_LABEL[category]})</DialogTitle>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..."
          className="bg-[#0B1120] border-[#2A3B59] mb-2" autoFocus />
        <div className="max-h-80 overflow-y-auto">
          {rows.length === 0 ? <div className="text-[#94A3B8] text-sm py-4 text-center">Brak. Dodaj pozycje w zakładce „Ceny..."</div>
            : rows.map((it) => (
              <button key={it.id} onClick={() => onPick(it)}
                className="block w-full text-left p-2 hover:bg-[#0B1120]/50 border-b border-[#2A3B59]/40"
                data-testid={`picker-item-${it.id}`}>
                <div className="text-[#CBD5E1] font-medium">{it.name}</div>
                <div className="text-[10px] text-[#94A3B8]">
                  {it.unit || '—'} · <span className="text-[#D4AF37]">{fmtPLN(it.unit_price_netto)} zł</span>
                </div>
              </button>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Wyceny;
