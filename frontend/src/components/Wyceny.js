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
import { Plus, Trash2, Pencil, ChevronRight, ChevronDown, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Package, Send, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../context/AuthContext';

const fmtPLN = (v) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const TYPE_LABEL = { materials: 'Materiał', labor: 'Robocizna', equipment: 'Sprzęt' };
const TYPE_COLOR = { materials: '#CBD5E1', labor: '#9DBC85', equipment: '#D4AF37' };

// iter95x: dostepne jednostki miary
const UNITS = ['', 'mb', 'm²', 'm³', 'szt', 'kg', 't', 'godz', 'dzień', 'm-c', 'kpl'];

// iter95ae: ewaluator formul typu "=100 m² × 0,24 m" -> { value: 24, unit: "m³" }
// Wspiera: + - * / ( ), nawiasy, komentarze tekstowe (pomijane), jednostki budowlane.
// Analiza wymiarowa: m × m = m², m² × m = m³, m³ / m² = m, itd.
const UNIT_DIM = {
  'm': { m: 1 }, 'cm': { m: 1, scale: 0.01 }, 'mm': { m: 1, scale: 0.001 },
  'mb': { m: 1 }, 'm²': { m: 2 }, 'm³': { m: 3 },
  'kg': { kg: 1 }, 't': { kg: 1, scale: 1000 },
  'l': { l: 1 }, 'szt': { szt: 1 }, 'kpl': { kpl: 1 }, 'godz': { godz: 1 }, 'h': { godz: 1 },
};

const dimToUnit = (dim) => {
  const keys = Object.keys(dim).filter((k) => dim[k] !== 0);
  if (keys.length === 0) return '';
  if (keys.length === 1) {
    const k = keys[0], v = dim[k];
    if (k === 'm') {
      if (v === 1) return 'm';
      if (v === 2) return 'm²';
      if (v === 3) return 'm³';
    }
    if (v === 1) return k;
  }
  return '?'; // mieszane jednostki - niejednoznaczne
};

const evalFormula = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s.startsWith('=')) return null;
  s = s.slice(1).trim();
  if (!s) return { error: 'Pusta formuła' };
  // Normalizuj
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
  // Wyciagnij jednostki przy liczbach; zapisz dimensions per liczba
  const tokens = [];   // ciag tokenow: { type: 'num', val, dim } | { type: 'op', val }
  let cleanExpr = '';
  // Regex: liczba + opcjonalna jednostka. Pozostale znaki: operatory/nawiasy/spacje/tekst.
  const re = /(\d+(?:\.\d+)?)\s*(m²|m³|cm|mm|mb|kg|l|szt|kpl|godz|t|h|m)?(?=\s|[+\-*/()]|$|[a-zA-ZąęóśłżźćńĄĘÓŚŁŻŹĆŃ])|([+\-*/()])|([a-zA-ZąęóśłżźćńĄĘÓŚŁŻŹĆŃ]+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) {
      let val = parseFloat(m[1]);
      let dim = {};
      let scale = 1;
      if (m[2]) {
        const u = m[2];
        const d = UNIT_DIM[u] || {};
        Object.keys(d).forEach((k) => { if (k !== 'scale') dim[k] = d[k]; });
        if (d.scale) scale = d.scale;
      }
      tokens.push({ type: 'num', val: val * scale, dim });
      cleanExpr += val * scale;
    } else if (m[3]) {
      tokens.push({ type: 'op', val: m[3] });
      cleanExpr += m[3];
    }
    // m[4] = tekst (komentarz) -> ignoruj
  }
  if (!cleanExpr) return { error: 'Brak liczb' };
  // Walidacja - tylko cyfry, kropka, operatory, nawiasy
  if (!/^[\d.+\-*/()\s]+$/.test(cleanExpr)) return { error: 'Niepoprawna formuła' };
  let value;
  try {
    // eslint-disable-next-line no-new-func
    value = Function('"use strict"; return (' + cleanExpr + ')')();
  } catch (e) { return { error: 'Błąd składni' }; }
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) return { error: 'Wynik niepoprawny' };
  // Analiza wymiarowa: parsujemy tokeny przy operatorach * /
  // Uproszczenie: bierzemy wszystkie '*' jako sumowanie wymiarow, '/' jako odejmowanie.
  // Dla '+' i '-' wymagamy ze obie strony maja ten sam wymiar (bierzemy lewy).
  const dim = {};
  let lastOp = '*'; // pierwsza liczba traktowana jak mnozenie z 1
  tokens.forEach((t) => {
    if (t.type === 'op') {
      lastOp = t.val;
    } else if (t.type === 'num') {
      const sign = lastOp === '/' ? -1 : 1;
      if (lastOp === '*' || lastOp === '/') {
        Object.keys(t.dim).forEach((k) => { dim[k] = (dim[k] || 0) + sign * t.dim[k]; });
      }
      // '+' i '-' nie zmieniaja wymiaru wyniku
    }
  });
  const unit = dimToUnit(dim);
  return { value: Math.round(value * 10000) / 10000, unit, error: null };
};

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
  let budzetZwolniony = 0, kosztPrognozowany = 0;
  subs.forEach((s) => {
    const r = computeSubRow(s, defaults);
    budzetZwolniony += r.budzetZwolniony;
    kosztPrognozowany += r.kosztPrognozowany;
  });
  // iter95u: ILOSC pozycji glownej jest wpisywana RECZNIE przez uzytkownika.
  // Jezeli nie wpisana - fallback do max z subs (zachowanie wsteczne).
  const manualQty = parseFloat(p.quantity);
  const qty = !isNaN(manualQty) && manualQty > 0
    ? manualQty
    : (subs.length > 0 ? Math.max(...subs.map((s) => parseFloat(s.quantity) || 0)) : 0);
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

