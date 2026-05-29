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
import { Plus, Trash2, Pencil, ChevronRight, ChevronDown, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../context/AuthContext';

// iter95aw: wspólne helpery i podkomponenty wydzielone do ./wyceny/
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
} from './wyceny/_shared';
import { NewWycenaDialog } from './wyceny/NewWycenaDialog';
import { ExportWycenaDialog } from './wyceny/ExportWycenaDialog';
import { ConvertToBudgetDialog } from './wyceny/ConvertToBudgetDialog';
import { SuppliersManagerDialog } from './wyceny/SuppliersManagerDialog';
import { BomDialog } from './wyceny/BomDialog';
import { NegotiationPanel } from './wyceny/NegotiationPanel';

// iter95bc: dalsze subkomponenty wydzielone z Wyceny.js (refaktor)
import { EquipmentPriceBook } from './wyceny/EquipmentPriceBook';
import { EquipmentRow } from './wyceny/EquipmentRow';
import { LaborPriceBook } from './wyceny/LaborPriceBook';
import { LaborRow } from './wyceny/LaborRow';
import { MaterialRow } from './wyceny/MaterialRow';
import { MaterialsPriceBook } from './wyceny/MaterialsPriceBook';
import { PosRow } from './wyceny/PosRow';
import { PriceBook } from './wyceny/PriceBook';
import { PriceBookAddModal } from './wyceny/PriceBookAddModal';
import { PriceBookPicker } from './wyceny/PriceBookPicker';
import { PriceBookRow } from './wyceny/PriceBookRow';
import { QuickFillRow } from './wyceny/QuickFillRow';
import { SubRow } from './wyceny/SubRow';


// iter95aw: helpery (fmtPLN, TYPE_*, UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput)
// wydzielone do ./wyceny/_shared.js (refaktor).


export const Wyceny = () => {
  const [tab, setTab] = useState('list');
  const [selectedId, setSelectedId] = useState(null);  // id otwartej wyceny

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59] wyceny-no-spin">
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

// iter95aw: NewWycenaDialog przeniesiony do ./wyceny/NewWycenaDialog.js (refaktor)