const Th = ({ children, w, tip }) => (
  <th className="bg-[#3F5235]/80 text-white font-semibold text-[10px] uppercase tracking-wide
                  border border-[#2A3B59] px-2 py-2 text-center align-middle cursor-help"
      title={tip || undefined} style={w ? { minWidth: w } : null}>
    {children}{tip ? <span className="ml-1 text-[#D4AF37]">ⓘ</span> : null}
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


// iter95aj: dialog eksportu pelnej wyceny do PDF/XLSX z wyborem szczegolowosci
const ExportWycenaDialog = ({ wycenaId, wycenaName, onClose }) => {
  const [detail, setDetail] = useState('positions');
  const [downloading, setDownloading] = useState(false);

  const download = async (format) => {
    setDownloading(true);
    try {
      const r = await api.get(`/wyceny/${wycenaId}/export.${format}?detail=${detail}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      const safe = (wycenaName || 'wycena').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      const suffix = detail === 'client' ? 'oferta_klient' : (detail === 'full' ? 'pelna' : 'pozycje');
      a.download = `${detail === 'client' ? 'Oferta' : 'Wycena'}_${safe}_${suffix}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Pobrano ${format.toUpperCase()}`);
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setDownloading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md wyceny-no-spin"
        data-testid="export-wycena-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <FileText className="h-5 w-5" /> Eksportuj wycenę
          </DialogTitle>
          <div className="text-xs text-[#94A3B8]">Wybierz zakres szczegółowości eksportu.</div>
        </DialogHeader>
        <div className="space-y-2 my-3">
          <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${detail === 'positions' ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-[#2A3B59] hover:border-[#5F7552]'}`}>
            <input type="radio" name="detail" value="positions"
              checked={detail === 'positions'} onChange={() => setDetail('positions')}
              className="mt-0.5" data-testid="export-radio-positions" />
            <div>
              <div className="text-sm font-semibold text-white">Same pozycje główne</div>
              <div className="text-[10px] text-[#94A3B8]">
                1 wiersz na pozycję, w „Uwagi" lista zawartych podpozycji (Materiały, Robocizna, Sprzęt) — bez ilości i cen.
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${detail === 'full' ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-[#2A3B59] hover:border-[#5F7552]'}`}>
            <input type="radio" name="detail" value="full"
              checked={detail === 'full'} onChange={() => setDetail('full')}
              className="mt-0.5" data-testid="export-radio-full" />
            <div>
              <div className="text-sm font-semibold text-white">Pozycje główne + podpozycje</div>
              <div className="text-[10px] text-[#94A3B8]">
                Każda podpozycja w osobnym wierszu z ilością, ceną, narzutem, marżą, kaucjami proporcjonalnymi i budżetem.
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${detail === 'client' ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-[#2A3B59] hover:border-[#5F7552]'}`}>
            <input type="radio" name="detail" value="client"
              checked={detail === 'client'} onChange={() => setDetail('client')}
              className="mt-0.5" data-testid="export-radio-client" />
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                Wersja dla klienta
                <span className="text-[9px] bg-[#5F7552] text-white px-1.5 py-0.5 rounded uppercase">PDF</span>
              </div>
              <div className="text-[10px] text-[#94A3B8]">
                Schludny dokument z logo: nazwa pozycji, ilość, cena netto, wartość netto. <b className="text-[#9DBC85]">Bez</b> marży, narzutu, kaucji i zysku — gotowy do wysłania klientowi.
              </div>
            </div>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={onClose} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]"
            data-testid="export-close">Anuluj</Button>
          <Button onClick={() => download('pdf')} disabled={downloading}
            variant="outline" className="border-[#5F7552] text-[#9DBC85]"
            data-testid="export-pdf-btn">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => download('xlsx')} disabled={downloading || detail === 'client'}
            className="bg-[#D4AF37] hover:bg-[#FCD34D] text-[#0B1120] font-semibold disabled:opacity-40"
            data-testid="export-xlsx-btn"
            title={detail === 'client' ? 'Wersja dla klienta dostępna tylko jako PDF' : ''}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// iter95ai: dialog zestawienia materialow z eksportem PDF/XLSX + WYSYLKA EMAIL
const BomDialog = ({ wycenaId, onClose }) => {
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  // iter95ai: mail + suppliers
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  // dodawanie nowej hurtowni
  const [newSupName, setNewSupName] = useState('');
  const [newSupEmail, setNewSupEmail] = useState('');
  const [newSupBranze, setNewSupBranze] = useState('');
  // iter95ak: historia wyslanych zapytan
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const reloadHistory = useCallback(() => {
    api.get(`/wyceny/${wycenaId}/bom/history`)
      .then((r) => setHistory(r.data?.rows || []))
      .catch(() => {});
  }, [wycenaId]);

  useEffect(() => {
    api.get(`/wyceny/${wycenaId}/bom`)
      .then((r) => {
        setBom(r.data);
        // pre-fill subject + body z szablonu
        setSubject(`Zapytanie ofertowe — ${r.data?.wycena_name || ''}`);
        setBody(
          `Dzień dobry,\n\n` +
          `W załączeniu przesyłam zestawienie materiałów do wyceny: „${r.data?.wycena_name || '—'}".\n` +
          `Proszę o przygotowanie oferty cenowej (cena netto za opakowanie, termin dostawy).\n\n` +
          `Termin oferty: 7 dni.\n\n` +
          `Pozdrawiam,\nFeGrro`
        );
      })
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
    // pobierz hurtownie
    api.get('/wyceny/suppliers')
      .then((r) => setSuppliers(r.data?.rows || []))
      .catch(() => {});
    // pobierz historie wyslek
    reloadHistory();
  }, [wycenaId, reloadHistory]);

  const reloadSuppliers = () => api.get('/wyceny/suppliers').then((r) => setSuppliers(r.data?.rows || []));

  const onPickSupplier = (sid) => {
    setSupplierId(sid);
    const s = suppliers.find((x) => x.id === sid);
    if (s) setToEmail(s.email);
  };

  const addSupplier = async () => {
    if (!newSupName.trim() || !newSupEmail.trim()) {
      toast.error('Podaj nazwę i email'); return;
    }
    try {
      const r = await api.post('/wyceny/suppliers', {
        name: newSupName.trim(), email: newSupEmail.trim(),
        branze: newSupBranze.trim() || null,
      });
      await reloadSuppliers();
      setSupplierId(r.data.id);
      setToEmail(newSupEmail.trim());
      setNewSupName(''); setNewSupEmail(''); setNewSupBranze('');
      toast.success('Hurtownia dodana');
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  const sendEmail = async () => {
    if (!toEmail.trim()) { toast.error('Podaj email odbiorcy'); return; }
    setSending(true);
    try {
      const r = await api.post(`/wyceny/${wycenaId}/bom/send`, {
        to_email: toEmail.trim(),
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        supplier_id: supplierId || undefined,
      });
      toast.success(`Wysłano! (ID: ${r.data.message_id?.slice(0, 8) || 'ok'}…)`);
      setShowSendForm(false);
      reloadHistory();
    } catch (e) {
      toast.error('Błąd wysyłki: ' + (e.response?.data?.detail || e.message));
    } finally { setSending(false); }
  };

  const download = async (format) => {
    setDownloading(true);
    try {
      const r = await api.get(`/wyceny/${wycenaId}/bom.${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'xlsx' ? 'xlsx' : 'pdf';
      const safeName = (bom?.wycena_name || 'wycena').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      a.download = `BOM_${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Pobrano ${ext.toUpperCase()}`);
    } catch (e) {
      toast.error('Błąd pobierania: ' + (e.response?.data?.detail || e.message));
    } finally { setDownloading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-5xl wyceny-no-spin"
        data-testid="bom-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <Package className="h-5 w-5" /> Zapytanie ofertowe — Zestawienie materiałów
          </DialogTitle>
          <div className="text-xs text-[#94A3B8]">
            Zagregowane materiały z całej wyceny. Liczba opakowań <b className="text-[#D4AF37]">zaokrąglona w górę</b> do pełnych palet / wiaderek / rolek.
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto border border-[#2A3B59] rounded">
          {loading ? (
            <div className="text-[#94A3B8] p-4 text-center text-sm">Ładowanie...</div>
          ) : !bom?.rows || bom.rows.length === 0 ? (
            <div className="text-[#94A3B8] p-4 text-center text-sm">
              Brak materiałów w tej wycenie. Dodaj podpozycje typu „Materiał".
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#0B1120] sticky top-0">
                <tr className="text-[#94A3B8] uppercase text-[10px]">
                  <th className="text-center px-2 py-1.5 w-10">L.p.</th>
                  <th className="text-left px-2 py-1.5">Nazwa materiału</th>
                  <th className="text-right px-2 py-1.5 w-24">Ilość zużycia</th>
                  <th className="text-center px-2 py-1.5 w-16">Jedn.</th>
                  <th className="text-center px-2 py-1.5 w-24">Opakowanie</th>
                  <th className="text-center px-2 py-1.5 w-24">Wielkość opak.</th>
                  <th className="text-center px-2 py-1.5 w-24">Liczba opak. <span className="text-[#D4AF37]">▲</span></th>
                </tr>
              </thead>
              <tbody>
                {bom.rows.map((row, idx) => {
                  const showPkgQty = row.qty_in_pkg_unit != null;
                  const qty = showPkgQty ? row.qty_in_pkg_unit : row.quantity;
                  const unit = showPkgQty ? (row.pkg_unit || '') : row.unit;
                  return (
                    <tr key={idx} className="border-t border-[#2A3B59]" data-testid={`bom-row-${idx}`}>
                      <td className="px-2 py-1.5 text-center text-[#94A3B8]">{idx + 1}</td>
                      <td className="px-2 py-1.5 text-white">
                        {row.name}
                        {row.occurrences > 1 && (
                          <span className="ml-2 text-[10px] text-[#94A3B8]">({row.occurrences} pozycje)</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#9DBC85] font-semibold tabular-nums">
                        {qty.toLocaleString('pl-PL', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[#CBD5E1]">{unit || '—'}</td>
                      <td className="px-2 py-1.5 text-center text-[#CBD5E1]">{row.opakowanie || '—'}</td>
                      <td className="px-2 py-1.5 text-center text-[#94A3B8]">
                        {row.pkg_qty ? `${row.pkg_qty} ${row.pkg_unit || ''}` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold tabular-nums">
                        {row.num_packages != null ? (
                          <span className="text-[#D4AF37] text-sm">{row.num_packages}</span>
                        ) : (
                          <span className="text-[#FCA5A5] text-[10px] italic" title="Brak danych w cenniku — uzupełnij ilość w opakowaniu i normę">brak danych</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {showHistory && (
          <div className="mt-3 p-3 bg-[#0B1120] border border-[#2A3B59] rounded space-y-2"
               data-testid="bom-history-panel">
            <div className="text-[11px] text-[#9DBC85] font-semibold uppercase flex items-center gap-2">
              <Send className="h-4 w-4" /> Historia wysłanych zapytań ofertowych
              <span className="text-[10px] text-[#94A3B8] font-normal ml-auto">{history.length} {history.length === 1 ? 'wysyłka' : 'wysyłek'}</span>
            </div>
            {history.length === 0 ? (
              <div className="text-[11px] text-[#94A3B8] italic">Brak wysłanych zapytań dla tej wyceny.</div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-[#2A3B59] rounded">
                <table className="w-full text-xs">
                  <thead className="bg-[#131C2F] sticky top-0">
                    <tr className="text-[#94A3B8] uppercase text-[10px]">
                      <th className="text-left px-2 py-1.5">Data</th>
                      <th className="text-left px-2 py-1.5">Email odbiorcy</th>
                      <th className="text-left px-2 py-1.5">Temat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const d = h.sent_at ? new Date(h.sent_at) : null;
                      const dateStr = d ? d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                      const supplier = suppliers.find((s) => s.id === h.supplier_id);
                      return (
                        <tr key={h.id || i} className="border-t border-[#2A3B59]"
                            data-testid={`bom-history-row-${i}`}>
                          <td className="px-2 py-1.5 text-[#CBD5E1] tabular-nums whitespace-nowrap">{dateStr}</td>
                          <td className="px-2 py-1.5 text-[#9DBC85]">
                            {h.to_email}
                            {supplier && <span className="ml-1 text-[10px] text-[#94A3B8]">({supplier.name})</span>}
                          </td>
                          <td className="px-2 py-1.5 text-[#94A3B8] truncate max-w-md" title={h.subject}>{h.subject || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showSendForm && (
          <div className="mt-3 p-3 bg-[#0B1120] border border-[#5F7552]/60 rounded space-y-2">
            <div className="text-[11px] text-[#9DBC85] font-semibold uppercase flex items-center gap-2">
              <Mail className="h-4 w-4" /> Wyślij do hurtowni
              <span className="text-[10px] text-[#94A3B8] font-normal ml-auto">Nadawca: biuro@fegrro.pl</span>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <label className="text-[10px] text-[#94A3B8] uppercase">Hurtownia (z bazy)</label>
                <select value={supplierId} onChange={(e) => onPickSupplier(e.target.value)}
                  className="w-full bg-[#131C2F] border border-[#2A3B59] rounded h-8 text-xs text-[#CBD5E1] px-2 outline-none focus:border-[#D4AF37]"
                  data-testid="bom-supplier-select">
                  <option value="">— wybierz lub wpisz nowy email poniżej —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.email}) {s.branze ? `· ${s.branze}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-[10px] text-[#94A3B8] uppercase">Email odbiorcy</label>
                <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)}
                  placeholder="email@hurtownia.pl"
                  className="bg-[#131C2F] border-[#2A3B59] h-8 text-xs"
                  data-testid="bom-to-email" />
              </div>
              <div className="col-span-12">
                <label className="text-[10px] text-[#94A3B8] uppercase">Temat</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="bg-[#131C2F] border-[#2A3B59] h-8 text-xs"
                  data-testid="bom-subject" />
              </div>
              <div className="col-span-12">
                <label className="text-[10px] text-[#94A3B8] uppercase">Wiadomość</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
                  className="w-full bg-[#131C2F] border border-[#2A3B59] rounded p-2 text-xs text-[#CBD5E1] outline-none focus:border-[#D4AF37] resize-y"
                  data-testid="bom-body" />
              </div>
            </div>
            <div className="border-t border-[#2A3B59] pt-2 mt-2">
              <div className="text-[10px] text-[#94A3B8] uppercase mb-1">Lub dodaj nową hurtownię do bazy</div>
              <div className="grid grid-cols-12 gap-2">
                <Input value={newSupName} onChange={(e) => setNewSupName(e.target.value)} placeholder="Nazwa"
                  className="col-span-4 bg-[#131C2F] border-[#2A3B59] h-7 text-xs" data-testid="bom-new-sup-name" />
                <Input value={newSupEmail} onChange={(e) => setNewSupEmail(e.target.value)} placeholder="email@hurtownia.pl"
                  className="col-span-4 bg-[#131C2F] border-[#2A3B59] h-7 text-xs" data-testid="bom-new-sup-email" />
                <Input value={newSupBranze} onChange={(e) => setNewSupBranze(e.target.value)} placeholder="branże (opcjonalnie)"
                  className="col-span-3 bg-[#131C2F] border-[#2A3B59] h-7 text-xs" data-testid="bom-new-sup-branze" />
                <button onClick={addSupplier}
                  className="col-span-1 bg-[#5F7552] hover:bg-[#3F5235] text-white text-[10px] rounded"
                  data-testid="bom-add-sup">+ dodaj</button>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button onClick={onClose} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]"
            data-testid="bom-close">Zamknij</Button>
          <Button onClick={() => setShowHistory((v) => !v)} variant="outline"
            className={`border-[#2A3B59] ${showHistory ? 'text-[#D4AF37] border-[#D4AF37]/60' : 'text-[#CBD5E1]'}`}
            data-testid="bom-history-toggle">
            <Send className="h-4 w-4 mr-1" /> Historia{history.length > 0 ? ` (${history.length})` : ''}
          </Button>
          <Button onClick={() => download('pdf')} disabled={downloading || !bom?.rows?.length}
            variant="outline" className="border-[#5F7552] text-[#9DBC85]"
            data-testid="bom-pdf-btn">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => download('xlsx')} disabled={downloading || !bom?.rows?.length}
            variant="outline" className="border-[#5F7552] text-[#9DBC85]"
            data-testid="bom-xlsx-btn">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          {!showSendForm ? (
            <Button onClick={() => setShowSendForm(true)} disabled={!bom?.rows?.length}
              className="bg-[#D4AF37] hover:bg-[#FCD34D] text-[#0B1120] font-semibold"
              data-testid="bom-send-form-btn">
              <Mail className="h-4 w-4 mr-1" /> Wyślij do hurtowni
            </Button>
          ) : (
            <Button onClick={sendEmail} disabled={sending || !toEmail || !bom?.rows?.length}
              className="bg-[#D4AF37] hover:bg-[#FCD34D] text-[#0B1120] font-semibold"
              data-testid="bom-send-btn">
              <Send className="h-4 w-4 mr-1" /> {sending ? 'Wysyłam...' : 'Wyślij teraz'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
        <Button onClick={() => setBomOpen(true)} variant="outline"
          className="border-[#D4AF37]/60 text-[#D4AF37] hover:bg-[#D4AF37]/10"
          data-testid="wycena-bom-btn">
          <Package className="h-4 w-4 mr-1" /> Zestawienie materiałów
        </Button>
        <Button onClick={() => setExportOpen(true)} variant="outline"
          className="border-[#5F7552]/60 text-[#9DBC85] hover:bg-[#5F7552]/10"
          data-testid="wycena-export-btn">
          <FileDown className="h-4 w-4 mr-1" /> Pobierz wycenę
        </Button>
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
              return (
                <React.Fragment key={st.id}>
                  <tr className="bg-[#3F5235]/40 text-white font-semibold">
                    <td colSpan={16} className="border border-[#2A3B59] px-2 py-1.5">
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
      <Td right>
        <input type="number" step="0.01" min="0" value={edit.quantity ?? ''}
          onChange={(e) => setEdit({ ...edit, quantity: e.target.value })}
          onBlur={() => save({ quantity: edit.quantity === '' || edit.quantity == null ? null : parseFloat(edit.quantity) || 0 })}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          placeholder="wpisz"
          className="bg-[#0B1120] border border-[#5F7552]/60 rounded h-7 text-xs w-full text-right tabular-nums text-[#D4AF37] font-bold px-2 outline-none focus:border-[#D4AF37] focus:bg-[#0B1120] hover:border-[#9DBC85]"
          data-testid={`pos-qty-${position.id}`} />
      </Td>
      <Td>
        <select value={edit.unit || ''}
          onChange={(e) => { const v = e.target.value; setEdit({ ...edit, unit: v }); save({ unit: v || null }); }}
          className="bg-[#0B1120] border border-[#5F7552]/60 rounded h-7 text-xs w-full text-center text-[#CBD5E1] px-1 outline-none focus:border-[#D4AF37]"
          data-testid={`pos-unit-${position.id}`}>
          {UNITS.map((u) => <option key={u || 'empty'} value={u}>{u || '—'}</option>)}
        </select>
      </Td>
      <Td right className="text-[#94A3B8]">{row.cena ? row.cena.toFixed(2) : '—'}</Td>
      <Td right className="text-[#64748B]">—</Td>
      <Td right className="text-[#64748B]">—</Td>
      <Td right>{fmtPLN(row.kaucjaGir)}</Td>
      <Td right>{fmtPLN(row.kaucjaDw)}</Td>
      <Td right>{fmtPLN(row.kosztBudowy)}</Td>
      <Td right>{fmtPLN(row.budzet)}</Td>
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

// iter95ab: szybkie uzupelnienie 3 brakujacych pol (ilość, zapotrzebowanie, jd/jd) bez wychodzenia z pickera
const QuickFillRow = ({ item, posUnit, onSaved, onCancel }) => {
  const [pkgQty, setPkgQty] = useState(item.pkg_qty ?? '');
  const [pkgUnit, setPkgUnit] = useState(item.pkg_unit || 'kg');
  const [zap, setZap] = useState(item.zapotrzebowanie ?? '');
  const [zapUnit, setZapUnit] = useState(item.zap_unit || (posUnit ? `kg/${posUnit}` : ''));
  const [saving, setSaving] = useState(false);

  // iter95ab/ac: oblicz na zywo preview - uzyj sufiksu zap_unit (nie posUnit), bo uzytkownik moze wybrac jednostke rozna od pozycji
  const preview = computeMaterialPerWorkUnit({
    ...item,
    pkg_qty: pkgQty, zapotrzebowanie: zap, zap_unit: zapUnit,
  }, null);
  const previewMismatch = preview && posUnit && preview.workUnit !== posUnit;

  const save = async () => {
    if (!pkgQty || !zap || !zapUnit) { toast.error('Wszystkie 3 pola wymagane'); return; }
    setSaving(true);
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, {
        pkg_qty: parseFloat(pkgQty) || 0,
        pkg_unit: pkgUnit,
        zapotrzebowanie: parseFloat(zap) || 0,
        zap_unit: zapUnit,
      });
      onSaved({ ...item, pkg_qty: parseFloat(pkgQty), pkg_unit: pkgUnit, zapotrzebowanie: parseFloat(zap), zap_unit: zapUnit });
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  // iter95ac: pokaz wszystkie warianty, ale wyrozij pasujace do posUnit (uzytkownik moze chciec uzyc kg/m² nawet gdy pozycja jest m³)
  const isMatching = (u) => posUnit && u.endsWith('/' + posUnit);
  const zapUnitOptions = ZAP_UNITS;

  return (
    <tr className="bg-[#3F2F0A]/30 border-t border-[#F59E0B]/40">
      <td colSpan={4} className="px-3 py-2">
        <div className="text-[10px] text-[#F59E0B] mb-1.5 uppercase tracking-wide">
          ⚙ Uzupełnij aby przeliczyć cenę na 1 {posUnit || 'jd. wyrobu'}
        </div>
        <div className="grid grid-cols-12 gap-2 items-center">
          <label className="col-span-2 text-[10px] text-[#94A3B8]">Ilość w opak.</label>
          <input type="number" step="0.01" value={pkgQty}
            onChange={(e) => setPkgQty(e.target.value)} placeholder="np. 20"
            className="col-span-2 bg-[#0B1120] border border-[#2A3B59] rounded h-7 text-xs text-[#CBD5E1] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-pkg-qty-${item.id}`} />
          <select value={pkgUnit} onChange={(e) => setPkgUnit(e.target.value)}
            className="col-span-2 bg-[#0B1120] border border-[#2A3B59] rounded h-7 text-xs text-[#CBD5E1] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-pkg-unit-${item.id}`}>
            {PKG_UNITS.filter((u) => u).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <label className="col-span-1 text-[10px] text-[#94A3B8]">Zap.</label>
          <input type="number" step="0.01" value={zap}
            onChange={(e) => setZap(e.target.value)} placeholder="np. 0.3"
            className="col-span-2 bg-[#0B1120] border border-[#2A3B59] rounded h-7 text-xs text-[#CBD5E1] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-zap-${item.id}`} />
          <select value={zapUnit} onChange={(e) => setZapUnit(e.target.value)}
            className="col-span-3 bg-[#0B1120] border border-[#2A3B59] rounded h-7 text-xs text-[#CBD5E1] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-zap-unit-${item.id}`}>
            {zapUnitOptions.map((u) => (
              <option key={u || 'empty'} value={u}>
                {u || '—'}{isMatching(u) ? '  ★' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-[10px] text-[#94A3B8]">
            Wzór: (cena + koszty inne) × zap / ilość w opak.
            {preview && (
              <span className={`ml-2 font-semibold ${previewMismatch ? 'text-[#F59E0B]' : 'text-[#9DBC85]'}`}>
                = {fmtPLN(preview.price)} zł / 1 {preview.workUnit}
                {previewMismatch && <span className="ml-1 text-[10px]" title={`Pozycja wyceny ma jednostkę ${posUnit}, a norma jest dla ${preview.workUnit}`}>≠{posUnit}</span>}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={saving}
              className="text-[10px] text-[#94A3B8] hover:text-white px-3 py-1 border border-[#2A3B59] rounded"
              data-testid={`qf-cancel-${item.id}`}>
              Anuluj
            </button>
            <button onClick={save} disabled={saving || !preview}
              className="text-[10px] bg-[#D4AF37] text-[#0B1120] font-semibold px-3 py-1 rounded hover:bg-[#FCD34D] disabled:opacity-40"
              data-testid={`qf-save-${item.id}`}>
              {saving ? '...' : 'Zapisz i przelicz'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
};

// iter95x: modal do wyboru pozycji z cennika (per kategoria materials/labor/equipment)
// iter95z: jeśli posUnit jest podany - przelicza cenę na 1 jednostkę wyrobu (m²/m³/mb/...).
const PriceBookPicker = ({ category, posUnit = null, onPick, onClose }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editRowId, setEditRowId] = useState(null); // iter95ab: szybkie uzupelnienie danych z poziomu pickera

  const reload = useCallback(() => {
    setLoading(true);
    api.get('/wyceny/cennik', { params: { category } })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.name || '').toLowerCase().includes(s) ||
      (r.sub_category || '').toLowerCase().includes(s) ||
      (r.oferent || '').toLowerCase().includes(s) ||
      (r.wynajmujacy || '').toLowerCase().includes(s)
    );
  }, [rows, q]);

  // iter95z: oblicz "efektywna" cene + jednostke uwzgledniajaca posUnit
  // iter95ac: jezeli posUnit nie pasuje, ale material MA wlasna norme (np. kg/m²) - uzyj jej i pokaz ostrzezenie
  // Zwraca { price, unit, source } gdzie source = "computed" | "computed-mismatch" | "m2"/"m3"/"hour"/.. | "raw"
  const getEffective = (it) => {
    // MATERIALS:
    if (category === 'materials') {
      // 1. Idealnie: posUnit pasuje do zap_unit
      if (posUnit) {
        const calc = computeMaterialPerWorkUnit(it, posUnit);
        if (calc) return { price: calc.price, unit: calc.workUnit, source: 'computed' };
      }
      // 2. Material ma wlasna norme (zap_unit) ale inna niz posUnit - uzyj jej
      const ownCalc = computeMaterialPerWorkUnit(it);
      if (ownCalc) {
        const mismatch = posUnit && ownCalc.workUnit !== posUnit;
        return { price: ownCalc.price, unit: ownCalc.workUnit, source: mismatch ? 'computed-mismatch' : 'computed' };
      }
    }
    // LABOR: dobierz cene zgodna z posUnit
    if (category === 'labor') {
      if (posUnit === 'm²' && it.price_m2) return { price: it.price_m2, unit: 'm²', source: 'm2' };
      if (posUnit === 'm³' && it.price_m3) return { price: it.price_m3, unit: 'm³', source: 'm3' };
      const fallback = it.price_m2 || it.price_m3 || it.unit_price_netto || 0;
      const fbUnit = it.price_m2 ? 'm²' : it.price_m3 ? 'm³' : (it.unit || '');
      return { price: fallback, unit: fbUnit, source: 'raw' };
    }
    // EQUIPMENT: godz/dzień/m-c
    if (category === 'equipment') {
      if (posUnit === 'godz' && it.price_hour) return { price: it.price_hour, unit: 'godz', source: 'hour' };
      if (posUnit === 'dzień' && it.price_day) return { price: it.price_day, unit: 'dzień', source: 'day' };
      if (posUnit === 'm-c' && it.price_month) return { price: it.price_month, unit: 'm-c', source: 'month' };
      const fallback = it.price_hour || it.price_day || it.price_month || it.unit_price_netto || 0;
      const fbUnit = it.price_hour ? 'godz' : it.price_day ? 'dzień' : it.price_month ? 'm-c' : (it.unit || '');
      return { price: fallback, unit: fbUnit, source: 'raw' };
    }
    return { price: it.unit_price_netto || 0, unit: it.unit || '', source: 'raw' };
  };

  const getExtraInfo = (it) => {
    if (category === 'materials') {
      const parts = [];
      if (it.sub_category) parts.push(it.sub_category);
      if (it.oferent) parts.push(it.oferent);
      if (it.opakowanie && it.pkg_qty) parts.push(`${it.opakowanie} ${it.pkg_qty}${it.pkg_unit || ''}`);
      if (it.zapotrzebowanie && it.zap_unit) parts.push(`norma ${it.zapotrzebowanie} ${it.zap_unit}`);
      return parts.join(' • ');
    }
    if (category === 'labor') {
      const parts = [];
      if (it.price_m2) parts.push(`m²: ${fmtPLN(it.price_m2)}`);
      if (it.price_m3) parts.push(`m³: ${fmtPLN(it.price_m3)}`);
      return parts.join(' • ');
    }
    if (category === 'equipment') {
      const parts = [];
      if (it.wynajmujacy) parts.push(it.wynajmujacy);
      if (it.price_hour) parts.push(`h: ${fmtPLN(it.price_hour)}`);
      if (it.price_day) parts.push(`d: ${fmtPLN(it.price_day)}`);
      if (it.price_month) parts.push(`m-c: ${fmtPLN(it.price_month)}`);
      return parts.join(' • ');
    }
    return '';
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-3xl wyceny-no-spin"
        data-testid={`price-picker-${category}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <BookOpen className="h-5 w-5" /> Cennik: {TYPE_LABEL[category] || category}
            {posUnit && (
              <span className="text-xs text-[#9DBC85] font-normal">
                — auto-przelicznik na <b>1 {posUnit}</b>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-[#94A3B8]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj po nazwie, kategorii, oferencie..."
            className="bg-[#0B1120] border-[#2A3B59] flex-1"
            data-testid="picker-search" autoFocus />
        </div>
        <div className="max-h-[60vh] overflow-y-auto border border-[#2A3B59] rounded">
          {loading ? (
            <div className="text-[#94A3B8] p-4 text-center text-sm">Ładowanie...</div>
          ) : filtered.length === 0 ? (
            <div className="text-[#94A3B8] p-4 text-center text-sm">
              {rows.length === 0 ? 'Brak pozycji w cenniku. Dodaj je w zakładce „Ceny ' + (TYPE_LABEL[category] || '').toLowerCase() + '".' : 'Brak wyników.'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#0B1120] sticky top-0">
                <tr className="text-[#94A3B8] uppercase text-[10px]">
                  <th className="text-left px-2 py-1.5">Nazwa</th>
                  <th className="text-left px-2 py-1.5">Info</th>
                  <th className="text-center px-2 py-1.5">Jedn.</th>
                  <th className="text-right px-2 py-1.5">{posUnit ? `Cena / ${posUnit}` : 'Cena'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const eff = getEffective(it);
                  // iter95ab/ac: tylko gdy material nie ma ZADNEJ normy -> wymaga uzupelnienia
                  const needsCompletion = category === 'materials' && posUnit && eff.source === 'raw';
                  const mismatch = eff.source === 'computed-mismatch';
                  const isEditing = editRowId === it.id;
                  return (
                    <React.Fragment key={it.id}>
                      <tr
                        onClick={() => { if (!needsCompletion && !isEditing) onPick({ ...it, unit_price_netto: eff.price, unit: eff.unit || it.unit }); }}
                        className={`border-t border-[#2A3B59] ${needsCompletion ? 'opacity-70' : 'hover:bg-[#3F5235]/30 cursor-pointer'}`}
                        data-testid={`picker-row-${it.id}`}>
                        <td className="px-2 py-1.5 text-white">{it.name}</td>
                        <td className="px-2 py-1.5 text-[#94A3B8] text-[10px]">{getExtraInfo(it)}</td>
                        <td className="px-2 py-1.5 text-center text-[#CBD5E1]">
                          {eff.unit || '—'}
                          {mismatch && (
                            <span className="ml-1 text-[10px] text-[#F59E0B]"
                              title={`Norma w cenniku to ${eff.unit}, ale pozycja wyceny ma ${posUnit}. Cena zostanie wstawiona jako zł/${eff.unit}.`}>
                              ≠{posUnit}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {needsCompletion ? (
                            <button onClick={(e) => { e.stopPropagation(); setEditRowId(isEditing ? null : it.id); }}
                              className="text-[#F59E0B] text-[10px] underline hover:text-[#FCD34D]"
                              data-testid={`picker-fill-${it.id}`}>
                              ⚠ uzupełnij dane
                            </button>
                          ) : (
                            <>
                              <span className={eff.source === 'computed' || (posUnit && eff.unit === posUnit)
                                ? 'text-[#9DBC85] font-semibold'
                                : mismatch ? 'text-[#F59E0B] font-semibold' : 'text-[#D4AF37] font-semibold'}>
                                {fmtPLN(eff.price)}
                              </span>
                              {(eff.source === 'computed' || mismatch) && (
                                <span className="ml-1 text-[10px] text-[#94A3B8]"
                                  title={mismatch ? `Przeliczona, ale jednostka różni się od pozycji (${eff.unit} vs ${posUnit})` : 'Przeliczona z opakowania'}>⚙</span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                      {isEditing && (
                        <QuickFillRow item={it} posUnit={posUnit}
                          onSaved={(updated) => { setEditRowId(null); reload(); toast.success('Cennik zaktualizowany'); }}
                          onCancel={() => setEditRowId(null)} />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]"
            data-testid="picker-close">Anuluj</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SubRow = ({ code, sub, posComputed, defaults = {}, posUnit = null, onLocalUpdate, onDel }) => {
  const [edit, setEdit] = useState(sub);
  const [pickerOpen, setPickerOpen] = useState(false);
  // iter95ae: tekst formuly (gdy input zaczyna sie od "=")
  const [qtyInput, setQtyInput] = useState(sub.quantity_formula || (sub.quantity ?? ''));
  useEffect(() => {
    setEdit(sub);
    setQtyInput(sub.quantity_formula || (sub.quantity ?? ''));
  }, [sub]);

  const save = async (override = null) => {
    const src = override || edit;
    const payload = {
      name: src.name || '',
      quantity: parseFloat(src.quantity) || 0,
      unit: src.unit || null,
      unit_price_netto: parseFloat(src.unit_price_netto) || 0,
      narzut_zapas_pct: src.narzut_zapas_pct === '' || src.narzut_zapas_pct == null
        ? null : parseFloat(src.narzut_zapas_pct) || 0,
      marza_pct: src.marza_pct === '' || src.marza_pct == null
        ? null : parseFloat(src.marza_pct) || 0,
      quantity_formula: src.quantity_formula || null,
    };
    try {
      await api.patch(`/wyceny/lines/${sub.id}`, payload);
      onLocalUpdate(sub.id, payload);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // iter95ae: ewaluuj formule przy edycji
  const formulaPreview = useMemo(() => {
    const v = String(qtyInput || '');
    if (v.trim().startsWith('=')) return evalFormula(v);
    return null;
  }, [qtyInput]);

  const saveQty = () => {
    const v = String(qtyInput || '').trim();
    if (v.startsWith('=')) {
      const r = evalFormula(v);
      if (r && !r.error) {
        const next = {
          ...edit,
          quantity: r.value,
          quantity_formula: v,
          // jezeli formula zwrocila konkretna jednostke - ustaw ja
          unit: r.unit && r.unit !== '?' ? r.unit : edit.unit,
        };
        setEdit(next); save(next);
      } else {
        toast.error('Formuła: ' + (r?.error || 'błąd'));
      }
    } else {
      const num = parseFloat(v) || 0;
      const next = { ...edit, quantity: num, quantity_formula: null };
      setEdit(next); save(next);
    }
  };

  // iter95x: po wyborze pozycji z cennika - wypelnij nazwe, cene, jednostke (czysc formule)
  const pickFromBook = (item) => {
    const next = {
      ...edit,
      name: item.name,
      unit: item.unit || edit.unit,
      unit_price_netto: item.unit_price_netto || 0,
      quantity_formula: null,
    };
    setEdit(next);
    setQtyInput(next.quantity ?? '');
    save(next);
    setPickerOpen(false);
    toast.success(`Wybrano: ${item.name}`);
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
          onBlur={() => save()} className={`${inputCls} text-[#CBD5E1] pl-3`}
          placeholder="↳ nazwa" data-testid={`sub-name-${sub.id}`} />
      </Td>
      <Td right>
        <div className="relative">
          <input type="text" value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={saveQty}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            className={`${inputCls} text-right tabular-nums text-[#CBD5E1] ${String(qtyInput).startsWith('=') ? 'text-[#D4AF37] font-mono' : ''}`}
            title={formulaPreview && !formulaPreview.error ? `= ${formulaPreview.value} ${formulaPreview.unit || ''}` : (formulaPreview?.error || 'Wpisz liczbę lub formułę zaczynającą się od "=" np. =100 m² * 0,24 m')}
            data-testid={`sub-qty-${sub.id}`} />
          {formulaPreview && !formulaPreview.error && (
            <div className="absolute left-0 -bottom-3.5 text-[9px] text-[#9DBC85] whitespace-nowrap pointer-events-none"
              data-testid={`sub-qty-preview-${sub.id}`}>
              = {formulaPreview.value} {formulaPreview.unit || ''}
            </div>
          )}
          {formulaPreview?.error && (
            <div className="absolute left-0 -bottom-3.5 text-[9px] text-[#FCA5A5] whitespace-nowrap pointer-events-none">
              ⚠ {formulaPreview.error}
            </div>
          )}
          {!formulaPreview && sub.quantity_formula && (
            <div className="absolute left-0 -bottom-3.5 text-[9px] text-[#94A3B8] font-mono whitespace-nowrap pointer-events-none"
              title={`Formuła: ${sub.quantity_formula}`}>
              fx
            </div>
          )}
        </div>
      </Td>
      <Td>
        <select value={edit.unit || ''}
          onChange={(e) => { const v = e.target.value; const next = { ...edit, unit: v }; setEdit(next); save(next); }}
          className={`${inputCls} text-center text-[#CBD5E1]`}
          data-testid={`sub-unit-${sub.id}`}>
          {UNITS.map((u) => <option key={u || 'empty'} value={u}>{u || '—'}</option>)}
        </select>
      </Td>
      <Td right>
        <div className="flex items-center gap-1">
          <button onClick={() => setPickerOpen(true)} title="Wybierz z cennika"
            className="text-[#D4AF37] hover:text-[#FCD34D]" data-testid={`sub-book-${sub.id}`}>
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <input type="number" step="0.01" value={edit.unit_price_netto ?? ''}
            onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })}
            onBlur={() => save()} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`}
            data-testid={`sub-price-${sub.id}`} />
        </div>
        {pickerOpen && (
          <PriceBookPicker category={sub.type} posUnit={posUnit} onPick={pickFromBook} onClose={() => setPickerOpen(false)} />
        )}
      </Td>
      <Td right>
        <input type="number" step="0.1" min="0" value={edit.narzut_zapas_pct ?? ''}
          onChange={(e) => setEdit({ ...edit, narzut_zapas_pct: e.target.value })}
          onBlur={() => save()} placeholder={narzutPlaceholder}
          className={`${inputCls} text-right tabular-nums text-[#9DBC85]`}
          data-testid={`sub-narzut-${sub.id}`} />
      </Td>
      <Td right>
        <input type="number" step="0.1" min="0" value={edit.marza_pct ?? ''}
          onChange={(e) => setEdit({ ...edit, marza_pct: e.target.value })}
          onBlur={() => save()} placeholder={marzaPlaceholder}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37]`}
          data-testid={`sub-marza-${sub.id}`} />
      </Td>
      <Td right className="text-[#94A3B8]">{fmtPLN(posComputed.kaucjaGir * ratio)}</Td>
      <Td right className="text-[#94A3B8]">{fmtPLN(posComputed.kaucjaDw * ratio)}</Td>
      <Td right className="text-[#94A3B8]">{fmtPLN(posComputed.kosztBudowy * ratio)}</Td>
      <Td right className="text-white font-semibold">{fmtPLN(posComputed.budzet * ratio)}</Td>
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

const MaterialsPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // iter95ah: zwijanie kategorii + ukrywanie pustych
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [hideEmpty, setHideEmpty] = useState(true);

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
        <label className="text-[10px] text-[#94A3B8] flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)}
            data-testid="materials-hide-empty" />
          Ukryj puste kategorie
        </label>
        <div className="text-xs text-[#94A3B8]">
          {rows.length} pozycji
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
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]" title="Koszty dodatkowe doliczane do każdej jednostki (np. transport)">koszty inne do jd</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[120px]" title="Cena materiału przeliczona na 1 jednostkę wyrobu (np. zł/m² ściany). Wymaga uzupełnienia: ilość w opakowaniu, zapotrzebowanie, jd. do jd.">cena/jd. wyrobu</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[140px]">uwagi</th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {MATERIAL_SUB_CATS.map((sc) => {
                const items = grouped[sc] || [];
                if (hideEmpty && items.length === 0) return null;
                const isCollapsed = collapsed.has(sc);
                const toggle = () => {
                  setCollapsed((prev) => {
                    const n = new Set(prev);
                    if (n.has(sc)) n.delete(sc); else n.add(sc);
                    return n;
                  });
                };
                return (
                  <React.Fragment key={sc}>
                    <tr className="bg-[#131C2F]">
                      <td colSpan="13" className="p-1.5 border-b border-[#2A3B59]">
                        <button onClick={toggle}
                          className="flex items-center gap-2 text-[#D4AF37] font-semibold text-[11px] uppercase hover:text-[#FCD34D]"
                          data-testid={`mat-cat-toggle-${sc}`}>
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />}
                          📁 {sc}
                          <span className="text-[10px] text-[#94A3B8] font-normal normal-case">
                            ({items.length} {items.length === 1 ? 'pozycja' : items.length < 5 ? 'pozycje' : 'pozycji'})
                          </span>
                        </button>
                      </td>
                      <td className="p-1 border-b border-[#2A3B59] text-right">
                        <button onClick={() => addRow(sc)} className="text-[#9DBC85] hover:text-[#C8E4B5] text-[11px]"
                          title="Dodaj pozycję w kategorii" data-testid={`mat-add-${sc}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed && (items.length === 0 ? (
                      <tr><td colSpan="14" className="p-2 text-[#64748B] text-center text-[10px]">— brak pozycji —</td></tr>
                    ) : (
                      items.map((it) => (
                        <MaterialRow key={it.id} item={it} onLocalUpdate={updateLocal} onCategoryChange={fetchRows} onDel={() => remove(it.id)} />
                      ))
                    ))}
                  </React.Fragment>
                );
              })}
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
    // iter95y: gdy onBlur przekazuje event, ignoruj (uzywaj wylacznie czystego patcha)
    const safeExtra = extra && typeof extra === 'object' && !extra.nativeEvent && !extra.target ? extra : {};
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
      koszty_inne_do_jd: edit.koszty_inne_do_jd === '' || edit.koszty_inne_do_jd == null ? null : parseFloat(edit.koszty_inne_do_jd),
      notes: edit.notes || '',
      sub_category: edit.sub_category || '',
      ...safeExtra,
    };
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      onLocalUpdate(item.id, payload);  // optimistic update parent state
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#0B1120] outline-none px-1";
  // iter95aa: podswietl pola wymagane do przelicznika (cena/jd. wyrobu)
  const calcReady = computeMaterialPerWorkUnit(edit);
  const missing = !calcReady;
  const pkgMissing = missing && (!edit.pkg_qty || parseFloat(edit.pkg_qty) <= 0);
  const zapMissing = missing && (!edit.zapotrzebowanie || parseFloat(edit.zapotrzebowanie) <= 0);
  const zapUnitMissing = missing && (!edit.zap_unit || !String(edit.zap_unit).includes('/'));
  const hintCls = "bg-[#3F2F0A]/40 ring-1 ring-[#F59E0B]/60";
  const hintTitle = "Uzupełnij aby aktywować przelicznik ceny na jd. wyrobu";

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
      <td className={`border-r border-[#2A3B59]/40 ${pkgMissing ? hintCls : ''}`} title={pkgMissing ? hintTitle : undefined}>
        <input type="number" step="0.001" value={edit.pkg_qty ?? ''}
          onChange={(e) => setEdit({ ...edit, pkg_qty: e.target.value })}
          onBlur={save} placeholder={pkgMissing ? 'wpisz' : ''}
          className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`}
          data-testid={`mat-pkg-qty-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <select value={edit.pkg_unit || ''}
          onChange={(e) => { const v = e.target.value; setEdit({ ...edit, pkg_unit: v }); save({ pkg_unit: v }); }}
          className={`${inputCls} text-[#94A3B8]`} data-testid={`mat-pkg-unit-${item.id}`}>
          {PKG_UNITS.map((u) => <option key={u || 'empty'} value={u}>{u || '—'}</option>)}
        </select>
      </td>
      <td className={`border-r border-[#2A3B59]/40 ${zapMissing ? hintCls : ''}`} title={zapMissing ? hintTitle : undefined}>
        <input type="number" step="0.001" value={edit.zapotrzebowanie ?? ''}
          onChange={(e) => setEdit({ ...edit, zapotrzebowanie: e.target.value })}
          onBlur={save} placeholder={zapMissing ? 'wpisz' : ''}
          className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`}
          data-testid={`mat-zap-${item.id}`} />
      </td>
      <td className={`border-r border-[#2A3B59]/40 ${zapUnitMissing ? hintCls : ''}`} title={zapUnitMissing ? hintTitle : undefined}>
        <select value={edit.zap_unit || ''}
          onChange={(e) => { const v = e.target.value; setEdit({ ...edit, zap_unit: v }); save({ zap_unit: v }); }}
          className={`${inputCls} text-[#94A3B8]`} data-testid={`mat-zap-unit-${item.id}`}>
          {ZAP_UNITS.map((u) => <option key={u || 'empty'} value={u}>{u || '—'}</option>)}
        </select>
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.5" value={edit.liczba_warstw ?? ''}
          onChange={(e) => setEdit({ ...edit, liczba_warstw: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.01" value={edit.koszty_inne_do_jd ?? ''}
          onChange={(e) => setEdit({ ...edit, koszty_inne_do_jd: e.target.value })}
          onBlur={save} placeholder="zł/jd"
          className={`${inputCls} text-right tabular-nums text-[#D4AF37]`}
          data-testid={`mat-koszty-inne-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 px-2 py-1 text-right tabular-nums"
          data-testid={`mat-per-work-${item.id}`}>
        {(() => {
          const r = computeMaterialPerWorkUnit(edit);
          if (!r) {
            const need = [];
            if (pkgMissing) need.push('ilość');
            if (zapMissing) need.push('zapotrzebowanie');
            if (zapUnitMissing) need.push('jd./jd.');
            const tip = need.length > 0 ? 'Brakuje: ' + need.join(', ') : hintTitle;
            return <span className="text-[#F59E0B] text-[10px] italic" title={tip}>⚠ uzupełnij</span>;
          }
          return (
            <span className="text-[#9DBC85] font-semibold" title={`${fmtPLN(r.price)} zł / 1 ${r.workUnit}`}>
              {fmtPLN(r.price)} <span className="text-[10px] text-[#94A3B8]">/ {r.workUnit}</span>
            </span>
          );
        })()}
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

export default Wyceny;