const WycenyList = ({ onOpen }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchRows = useCallback(() => {
    setLoading(true);
    api.get('/wyceny').then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

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
        <Button onClick={() => setCreating(true)} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="wyceny-create-btn">
          <Plus className="h-4 w-4 mr-1" /> Utwórz wycenę
        </Button>
      </div>
      {creating && <NewWycenaDialog onClose={() => setCreating(false)} onCreated={(id) => { fetchRows(); onOpen(id); }} />}
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
// iter95aw: SUB_TYPE_*/computeSubRow/computePosRow/Th/PctInput przeniesione do ./wyceny/_shared.js


// iter95aw: ExportWycenaDialog przeniesiony do ./wyceny/ExportWycenaDialog.js (refaktor)



// iter95aw: ConvertToBudgetDialog przeniesiony do ./wyceny/ConvertToBudgetDialog.js (refaktor)



// iter95aw: SuppliersManagerDialog przeniesiony do ./wyceny/SuppliersManagerDialog.js (refaktor)



// iter95aw: BomDialog przeniesiony do ./wyceny/BomDialog.js (refaktor)


const WycenaEditor = ({ wycenaId, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsedStages, setCollapsedStages] = useState(() => new Set());
  const [collapsedPos, setCollapsedPos] = useState(() => new Set());
  const [newStageName, setNewStageName] = useState('');
  // iter95af: dialog zestawienia materialow
  const [bomOpen, setBomOpen] = useState(false);
  // iter95aj: dialog eksportu pelnej wyceny
  const [exportOpen, setExportOpen] = useState(false);
  // iter95al: panel danych klienta (rozwijany)
  const [clientPanelOpen, setClientPanelOpen] = useState(false);
  // iter95aq: dialog zarzadzania hurtowniami
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  // iter95as: dialog konwersji wyceny do budowy/budzetu
  const [convertOpen, setConvertOpen] = useState(false);

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

  // iter95av: tryb negocjacji - lokalne mnozniki bez zapisu w bazie
  const [negotiationOn, setNegotiationOn] = useState(false);
  const [neg, setNeg] = useState({
    labor: -2,       // % zmiany ceny robocizny (-2 = obniz o 2%)
    materials: 0,
    equipment: 0,
    narzutOverride: '',  // pusty = bez zmian, inaczej nowa wartosc default narzutu
    marzaOverride: '',
  });
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [snapshots, setSnapshots] = useState([]);

  const negFactors = useMemo(() => ({
    labor: 1 + (parseFloat(neg.labor) || 0) / 100,
    materials: 1 + (parseFloat(neg.materials) || 0) / 100,
    equipment: 1 + (parseFloat(neg.equipment) || 0) / 100,
  }), [neg.labor, neg.materials, neg.equipment]);

  // Pre-fill negOverrides z wartosci defaults przy uruchomieniu trybu
  const openNegotiation = () => {
    setNeg((n) => ({
      ...n,
      narzutOverride: data?.wycena?.default_narzut_pct ?? '',
      marzaOverride: data?.wycena?.default_marza_pct ?? '',
    }));
    setNegotiationOn(true);
  };

  // Czyzn lista zmian aktywna?
  const negHasChanges =
    negFactors.labor !== 1 || negFactors.materials !== 1 || negFactors.equipment !== 1 ||
    (neg.narzutOverride !== '' && parseFloat(neg.narzutOverride) !== (data?.wycena?.default_narzut_pct ?? 0)) ||
    (neg.marzaOverride !== '' && parseFloat(neg.marzaOverride) !== (data?.wycena?.default_marza_pct ?? 0));

  const defaults = useMemo(() => {
    const base = {
      gir: data?.wycena?.default_gir_pct ?? 2,
      dw: data?.wycena?.default_dw_pct ?? 2,
      koszt: data?.wycena?.default_koszt_pct ?? 2,
      narzut: data?.wycena?.default_narzut_pct ?? 0,
      marza: data?.wycena?.default_marza_pct ?? 0,
    };
    if (negotiationOn) {
      if (neg.narzutOverride !== '') base.narzut = parseFloat(neg.narzutOverride) || 0;
      if (neg.marzaOverride !== '') base.marza = parseFloat(neg.marzaOverride) || 0;
    }
    return base;
  }, [data, negotiationOn, neg.narzutOverride, neg.marzaOverride]);

  // displayData: kopia z przemnozonymi cenami w slotach (jezeli tryb negocjacji aktywny)
  const displayData = useMemo(() => {
    if (!data || !negotiationOn) return data;
    return {
      ...data,
      stages: (data.stages || []).map((st) => ({
        ...st,
        positions: (st.positions || []).map((p) => ({
          ...p,
          slots: (p.slots || []).map((s) => ({
            ...s,
            unit_price_netto: (parseFloat(s.unit_price_netto) || 0) * (negFactors[s.type] ?? 1),
          })),
        })),
      })),
    };
  }, [data, negotiationOn, negFactors]);

  const saveDefault = async (field, value) => {
    const num = value === '' ? null : parseFloat(value);
    try {
      await api.patch(`/wyceny/${wycenaId}`, { [field]: num });
      setData((prev) => prev ? { ...prev, wycena: { ...prev.wycena, [field]: num } } : prev);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // iter95al: zapis pol tekstowych (np. dane klienta)
  const saveText = async (field, value) => {
    const v = (value ?? '').toString();
    try {
      await api.patch(`/wyceny/${wycenaId}`, { [field]: v });
      setData((prev) => prev ? { ...prev, wycena: { ...prev.wycena, [field]: v } } : prev);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // iter95av: pobierz dane firmy z Białej Listy MF po NIP
  const [gusLoading, setGusLoading] = useState(false);
  const fetchGusForClient = async () => {
    const nip = (data?.wycena?.client_nip || '').replace(/\D/g, '');
    if (nip.length !== 10) { toast.error('NIP musi zawierać 10 cyfr'); return; }
    setGusLoading(true);
    try {
      const r = await api.get(`/gus/${nip}`);
      if (r.data?.found) {
        const patch = {};
        if (r.data.name) patch.client_name = r.data.name;
        if (r.data.address) patch.client_address = r.data.address;
        await api.patch(`/wyceny/${wycenaId}`, patch);
        setData((prev) => prev ? { ...prev, wycena: { ...prev.wycena, ...patch } } : prev);
        toast.success(`Pobrano: ${r.data.name || '—'}`);
      } else {
        toast.error(r.data?.message || 'Nie znaleziono firmy o tym NIP');
      }
    } catch (e) {
      toast.error('Błąd GUS: ' + (e.response?.data?.detail || e.message));
    } finally { setGusLoading(false); }
  };

  const grandTotal = useMemo(() => {
    if (!displayData) return { qty: 0, cena: 0, budzet: 0, kaucjaGir: 0, kaucjaDw: 0, kosztBudowy: 0, budzetZwolniony: 0, kosztPrognozowany: 0, prognozy: 0, zyskPlusDw: 0 };
    let qty = 0, budzet = 0, kaucjaGir = 0, kaucjaDw = 0, kosztBudowy = 0, budzetZwolniony = 0, kosztPrognozowany = 0, prognozy = 0, zyskPlusDw = 0;
    (displayData.stages || []).forEach((st) => (st.positions || []).forEach((p) => {
      const r = computePosRow(p, defaults);
      qty += r.qty; budzet += r.budzet;
      kaucjaGir += r.kaucjaGir; kaucjaDw += r.kaucjaDw;
      kosztBudowy += r.kosztBudowy; budzetZwolniony += r.budzetZwolniony;
      kosztPrognozowany += r.kosztPrognozowany; prognozy += r.prognozy; zyskPlusDw += r.zyskPlusDw;
    }));
    return { qty, cena: qty > 0 ? budzet / qty : 0, budzet, kaucjaGir, kaucjaDw, kosztBudowy, budzetZwolniony, kosztPrognozowany, prognozy, zyskPlusDw };
  }, [displayData, defaults]);

  // iter95am/an: wskazniki kosztu na m2 PC/PUM + podzial PC na podziemie/nadziemie
  const wskazniki = useMemo(() => {
    const pc_m2 = parseFloat(displayData?.wycena?.pc_m2) || 0;
    const pum_m2 = parseFloat(displayData?.wycena?.pum_m2) || 0;
    const pc_pod_m2 = parseFloat(displayData?.wycena?.pc_podziemie_m2) || 0;
    const pc_nad_m2 = parseFloat(displayData?.wycena?.pc_nadziemie_m2) || 0;
    let sumPC = 0, sumPUM = 0, sumPCpod = 0, sumPCnad = 0;
    (displayData?.stages || []).forEach((st) => (st.positions || []).forEach((p) => {
      const r = computePosRow(p, defaults);
      if (p.include_in_pc) sumPC += r.budzet;
      if (p.include_in_pum) sumPUM += r.budzet;
      if (p.include_in_pc_podziemie) sumPCpod += r.budzet;
      if (p.include_in_pc_nadziemie) sumPCnad += r.budzet;
    }));
    return {
      pc_m2, pum_m2, pc_pod_m2, pc_nad_m2,
      sumPC, sumPUM, sumPCpod, sumPCnad,
      pcRatio: pc_m2 > 0 ? sumPC / pc_m2 : null,
      pumRatio: pum_m2 > 0 ? sumPUM / pum_m2 : null,
      pcPodRatio: pc_pod_m2 > 0 ? sumPCpod / pc_pod_m2 : null,
      pcNadRatio: pc_nad_m2 > 0 ? sumPCnad / pc_nad_m2 : null,
    };
  }, [displayData, defaults]);

  // iter95av: oryginalny grandTotal (bez negocjacji) do porownania delty
  const grandTotalOriginal = useMemo(() => {
    if (!data || !negotiationOn) return null;
    let budzet = 0, zyskPlusDw = 0;
    const baseDefaults = {
      gir: data.wycena?.default_gir_pct ?? 2,
      dw: data.wycena?.default_dw_pct ?? 2,
      koszt: data.wycena?.default_koszt_pct ?? 2,
      narzut: data.wycena?.default_narzut_pct ?? 0,
      marza: data.wycena?.default_marza_pct ?? 0,
    };
    (data.stages || []).forEach((st) => (st.positions || []).forEach((p) => {
      const r = computePosRow(p, baseDefaults);
      budzet += r.budzet;
      zyskPlusDw += r.zyskPlusDw;
    }));
    return { budzet, zyskPlusDw };
  }, [data, negotiationOn]);

  // iter95av: snapshoty - ladowanie + akcje
  const loadSnapshots = useCallback(() => {
    api.get(`/wyceny/${wycenaId}/snapshots`)
      .then((r) => setSnapshots(r.data?.rows || []))
      .catch(() => {});
  }, [wycenaId]);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const applyNegotiation = async () => {
    if (!negHasChanges) { toast.error('Brak zmian do zastosowania'); return; }
    if (!window.confirm(
      `Przyjąć negocjację na stałe?\n\n` +
      `Aktualny stan wyceny zostanie zapisany jako wersja "Przed negocjacją" — w każdej chwili możesz wrócić.\n\n` +
      `Zmiany:\n` +
      (neg.labor !== 0 ? `  • Robocizna: ${neg.labor > 0 ? '+' : ''}${neg.labor}%\n` : '') +
      (neg.materials !== 0 ? `  • Materiały: ${neg.materials > 0 ? '+' : ''}${neg.materials}%\n` : '') +
      (neg.equipment !== 0 ? `  • Sprzęt: ${neg.equipment > 0 ? '+' : ''}${neg.equipment}%\n` : '') +
      (neg.narzutOverride !== '' ? `  • Narzut materiału → ${neg.narzutOverride}%\n` : '') +
      (neg.marzaOverride !== '' ? `  • Marża materiału → ${neg.marzaOverride}%\n` : '')
    )) return;
    try {
      const body = {
        labor_factor: negFactors.labor,
        material_factor: negFactors.materials,
        equipment_factor: negFactors.equipment,
        snapshot_label: `Przed negocjacją (${new Date().toLocaleString('pl-PL')})`,
      };
      if (neg.narzutOverride !== '') body.narzut_pct = parseFloat(neg.narzutOverride);
      if (neg.marzaOverride !== '') body.marza_pct = parseFloat(neg.marzaOverride);
      const r = await api.post(`/wyceny/${wycenaId}/negotiation/apply`, body);
      toast.success(`Negocjacja przyjęta! Zapisano wersję, ${r.data.lines_modified} linii zmodyfikowano`);
      setNegotiationOn(false);
      setNeg({ labor: 0, materials: 0, equipment: 0, narzutOverride: '', marzaOverride: '' });
      fetchData();
      loadSnapshots();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  const restoreSnapshot = async (snap) => {
    if (!window.confirm(
      `Przywrócić wycenę do wersji:\n"${snap.label}"\n\n` +
      `Bieżący stan zostanie automatycznie zapisany jako kolejna wersja.`
    )) return;
    try {
      await api.post(`/wyceny/${wycenaId}/snapshots/${snap.id}/restore`);
      toast.success('Przywrócono wersję');
      setVersionsOpen(false);
      fetchData();
      loadSnapshots();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

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

  // iter95ao: bulk apply flagi PC/PC↓/PC↑/PUM na wszystkie pozycje w etapie
  const stageBulkFlag = async (stageId, flag, value) => {
    try {
      await api.post(`/wyceny/stages/${stageId}/bulk-flag`, { flag, value });
      // Lokalna aktualizacja: ustaw flage na wszystkich pozycjach tego etapu bez refetchu
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stages: (prev.stages || []).map((st) => (
            st.id === stageId
              ? { ...st, positions: (st.positions || []).map((p) => ({ ...p, [flag]: value })) }
              : st
          )),
        };
      });
      toast.success(value ? 'Zaznaczono' : 'Odznaczono');
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  const toggleStage = (id) => { setCollapsedStages((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const togglePos = (id) => { setCollapsedPos((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  if (loading) return <div className="text-[#94A3B8]">Ładuję wycenę...</div>;
  if (!data) return null;
  const w = data.wycena;

  return (
    <div className="space-y-3">
      {/* iter95az: header edytora — flex-wrap + min-w-0 na tytule, by uniknąć horyzontalnego scrolla na małych ekranach */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={onBack} variant="outline" className="border-[#2A3B59] text-[#CBD5E1] shrink-0" data-testid="wycena-back-btn">
          <ArrowLeft className="h-4 w-4 mr-1" /> Lista wycen
        </Button>
        <div className="flex-1 min-w-[160px]">
          <div className="text-white text-lg font-semibold truncate" title={w.name}>{w.name}</div>
        </div>
        <Button onClick={() => setSuppliersOpen(true)} variant="outline"
          className="border-[#5F7552]/60 text-[#9DBC85] hover:bg-[#5F7552]/10 shrink-0"
          data-testid="wycena-suppliers-btn">
          <BookOpen className="h-4 w-4 mr-1" /> Hurtownie
        </Button>
        <Button onClick={() => setBomOpen(true)} variant="outline"
          className="border-[#D4AF37]/60 text-[#D4AF37] hover:bg-[#D4AF37]/10 shrink-0"
          data-testid="wycena-bom-btn">
          <Package className="h-4 w-4 mr-1" /> Zestawienie materiałów
        </Button>
        <Button onClick={() => setExportOpen(true)} variant="outline"
          className="border-[#5F7552]/60 text-[#9DBC85] hover:bg-[#5F7552]/10 shrink-0"
          data-testid="wycena-export-btn">
          <FileDown className="h-4 w-4 mr-1" /> Pobierz wycenę
        </Button>
        <Button onClick={() => setConvertOpen(true)} variant="outline"
          className="border-[#9DBC85]/60 text-[#9DBC85] hover:bg-[#9DBC85]/10 font-semibold shrink-0"
          title="Stwórz nową budowę w module Budżet z tej wyceny"
          data-testid="wycena-convert-btn">
          <FileText className="h-4 w-4 mr-1" /> Zaciągnij do budżetu
        </Button>
        {/* iter95av: tryb negocjacji + wersje */}
        <Button onClick={negotiationOn ? () => setNegotiationOn(false) : openNegotiation} variant="outline"
          className={(negotiationOn
            ? 'border-[#F59E0B] text-[#F59E0B] bg-[#F59E0B]/10 font-semibold animate-pulse'
            : 'border-[#F59E0B]/60 text-[#F59E0B] hover:bg-[#F59E0B]/10') + ' shrink-0'}
          title="Lokalne obniżki cen z live preview — bez zapisu w bazie"
          data-testid="wycena-negotiation-btn">
          🤝 {negotiationOn ? 'Wyjdź z negocjacji' : 'Tryb negocjacji'}
        </Button>
        <Button onClick={() => setVersionsOpen(true)} variant="outline"
          className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] shrink-0"
          title="Historia wersji wyceny — przywróć poprzednią"
          data-testid="wycena-versions-btn">
          🕒 Wersje{snapshots.length > 0 ? ` (${snapshots.length})` : ''}
        </Button>
        <div className="text-right shrink-0 ml-auto">
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

      {/* iter95av/iter95aw: panel trybu negocjacji - wydzielony do ./wyceny/NegotiationPanel.js */}
      {negotiationOn && (
        <NegotiationPanel
          data={data}
          neg={neg}
          setNeg={setNeg}
          setNegotiationOn={setNegotiationOn}
          negHasChanges={negHasChanges}
          grandTotal={grandTotal}
          grandTotalOriginal={grandTotalOriginal}
          wskazniki={wskazniki}
          applyNegotiation={applyNegotiation}
        />
      )}

      {/* iter95am: panel powierzchni PC/PUM + wskazniki zl/m2 */}
      <div className="border border-[#5F7552]/40 bg-[#3F5235]/15 rounded p-3 flex items-center gap-4 flex-wrap"
           data-testid="wycena-surface-panel">
        <div className="text-[#9DBC85] text-xs uppercase font-semibold">📐 Powierzchnie budynku:</div>
        <label className="flex items-center gap-1 text-xs text-[#CBD5E1]">
          <span title="Powierzchnia Całkowita" className="font-semibold text-[#9DBC85]">PC</span>
          <input type="number" step="0.01" min="0" defaultValue={w.pc_m2 ?? ''}
            onBlur={(e) => saveDefault('pc_m2', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            placeholder="—"
            className="bg-[#0B1120] border border-[#5F7552]/60 rounded h-7 w-20 text-xs text-right tabular-nums text-white px-2 outline-none focus:border-[#D4AF37]"
            data-testid="surface-pc" />
          <span className="text-[#94A3B8]">m²</span>
        </label>
        <label className="flex items-center gap-1 text-xs text-[#CBD5E1]">
          <span title="PC Podziemie — powierzchnia kondygnacji podziemnych" className="font-semibold text-[#9DBC85]">PC↓ <span className="text-[9px] text-[#94A3B8] font-normal">podziemie</span></span>
          <input type="number" step="0.01" min="0" defaultValue={w.pc_podziemie_m2 ?? ''}
            onBlur={(e) => saveDefault('pc_podziemie_m2', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            placeholder="—"
            className="bg-[#0B1120] border border-[#5F7552]/60 rounded h-7 w-20 text-xs text-right tabular-nums text-white px-2 outline-none focus:border-[#D4AF37]"
            data-testid="surface-pc-podziemie" />
          <span className="text-[#94A3B8]">m²</span>
        </label>
        <label className="flex items-center gap-1 text-xs text-[#CBD5E1]">
          <span title="PC Nadziemie — powierzchnia kondygnacji nadziemnych" className="font-semibold text-[#9DBC85]">PC↑ <span className="text-[9px] text-[#94A3B8] font-normal">nadziemie</span></span>
          <input type="number" step="0.01" min="0" defaultValue={w.pc_nadziemie_m2 ?? ''}
            onBlur={(e) => saveDefault('pc_nadziemie_m2', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            placeholder="—"
            className="bg-[#0B1120] border border-[#5F7552]/60 rounded h-7 w-20 text-xs text-right tabular-nums text-white px-2 outline-none focus:border-[#D4AF37]"
            data-testid="surface-pc-nadziemie" />
          <span className="text-[#94A3B8]">m²</span>
        </label>
        <label className="flex items-center gap-1 text-xs text-[#CBD5E1]">
          <span title="Powierzchnia Użytkowa Mieszkalna" className="font-semibold text-[#9DBC85]">PUM</span>
          <input type="number" step="0.01" min="0" defaultValue={w.pum_m2 ?? ''}
            onBlur={(e) => saveDefault('pum_m2', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            placeholder="—"
            className="bg-[#0B1120] border border-[#5F7552]/60 rounded h-7 w-20 text-xs text-right tabular-nums text-white px-2 outline-none focus:border-[#D4AF37]"
            data-testid="surface-pum" />
          <span className="text-[#94A3B8]">m²</span>
        </label>
        <div className="text-[10px] text-[#94A3B8] flex-1 text-right">
          Zaznacz w pozycjach głównych chipy <b className="text-[#9DBC85]">PC</b> / <b className="text-[#9DBC85]">PC↓</b> / <b className="text-[#9DBC85]">PC↑</b> / <b className="text-[#9DBC85]">PUM</b> aby je wliczyć do wskaźników
        </div>
      </div>

      {(wskazniki.pcRatio != null || wskazniki.pumRatio != null || wskazniki.pcPodRatio != null || wskazniki.pcNadRatio != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="wskazniki-bar">
          {wskazniki.pcRatio != null && (
            <div className="border border-[#9DBC85]/40 bg-[#3F5235]/10 rounded p-3"
                 data-testid="wskaznik-pc">
              <div className="text-[10px] uppercase text-[#94A3B8] tracking-wider">Wskaźnik PC (zł/m²)</div>
              <div className="text-[#9DBC85] text-2xl font-bold tabular-nums">
                {fmtPLN(wskazniki.pcRatio)} <span className="text-sm text-[#94A3B8]">zł/m²</span>
              </div>
              <div className="text-[10px] text-[#64748B] tabular-nums">
                {fmtPLN(wskazniki.sumPC)} zł ÷ {wskazniki.pc_m2.toLocaleString('pl-PL')} m²
              </div>
            </div>
          )}
          {wskazniki.pcPodRatio != null && (
            <div className="border border-[#9DBC85]/40 bg-[#3F5235]/10 rounded p-3"
                 data-testid="wskaznik-pc-podziemie">
              <div className="text-[10px] uppercase text-[#94A3B8] tracking-wider">PC↓ Podziemie (zł/m²)</div>
              <div className="text-[#9DBC85] text-2xl font-bold tabular-nums">
                {fmtPLN(wskazniki.pcPodRatio)} <span className="text-sm text-[#94A3B8]">zł/m²</span>
              </div>
              <div className="text-[10px] text-[#64748B] tabular-nums">
                {fmtPLN(wskazniki.sumPCpod)} zł ÷ {wskazniki.pc_pod_m2.toLocaleString('pl-PL')} m²
              </div>
            </div>
          )}
          {wskazniki.pcNadRatio != null && (
            <div className="border border-[#9DBC85]/40 bg-[#3F5235]/10 rounded p-3"
                 data-testid="wskaznik-pc-nadziemie">
              <div className="text-[10px] uppercase text-[#94A3B8] tracking-wider">PC↑ Nadziemie (zł/m²)</div>
              <div className="text-[#9DBC85] text-2xl font-bold tabular-nums">
                {fmtPLN(wskazniki.pcNadRatio)} <span className="text-sm text-[#94A3B8]">zł/m²</span>
              </div>
              <div className="text-[10px] text-[#64748B] tabular-nums">
                {fmtPLN(wskazniki.sumPCnad)} zł ÷ {wskazniki.pc_nad_m2.toLocaleString('pl-PL')} m²
              </div>
            </div>
          )}
          {wskazniki.pumRatio != null && (
            <div className="border border-[#9DBC85]/40 bg-[#3F5235]/10 rounded p-3"
                 data-testid="wskaznik-pum">
              <div className="text-[10px] uppercase text-[#94A3B8] tracking-wider">Wskaźnik PUM (zł/m²)</div>
              <div className="text-[#9DBC85] text-2xl font-bold tabular-nums">
                {fmtPLN(wskazniki.pumRatio)} <span className="text-sm text-[#94A3B8]">zł/m²</span>
              </div>
              <div className="text-[10px] text-[#64748B] tabular-nums">
                {fmtPLN(wskazniki.sumPUM)} zł ÷ {wskazniki.pum_m2.toLocaleString('pl-PL')} m²
              </div>
            </div>
          )}
        </div>
      )}

      {/* iter95al: dane klienta dla PDF "Wersja dla klienta" */}
      <div className="border border-[#2A3B59] bg-[#0B1120]/40 rounded" data-testid="wycena-client-panel">
        <button
          type="button"
          onClick={() => setClientPanelOpen((v) => !v)}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-[#131C2F] rounded"
          data-testid="wycena-client-toggle"
        >
          {clientPanelOpen ? <ChevronDown className="h-3.5 w-3.5 text-[#9DBC85]" />
                           : <ChevronRight className="h-3.5 w-3.5 text-[#9DBC85]" />}
          <span className="text-[#9DBC85] text-xs uppercase font-semibold">👤 Dane klienta</span>
          {!clientPanelOpen && (w.client_name || w.client_nip || w.client_address) && (
            <span className="text-[10px] text-[#94A3B8] truncate">
              · {w.client_name || ''}{w.client_nip ? ` · NIP ${w.client_nip}` : ''}
            </span>
          )}
          {!clientPanelOpen && !w.client_name && !w.client_nip && !w.client_address && (
            <span className="text-[10px] text-[#94A3B8] italic">
              · uzupełnij, jeśli chcesz wygenerować PDF „Wersja dla klienta" z blokiem adresata
            </span>
          )}
        </button>
        {clientPanelOpen && (
          <div className="px-3 pb-3 grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <label className="text-[10px] text-[#94A3B8] uppercase">Nazwa firmy / klienta</label>
              <Input
                defaultValue={w.client_name || ''}
                onBlur={(e) => saveText('client_name', e.target.value)}
                placeholder="np. Jan Kowalski / ACME Sp. z o.o."
                className="bg-[#131C2F] border-[#2A3B59] h-8 text-xs text-white"
                data-testid="wycena-client-name"
              />
            </div>
            <div className="col-span-3">
              <label className="text-[10px] text-[#94A3B8] uppercase">NIP</label>
              <div className="flex items-center gap-1">
                <Input
                  key={`nip-${w.client_nip || ''}`}
                  defaultValue={w.client_nip || ''}
                  onBlur={(e) => saveText('client_nip', e.target.value)}
                  placeholder="1234567890"
                  className="bg-[#131C2F] border-[#2A3B59] h-8 text-xs text-white flex-1"
                  data-testid="wycena-client-nip"
                />
                <button
                  type="button"
                  onClick={fetchGusForClient}
                  disabled={gusLoading}
                  title="Pobierz dane firmy z Białej Listy MF (po NIP)"
                  className="text-[10px] font-bold px-2 h-8 rounded border border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/25 transition whitespace-nowrap disabled:opacity-50"
                  data-testid="wycena-client-gus-btn"
                >
                  {gusLoading ? '⏳' : '🏛 GUS'}
                </button>
              </div>
            </div>
            <div className="col-span-12">
              <label className="text-[10px] text-[#94A3B8] uppercase">Adres (wielolinijkowy)</label>
              <textarea
                defaultValue={w.client_address || ''}
                onBlur={(e) => saveText('client_address', e.target.value)}
                placeholder="ul. Przykładowa 12 / 5&#10;00-001 Warszawa"
                rows={2}
                className="w-full bg-[#131C2F] border border-[#2A3B59] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#9DBC85] resize-y"
                data-testid="wycena-client-address"
              />
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-[#2A3B59] rounded">
        <table className="w-full text-xs border-collapse" data-testid="wycena-excel-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <Th w="60" tip="Numer pozycji (auto)">KOD</Th>
              <Th w="110" tip="Typ pozycji: główna lub podpozycja (materiał / robocizna / sprzęt)">RODZAJ</Th>
              <Th w="240" tip="Nazwa pozycji lub materiału — edytowalna">NAZWA</Th>
              <Th w="80" tip="W pozycji głównej: wpisywane RĘCZNIE (kontraktowa ilość, np. m²). W podpozycjach: ilość zużytego materiału / godzin / m-go.">ILOŚĆ</Th>
              <Th w="70" tip="Jednostka miary (mb / m² / m³ / szt / kg / godz / dzień ...)">JEDN.</Th>
              <Th w="70" tip="W pozycji głównej: BUDŻET ÷ ILOŚĆ (cena za jednostkę kontraktową). W podpozycji: cena jednostkowa netto.">CENA</Th>
              <Th w="80" tip="Narzut na zapas materiału (%) — % doliczany do ceny zakupu na pokrycie strat/odpadów. Wpisywany ręcznie per podpozycja, lub z domyślnego globalnego.">NARZUT %</Th>
              <Th w="80" tip="Marża materiałowa (%) — nasz zysk procentowy. Wpisywana ręcznie per podpozycja, lub z domyślnego globalnego.">MARŻA %</Th>
              <Th w="90" tip="KAUCJA GIR = BUDŻET ZWOLNIONY × kaucja GIR % (zatrzymywana przez klienta do końca gwarancji)">KAUCJA GIR</Th>
              <Th w="90" tip="KAUCJA DW = BUDŻET ZWOLNIONY × kaucja DW % (Dobre Wykonanie — zwracana po odbiorach)">KAUCJA DW</Th>
              <Th w="100" tip="KOSZT BUDOWY = BUDŻET ZWOLNIONY × koszt budowy % (narzut na koszty ogólne budowy)">KOSZT BUDOWY</Th>
              <Th w="100" tip="BUDŻET (cena dla klienta) = BUDŻET ZWOLNIONY + KAUCJA GIR + KAUCJA DW + KOSZT BUDOWY">BUDŻET</Th>
              <Th w="110" tip="BUDŻET ZWOLNIONY = ilość × cena × (1 + narzut% + marża%) — bazowa kwota, którą faktycznie dostajemy">BUDŻET ZWOLNIONY</Th>
              <Th w="110" tip="KOSZT PROGNOZOWANY = ilość × cena × (1 + narzut%) — BEZ marży (marża to nasz zysk, nie koszt)">KOSZT PROGNOZOWANY</Th>
              <Th w="100" tip="ZYSK PROGNOZOWANY = BUDŻET ZWOLNIONY − KOSZT PROGNOZOWANY">ZYSK PROGNOZOWANY</Th>
              <Th w="110" tip="ZYSK + KAUCJA DW — ile finalnie zarobimy gdy KAUCJA DW zostanie zwolniona po odbiorach">ZYSK + KAUCJA DW</Th>
              <Th w="70">AKCJE</Th>
            </tr>
            <tr className="bg-[#0B1120] text-[#D4AF37] font-bold">
              <td className="border border-[#2A3B59] px-2 py-2 text-center">Σ SUMA</td>
              <td className="border border-[#2A3B59] px-2 py-2"></td>
              <td className="border border-[#2A3B59] px-2 py-2 text-[#CBD5E1]">Wszystkie pozycje wyceny</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-center tabular-nums">{grandTotal.qty || '—'}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-[#94A3B8] text-center">—</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-center tabular-nums text-[#94A3B8]">{grandTotal.cena ? grandTotal.cena.toFixed(0) : '—'}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-[#94A3B8] text-center">—</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-[#94A3B8] text-center">—</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.kaucjaGir)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.kaucjaDw)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.kosztBudowy)}</td>
              <td className="border border-[#2A3B59] px-2 py-2 text-right tabular-nums">{fmtPLN(grandTotal.budzet)}</td>
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
              // iter95ao: liczniki PC/PC↓/PC↑/PUM dla etapu
              const posList = st.positions || [];
              const total = posList.length;
              const cnt = {
                pc: posList.filter((p) => p.include_in_pc).length,
                pcPod: posList.filter((p) => p.include_in_pc_podziemie).length,
                pcNad: posList.filter((p) => p.include_in_pc_nadziemie).length,
                pum: posList.filter((p) => p.include_in_pum).length,
              };
              return (
                <React.Fragment key={st.id}>
                  <tr className="bg-[#3F5235]/40 text-white font-semibold">
                    <td colSpan={16} className="border border-[#2A3B59] px-2 py-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => toggleStage(st.id)} className="text-[#D4AF37]" data-testid={`stage-toggle-${st.id}`}>
                          {stCollapsed ? '▶' : '▼'}
                        </button>
                        <span>📁 ETAP {sIdx + 1}: {st.name.toUpperCase()}</span>
                        <button onClick={() => addPosition(st.id)} className="text-[10px] text-[#9DBC85] border border-[#5F7552] px-1.5 py-0.5 rounded hover:bg-[#5F7552]/30" data-testid={`pos-add-${st.id}`}>
                          + Pozycja
                        </button>
                        {/* iter95ao + iter95av: quick-apply chipy z licznikiem (flex-wrap by nie nakładało się na tytuł) */}
                        {total > 0 && (
                          <div className="flex items-center gap-1 flex-wrap ml-3 pl-3 border-l border-[#5F7552]/40 basis-full sm:basis-auto" data-testid={`stage-bulk-${st.id}`}>
                            <span className="text-[9px] text-[#94A3B8] uppercase mr-1 whitespace-nowrap">Zastosuj na etap:</span>
                            {[
                              { key: 'pc', flag: 'include_in_pc', label: 'PC', count: cnt.pc },
                              { key: 'pcPod', flag: 'include_in_pc_podziemie', label: 'PC↓', count: cnt.pcPod },
                              { key: 'pcNad', flag: 'include_in_pc_nadziemie', label: 'PC↑', count: cnt.pcNad },
                              { key: 'pum', flag: 'include_in_pum', label: 'PUM', count: cnt.pum },
                            ].map((it) => {
                              const allOn = total > 0 && it.count === total;
                              const someOn = it.count > 0 && it.count < total;
                              return (
                                <button
                                  key={it.key}
                                  type="button"
                                  onClick={() => stageBulkFlag(st.id, it.flag, !allOn)}
                                  title={
                                    allOn ? `Odznacz ${it.label} we wszystkich pozycjach etapu`
                                          : `Zaznacz ${it.label} we wszystkich pozycjach etapu (${it.count}/${total} obecnie)`
                                  }
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition whitespace-nowrap ${
                                    allOn
                                      ? 'bg-[#9DBC85] text-[#0B1120] border-[#9DBC85]'
                                      : someOn
                                        ? 'bg-[#9DBC85]/20 text-[#9DBC85] border-[#9DBC85]/60'
                                        : 'border-[#5F7552]/50 text-[#94A3B8] hover:text-[#9DBC85] hover:border-[#9DBC85]/60'
                                  }`}
                                  data-testid={`stage-bulk-${it.key}-${st.id}`}
                                >
                                  {it.label} <span className="opacity-70 font-normal">{it.count}/{total}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
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
                            posUnit={p.unit}
                            onLocalUpdate={updateLineLocal}
                            onDel={() => delSlot(sub.id)} />
                        ))}
                        {!posCollapsed && (
                          <tr className="bg-[#0B1120]/40">
                            <td colSpan={17} className="border border-[#2A3B59] px-2 py-1">
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
      {bomOpen && <BomDialog wycenaId={wycenaId} onClose={() => setBomOpen(false)} />}
      {exportOpen && <ExportWycenaDialog wycenaId={wycenaId} wycenaName={w?.name} onClose={() => setExportOpen(false)} />}
      {suppliersOpen && <SuppliersManagerDialog onClose={() => setSuppliersOpen(false)} />}
      {convertOpen && (
        <ConvertToBudgetDialog
          wycenaId={wycenaId}
          wycenaName={w?.name}
          clientName={w?.client_name}
          clientNip={w?.client_nip}
          onClose={() => setConvertOpen(false)}
        />
      )}

      {/* iter95av: dialog wersji wyceny */}
      {versionsOpen && (
        <Dialog open={true} onOpenChange={(o) => !o && setVersionsOpen(false)}>
          <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-2xl"
                         data-testid="versions-dialog">
            <DialogHeader>
              <DialogTitle className="text-[#D4AF37]">🕒 Historia wersji wyceny</DialogTitle>
              <div className="text-xs text-[#94A3B8]">
                Snapshoty tworzone automatycznie przy „Przyjmij na stałe" (negocjacja) oraz przy przywróceniu starej wersji.
              </div>
            </DialogHeader>
            <div className="max-h-[50vh] overflow-y-auto border border-[#2A3B59] rounded">
              {snapshots.length === 0 ? (
                <div className="p-4 text-center text-[#94A3B8] text-sm italic">
                  Brak zapisanych wersji. Pierwsza wersja zostanie zapisana automatycznie przy zaakceptowaniu negocjacji.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-[#0B1120] sticky top-0 text-[#94A3B8] uppercase text-[10px]">
                    <tr>
                      <th className="text-left px-3 py-2">Data utworzenia</th>
                      <th className="text-left px-3 py-2">Etykieta</th>
                      <th className="text-right px-3 py-2">Rozmiar</th>
                      <th className="text-right px-3 py-2">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => {
                      const d = new Date(s.created_at);
                      return (
                        <tr key={s.id} className="border-t border-[#2A3B59] hover:bg-[#0B1120]/60"
                            data-testid={`snapshot-row-${s.id}`}>
                          <td className="px-3 py-2 text-[#CBD5E1] tabular-nums whitespace-nowrap">
                            {d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="px-3 py-2 text-white">{s.label}</td>
                          <td className="px-3 py-2 text-right text-[10px] text-[#64748B]">
                            {s.stats?.stages || 0}E · {s.stats?.positions || 0}P · {s.stats?.lines || 0}L
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => restoreSnapshot(s)}
                              className="text-[10px] bg-[#5F7552] hover:bg-[#3F5235] text-white px-2 py-1 rounded"
                              data-testid={`snapshot-restore-${s.id}`}>
                              Przywróć
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setVersionsOpen(false)} variant="outline"
                className="border-[#2A3B59] text-[#CBD5E1]"
                data-testid="versions-close">Zamknij</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const Td = ({ children, right = false, className = '' }) => (
  <td className={`border border-[#2A3B59] px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className}`}>
    {children}
  </td>
);

// iter95bc: PosRow wydzielony do ./wyceny/PosRow.js


// iter95ab: szybkie uzupelnienie 3 brakujacych pol (ilość, zapotrzebowanie, jd/jd) bez wychodzenia z pickera
// iter95bc: QuickFillRow wydzielony do ./wyceny/QuickFillRow.js


// iter95x: modal do wyboru pozycji z cennika (per kategoria materials/labor/equipment)
// iter95z: jeśli posUnit jest podany - przelicza cenę na 1 jednostkę wyrobu (m²/m³/mb/...).
// iter95bc: PriceBookPicker wydzielony do ./wyceny/PriceBookPicker.js


// iter95bc: SubRow wydzielony do ./wyceny/SubRow.js


// =============== PRICE BOOK (MATERIALS - Excel-style) ===============
const MATERIAL_SUB_CATS = ['izolacje', 'betony', 'stal', 'murowane', 'drobnica', 'pozostałe'];

// iter95y: warianty jednostek dla cennika materialow
const PKG_UNITS = ['', 'kg', 'l', 'm²', 'm³', 'mb', 'szt', 'kpl', 't', 'rol', 'opak.'];
// jd. do jd. = norma zuzycia (np. kg na 1 m2 ulozonej posadzki)
const ZAP_UNITS = [
  '',
  'kg/m²', 'kg/m³', 'kg/mb', 'kg/szt', 'kg/kpl',
  'l/m²', 'l/m³', 'l/mb', 'l/szt',
  'm²/m²', 'm²/m³', 'm²/mb', 'm²/szt',
  'm³/m²', 'm³/m³', 'm³/mb', 'm³/szt',
  'mb/m²', 'mb/m³', 'mb/mb', 'mb/szt',
  'szt/m²', 'szt/m³', 'szt/mb', 'szt/szt', 'szt/kpl',
  't/m³',
];

// iter95z: ile kosztuje materiał na 1 jednostkę wyrobu (np. m² ściany).
// Wzór: (cena_oferty + koszty_inne) × zapotrzebowanie / pkg_qty
// Wymaga: zap_unit konczacy sie na "/" + workUnit (np. "kg/m²"), pkg_qty>0, zap>0.
// Jezeli workUnit nie podany — uzyj sufiksu zap_unit jako workUnit (np. "kg/m²" → "m²").
const computeMaterialPerWorkUnit = (it, workUnit = null) => {
  if (!it) return null;
  const zapUnit = it.zap_unit || '';
  if (!zapUnit.includes('/')) return null;
  const effectiveWorkUnit = workUnit || zapUnit.split('/')[1];
  if (!effectiveWorkUnit) return null;
  if (!zapUnit.endsWith('/' + effectiveWorkUnit)) return null;
  const pkg = parseFloat(it.pkg_qty) || 0;
  const zap = parseFloat(it.zapotrzebowanie) || 0;
  if (pkg <= 0 || zap <= 0) return null;
  const base = (parseFloat(it.unit_price_netto) || 0) + (parseFloat(it.koszty_inne_do_jd) || 0);
  return { price: base * zap / pkg, workUnit: effectiveWorkUnit };
};

// iter95bc: MaterialsPriceBook wydzielony do ./wyceny/MaterialsPriceBook.js


// iter95bc: MaterialRow wydzielony do ./wyceny/MaterialRow.js


// =============== PRICE BOOK (LABOR - Excel-style: m2/m3 + historia) ===============
const fmtPrice = (v) => v == null || v === '' ? '—' : new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// iter95bc: LaborPriceBook wydzielony do ./wyceny/LaborPriceBook.js


// iter95bc: LaborRow wydzielony do ./wyceny/LaborRow.js


// =============== PRICE BOOK (EQUIPMENT - Excel-style: 3 ceny + wynajmujący + koszty poboczne) ===============
// iter95bc: EquipmentPriceBook wydzielony do ./wyceny/EquipmentPriceBook.js


// iter95bc: EquipmentRow wydzielony do ./wyceny/EquipmentRow.js


// =============== PRICE BOOK (LABOR / EQUIPMENT - simple) ===============
// iter95bc: PriceBook wydzielony do ./wyceny/PriceBook.js


// iter95bc: PriceBookRow wydzielony do ./wyceny/PriceBookRow.js


// iter95bc: PriceBookAddModal wydzielony do ./wyceny/PriceBookAddModal.js


export default Wyceny;
