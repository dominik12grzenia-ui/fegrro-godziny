import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { ChevronDown, ChevronRight, Plus, Archive, ArchiveRestore, Trash2, Edit2, AlertTriangle, HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
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
  { id: 'rw', label: 'Rachunek wyników' },
  { id: 'sprzedaz', label: 'Sprzedaż' },
  { id: 'budowy', label: 'Budowy' },
  { id: 'zapisy', label: 'Zapisy' },
];

// Slownik kolumn tabeli "Sprzedaz per budowa" - kliknij ikonke (?) zeby zobaczyc pelny opis i wzor
const SPRZEDAZ_COL_INFO = {
  Sprzedaż: {
    title: 'Sprzedaż (PZS)',
    desc: 'Suma netto faktur sprzedażowych wystawionych dla tej budowy w wybranym okresie.',
    formula: 'SUMA(faktury sprzedażowe netto dla tej budowy)',
  },
  KP: {
    title: 'KP - Koszty Pracownikow',
    desc: 'Bezpośrednie koszty pracownikow (wynagrodzenia, ZUS, wynagrodzenia na stawkach) przypisane wprost do tej budowy.',
    formula: 'SUMA(zapisy KP gdzie budowa = ta budowa)',
  },
  'KP-alok': {
    title: 'KP-alok - Alokowane Koszty Pracownikow',
    desc: 'Wszystkie koszty pracownikow bez przypisanej budowy (np. wypłaty pracownikow ze stała pensja typu Leszek, KP_STAWKI) rozdzielone pro-rata pomiędzy budowy proporcjonalnie do bezpośredniego KP kazdej budowy.',
    formula: 'KP (bez budowy) * (KP_tej_budowy / suma KP wszystkich budow)',
  },
  KBB: {
    title: 'KBB - Koszty Bezpośrednie Budowy',
    desc: 'Materiały, najmy maszyn, podwykonawcy, transport - wszystko bezposrednio związane z ta budowa.',
    formula: 'SUMA(zapisy KBB gdzie budowa = ta budowa)',
  },
  'KBB-alok': {
    title: 'KBB-alok - Alokowane Koszty Bezpośrednie',
    desc: 'KBB nieprzypisane do konkretnej budowy, rozdzielone pro-rata.',
    formula: 'KBB (bez budowy) * udział tej budowy',
  },
  'Marża brutto': {
    title: 'Marża brutto',
    desc: 'Pierwsza marża - po odjęciu wylacznie kosztów zmiennych (pracownikow i kosztów bezposrednich).',
    formula: 'Sprzedaż - (KP + KP-alok + KBB + KBB-alok)',
  },
  'Marża brutto %': {
    title: '% Marża brutto',
    desc: 'Udział marży brutto w sprzedaży.',
    formula: 'Marża brutto / Sprzedaż * 100%',
  },
  KSB: {
    title: 'KSB - Koszty Stałe Bezpośrednie',
    desc: 'Paliwa, samochody, odzież robocza, sprzęt drobny - koszty stałe przypisane do tej budowy.',
    formula: 'SUMA(zapisy KSB gdzie budowa = ta budowa)',
  },
  'KSP układy': {
    title: 'KSP układy - Koszty Slawkow/Ukladow',
    desc: 'Wynajem i amortyzacja układów szalunkowych oraz innych dlugoterminowych układów, rozdzielone pro-rata pomiędzy budowy.',
    formula: 'SUMA(KSP_STAWKI + KSP_UKLADY) * udział tej budowy',
  },
  'Marża I': {
    title: 'Marża I',
    desc: 'Druga marża - po odjęciu kosztów stałych bezposrednich i układów/sławków.',
    formula: 'Marża brutto - KSB - KSP układy',
  },
  'Marża I %': {
    title: '% Marża I',
    desc: 'Udział Marży I w sprzedaży.',
    formula: 'Marża I / Sprzedaż * 100%',
  },
  'KSP alok': {
    title: 'KSP alok - Alokowane Koszty Stałe Pośrednie',
    desc: 'Biuro, księgowość, oplaty bankowe, oprogramowanie - koszty administracyjne firmy rozdzielone pro-rata na budowy.',
    formula: 'SUMA(KSP bez sławków/układów) * udział tej budowy',
  },
  'Marża II': {
    title: 'Marża II',
    desc: 'Trzecia marża - po odjęciu wszystkich kosztów operacyjnych firmy.',
    formula: 'Marża I - KSP alok',
  },
  'Marża II %': {
    title: '% Marża II',
    desc: 'Udział Marży II w sprzedaży.',
    formula: 'Marża II / Sprzedaż * 100%',
  },
  'Podatek alok': {
    title: 'Podatek alok - Alokowany Podatek',
    desc: 'Część obciążenia podatkowego (PPE/VAT) przypisana do tej budowy proporcjonalnie do jej udziału w sprzedaży.',
    formula: 'SUMA(podatki) * udział tej budowy',
  },
  'Marża III': {
    title: 'Marża III - Wynik netto',
    desc: 'Ostateczna marża - zysk netto budowy po wszystkich kosztach i podatkach.',
    formula: 'Marża II - Podatek alok',
  },
  'Marża III %': {
    title: '% Marża III',
    desc: 'Marża netto - finalny zysk procentowy budowy.',
    formula: 'Marża III / Sprzedaż * 100%',
  },
  Przychod: {
    title: 'Przychod (widoczny)',
    desc: 'Faktyczny przychod netto z faktur sprzedażowych - dokladnie ta sama wartość co Sprzedaż, ale wyswietlana zawsze (nawet gdy szczegóły sa schowane).',
    formula: 'Sprzedaż netto',
  },
  Koszt: {
    title: 'Koszt (widoczny)',
    desc: 'Sumaryczny koszt budowy - wszystko z minusem zsumowane.',
    formula: 'KP + KP-alok + KBB + KBB-alok + KSB + KSP układy + KSP alok',
  },
  KGIR: {
    title: 'KGIR - Kaucja Gwarancji Inwestora',
    desc: 'Wartość kaucji wstrzymanej przez inwestora (zwykle 2% sprzedaży) - zwracana po okresie gwarancyjnym.',
    formula: 'Sprzedaż * kaucja_gir_pct (domyślnie 2%)',
  },
  KDW: {
    title: 'KDW - Kaucja Dobrego Wykonania',
    desc: 'Kaucja na dobre wykonanie / drobne wady (domyślnie 2% sprzedaży) - zwracana po usunieciu wad.',
    formula: 'Sprzedaż * kaucja_dw_pct (domyślnie 2%)',
  },
  Różnica: {
    title: 'Różnica - Wynik finansowy',
    desc: 'Faktyczny wynik finansowy budowy po odjęciu kosztów i kaucji. To pokazuje ile budowa "zostawia" w firmie.',
    formula: 'Przychod - Koszt - KGIR - KDW',
  },
  'Zysk%': {
    title: '% Zysk',
    desc: 'Procentowy wynik budowy - ile zostalo z kazdej zarobionej zlotowki.',
    formula: 'Różnica / Przychod * 100%',
  },
  'Godz.': {
    title: 'Godziny przepracowane',
    desc: 'Suma godzin pracownikow wpisanych w tabeli godzin dla tej budowy w wybranym okresie.',
    formula: 'SUMA(godziny dla tej budowy)',
  },
  'Przych/Rg': {
    title: 'Przychod na roboczogodzine',
    desc: 'Ile zlotych przychodu generuje 1 godzina pracy na tej budowie.',
    formula: 'Przychod / Godziny',
  },
  'Zysk/Rg': {
    title: 'Zysk na roboczogodzine',
    desc: 'Ile zlotych zysku zostaje z 1 godziny pracy.',
    formula: 'Różnica / Godziny',
  },
  'Koszt/Rg': {
    title: 'Koszt na roboczogodzine',
    desc: 'Ile zlotych kosztów generuje 1 godzina pracy.',
    formula: 'Koszt / Godziny',
  },
  'Kszt zmienny': {
    title: 'Koszt zmienny',
    desc: 'Suma kosztów ktore zmieniaja sie wraz z liczba godzin - KP + KP-alok + KBB + KBB-alok.',
    formula: 'KP + KP-alok + KBB + KBB-alok',
  },
};

// Naglowek kolumny z ikonka (?) - po kliknieciu pokazuje pelen opis kolumny.
const InfoHeader = ({ label, info, className = '', align = 'right' }) => {
  if (!info) return <th className={className}>{label}</th>;
  return (
    <th className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-1 hover:text-white transition-colors cursor-help ${align === 'right' ? 'flex-row-reverse' : ''}`}
            data-testid={`sprzedaz-header-info-${label.replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`}>
            <HelpCircle className="h-3 w-3 opacity-60" />
            <span>{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 bg-[#0B1120] border-[#2A3B59] text-[#CBD5E1] text-xs p-4"
          align="start"
          side="bottom">
          <div className="font-semibold text-[#D4AF37] text-sm mb-2">{info.title}</div>
          <div className="text-[#CBD5E1] mb-3 leading-relaxed">{info.desc}</div>
          {info.formula && (
            <div className="pt-2 border-t border-[#2A3B59]">
              <div className="text-[10px] uppercase tracking-wide text-[#94A3B8] mb-1">Wzor</div>
              <div className="font-mono text-[#4F6343] text-[11px] leading-relaxed">{info.formula}</div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </th>
  );
};

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
  const err = s.last_fakturownia_sync_error || 'Nieznany błąd';
  const when = s.last_fakturownia_sync_at
    ? new Date(s.last_fakturownia_sync_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  return (
    <div
      data-testid="fakturownia-sync-warning"
      className="flex items-start gap-3 rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="h-5 w-5 text-[#9B2C2C] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#FCA5A5]">
          Ostatni auto-sync z Fakturowni nieudany{when && ` (${when})`}
        </div>
        <div className="text-[#FCA5A5]/80 mt-1 break-words">{err}</div>
        <div className="text-[#FCA5A5]/60 text-xs mt-1">
          Sprawdź klucz API i subdomene w Narzędzia &rarr; Fakturownia. Auto-sync probuje co 30 min.
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

// =================== MODAL: SZYBKI DODAJ ZAPIS (koszt bez faktury) ===================
const QuickAddZapis = ({ open, onClose }) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [kontrahent, setKontrahent] = useState('');
  const [notes, setNotes] = useState('');
  const [netto, setNetto] = useState('');
  const [kodId, setKodId] = useState('');
  const [budowaId, setBudowaId] = useState('');
  const [kody, setKody] = useState([]);
  const [budowy, setBudowy] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get('/finance/kody').catch(() => ({ data: [] })),
      api.get('/finance/budowy').catch(() => ({ data: [] })),
    ]).then(([k, b]) => {
      setKody(k.data?.rows || []);
      setBudowy(b.data?.rows || []);
    });
    // Reset przy ponownym otwarciu
    setDate(todayIso);
    setKontrahent('');
    setNotes('');
    setNetto('');
    setKodId('');
    setBudowaId('');
  }, [open, todayIso]);

  const handleSave = async () => {
    if (!date) return toast.error('Podaj datę');
    if (!netto || isNaN(parseFloat(netto))) return toast.error('Podaj kwotę netto');
    if (!kodId) return toast.error('Wybierz kod kosztu');
    setSaving(true);
    try {
      const d = new Date(date);
      await api.post('/finance/zapisy', {
        date,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        kontrahent: kontrahent || '',
        kod_id: kodId,
        budowa_id: budowaId || null,
        netto: parseFloat(netto),
        brutto: parseFloat(netto),
        notes: notes || '',
        source: 'manual',
      });
      toast.success('Zapis dodany');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37]">Dodaj zapis (koszt bez faktury)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-[#94A3B8] text-xs">Data</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="quickadd-date" />
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Kontrahent (opcjonalnie)</label>
            <Input value={kontrahent} onChange={(e) => setKontrahent(e.target.value)}
              placeholder="np. Bricomat sp. z o.o."
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="quickadd-kontrahent" />
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Kod kosztu *</label>
            <select value={kodId} onChange={(e) => setKodId(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#2A3B59] text-white rounded h-10 px-3"
              data-testid="quickadd-kod">
              <option value="">— wybierz —</option>
              {kody.filter((k) => k.cat !== 'PZS' && k.cat !== 'PZSV').map((k) => (
                <option key={k.id} value={k.id}>{k.cat} – {k.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Budowa (opcjonalnie)</label>
            <select value={budowaId} onChange={(e) => setBudowaId(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#2A3B59] text-white rounded h-10 px-3"
              data-testid="quickadd-budowa">
              <option value="">— nieprzypisane —</option>
              {budowy.filter((b) => !b.is_archived).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Netto (PLN) *</label>
            <Input type="number" step="0.01" value={netto} onChange={(e) => setNetto(e.target.value)}
              placeholder="0,00"
              className="bg-[#0B1120] border-[#2A3B59] text-white text-lg font-mono tabular-nums"
              data-testid="quickadd-netto" />
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Opis / uwagi (opcjonalnie)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="np. paliwo do koparki"
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="quickadd-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#CBD5E1] bg-transparent hover:bg-[#19243C]" data-testid="quickadd-cancel">Anuluj</Button>
          <Button onClick={handleSave} disabled={saving}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="quickadd-save">
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =================== PANEL: PODSUMOWANIE PLATNOSCI ===================
const PaymentSummaryPanel = ({ onTileClick, year }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [discrepancy, setDiscrepancy] = useState(null);
  const [syncing, setSyncing] = useState(false);
  // Domyslnie netto - tak jak Fakturownia raporty wydatkow/przychodow
  const [amountMode, setAmountMode] = useState(() => localStorage.getItem('fin_amount_mode') || 'netto');

  const setMode = (m) => {
    setAmountMode(m);
    try { localStorage.setItem('fin_amount_mode', m); } catch { /* ignore */ }
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    const qs = year ? `?year=${year}` : '';
    api.get(`/finance/payment-summary${qs}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    api.get(`/finance/payment-discrepancy${qs}`)
      .then((r) => setDiscrepancy(r.data))
      .catch(() => setDiscrepancy(null));
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const syncUnpaid = async () => {
    setSyncing(true);
    try {
      const r = await api.post('/finance/sync-fakturownia-unpaid');
      const c = r.data.invoices_created;
      const u = r.data.invoices_updated;
      toast.success(`Sync OK: ${c} nowych, ${u} zaktualizowanych`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd sync');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;
  if (!data) return null;

  const r = data.receivables;
  const p = data.payables;
  // Wybor netto vs brutto
  const valKey = amountMode === 'brutto' ? '_brutto' : '_netto';
  const rTotal = r[`total${valKey}`];
  const pTotal = p[`total${valKey}`];
  const pOverdue = p[`overdue${valKey}`];
  const overdueAny = p.overdue_count;
  const diffP = discrepancy?.diff?.[`payables${valKey}`] || 0;
  const diffR = discrepancy?.diff?.[`receivables${valKey}`] || 0;
  const hasDiscP = Math.abs(diffP) > 1.0;
  const hasDiscR = Math.abs(diffR) > 1.0;

  const Tile = ({ filter, testId, borderColor, label, valueColor, value, sub, extra }) => (
    <button
      type="button"
      onClick={() => onTileClick && onTileClick(filter)}
      className={`text-left rounded-lg p-4 border-2 ${borderColor} bg-[#131C2F] hover:ring-2 hover:ring-[#D4AF37]/40 transition-all cursor-pointer`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#94A3B8] text-xs uppercase tracking-wide">{label}</span>
        {extra}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{fmtNum(value)}<span className="text-xs ml-1">zł {amountMode === 'brutto' ? 'brutto' : 'netto'}</span></div>
      <div className="text-xs text-[#94A3B8] mt-1">{sub}</div>
    </button>
  );

  const DiscBadge = ({ diff, count }) => (
    <span
      title={`Rozbieżność z Fakturownia: ${diff > 0 ? '+' : ''}${fmtNum(diff)} zł (${count > 0 ? '+' : ''}${count} faktur). Kliknij banner aby zsynchronizować.`}
      className="flex items-center gap-1"
      data-testid="discrepancy-badge"
    >
      <AlertTriangle className="h-4 w-4 text-[#D4AF37]" />
    </span>
  );

  return (
    <div className="space-y-2 mb-4">
      {/* Toggle Netto / Brutto */}
      <div className="flex items-center justify-end gap-2 text-xs text-[#94A3B8]">
        <span>Pokaż kwoty:</span>
        <div className="inline-flex rounded-md overflow-hidden border border-[#2A3B59]" data-testid="payment-amount-mode-toggle">
          <button onClick={() => setMode('netto')}
            className={`px-3 py-1 text-xs font-medium ${amountMode === 'netto' ? 'bg-[#4F6343] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
            data-testid="amount-mode-netto">
            Netto
          </button>
          <button onClick={() => setMode('brutto')}
            className={`px-3 py-1 text-xs font-medium border-l border-[#2A3B59] ${amountMode === 'brutto' ? 'bg-[#4F6343] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
            data-testid="amount-mode-brutto">
            Brutto
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="payment-summary-panel">
        <Tile
          filter="receivables"
          testId="receivables-tile"
          borderColor="border-[#4F6343]/40"
          label="Kontrahenci mi do zapłaty"
          valueColor="text-[#5F7552]"
          value={rTotal}
          sub={`${r.count} faktur`}
          extra={hasDiscR ? <DiscBadge diff={diffR} count={discrepancy.diff.receivables_count} /> : null}
        />
        <Tile
          filter="due"
          testId="payables-tile"
          borderColor="border-[#D4AF37]/40"
          label="Do zapłaty"
          valueColor="text-[#D4AF37]"
          value={pTotal}
          sub={`${p.count} faktur`}
          extra={hasDiscP ? <DiscBadge diff={diffP} count={discrepancy.diff.payables_count} /> : null}
        />
        <Tile
          filter="overdue"
          testId="overdue-tile"
          borderColor={overdueAny > 0 ? 'border-[#9B2C2C]/60' : 'border-[#2A3B59]'}
          label="Przeterminowane (koszty)"
          valueColor={overdueAny > 0 ? 'text-[#FCA5A5]' : 'text-[#CBD5E1]'}
          value={pOverdue}
          sub={overdueAny > 0
            ? `${p.overdue_count} ${p.overdue_count === 1 ? 'faktura kosztowa' : 'faktur kosztowych'}`
            : 'Brak przeterminowanych kosztów'}
          extra={overdueAny > 0 ? <AlertTriangle className="h-4 w-4 text-[#FCA5A5]" /> : null}
        />
      </div>
      {(hasDiscP || hasDiscR) && (
        <div className="flex items-center justify-between bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded p-2 text-xs text-[#D4AF37]" data-testid="discrepancy-banner">
          <span>
            ⚠ Rozbieżność z Fakturownia ({amountMode}):
            {hasDiscP && ` koszty ${diffP > 0 ? '+' : ''}${fmtNum(diffP)} zł`}
            {hasDiscP && hasDiscR && ' • '}
            {hasDiscR && ` przychody ${diffR > 0 ? '+' : ''}${fmtNum(diffR)} zł`}
          </span>
          <Button size="sm" onClick={syncUnpaid} disabled={syncing}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] font-semibold h-7 text-xs"
            data-testid="discrepancy-sync-btn">
            {syncing ? 'Synchronizuję...' : 'Synchronizuj teraz'}
          </Button>
        </div>
      )}
    </div>
  );
};

export const Finance = () => {
  const [active, setActive] = useState('rw');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Filtr platnosci - lifted state, sterowany z kafelkow w Rachunku Wynikow
  // i z chip'ow w Zapisy. Wartosci: 'all' | 'paid' | 'overdue' | 'due' | 'receivables'
  const [paymentFilter, setPaymentFilter] = useState('all');

  const handleTileClick = (filter) => {
    setPaymentFilter(filter);
    setActive('zapisy');
  };

  return (
    <div className="space-y-4">
      <FakturowniaSyncWarning />
      {/* Subtab nav + year picker + quick add */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#2A3B59] pb-2">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            data-testid={`finance-subtab-${t.id}`}
            className={`px-3 py-1.5 rounded-t text-sm font-semibold transition-colors ${
              active === t.id
                ? 'bg-[#4F6343] text-white'
                : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {/* Skrot: Dodaj zapis (koszt bez faktury) */}
          <Button
            size="sm"
            onClick={() => setQuickAddOpen(true)}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] font-semibold"
            data-testid="finance-quick-add-zapis-btn"
          >
            <Plus className="h-4 w-4 mr-1" /> Dodaj zapis
          </Button>
          <span className="text-[#94A3B8] text-sm">Rok:</span>
          <Input
            type="number"
            min="2020" max="2099"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
            className="w-24 bg-[#131C2F] border-[#2A3B59] text-white h-8"
            data-testid="finance-year-input"
          />
        </div>
      </div>
      <QuickAddZapis open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      {active === 'budowy' && <BudowyPanel />}
      {active === 'zapisy' && <ZapisyPanel year={year} paymentFilter={paymentFilter} setPaymentFilter={setPaymentFilter} />}
      {active === 'rw' && <RachunekWynikowPanel year={year} onTileClick={handleTileClick} />}
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
  const [form, setForm] = useState({ name: '', code: '', show_in_hours: true, is_gir: false, kaucja_gir_pct: 2.0, is_dw: false, kaucja_dw_pct: 2.0, zamawiajacy: '', umowa_nr: '', umowa_data: '', wykonawca: '' });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/finance/budowy?include_archived=${includeArchived}`);
      setRows(res.data.rows);
    } catch {
      toast.error('Błąd pobierania budow');
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
      setForm({ name: '', code: '', show_in_hours: true, is_gir: false, kaucja_gir_pct: 2.0, is_dw: false, kaucja_dw_pct: 2.0, zamawiajacy: '', umowa_nr: '', umowa_data: '', wykonawca: '' });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
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
      zamawiajacy: b.zamawiajacy || '',
      umowa_nr: b.umowa_nr || '',
      umowa_data: b.umowa_data || '',
      wykonawca: b.wykonawca || '',
    });
    setShowAdd(true);
  };

  const archive = async (b) => {
    if (!window.confirm(`Zarchiwizowac "${b.name}"?\n\nDane zapisow zostana w bazie, ale budowa zniknie z listy godzin.`)) return;
    try { await api.post(`/finance/budowy/${b.id}/archive`); toast.success('Zarchiwizowano'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };
  const unarchive = async (b) => {
    try { await api.post(`/finance/budowy/${b.id}/unarchive`); toast.success('Przywrocono'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };
  const remove = async (b) => {
    if (!window.confirm(`TRWALE usunac "${b.name}"?\n\nMozliwe tylko gdy brak zapisow finansowych.`)) return;
    try { await api.delete(`/finance/budowy/${b.id}`); toast.success('Usunieto'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };

  return (
    <Card className="bg-[#19243C] border-[#2A3B59] shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-white font-display text-lg tracking-tight">Budowy ({rows.length})</CardTitle>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[#94A3B8] cursor-pointer mr-2">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)}
              className="accent-[#4F6343] h-4 w-4" data-testid="finance-show-archived" />
            Pokaż archiwalne
          </label>
          <Button onClick={() => { setEditing(null); setForm({ name:'', code:'', show_in_hours:true, is_gir:false, kaucja_gir_pct: 2.0, is_dw:false, kaucja_dw_pct: 2.0, zamawiajacy:'', umowa_nr:'', umowa_data:'', wykonawca:'' }); setShowAdd(true); }}
            className="bg-[#4F6343] hover:bg-[#5F7552] text-white transition-colors shadow-sm" data-testid="finance-add-budowa">
            <Plus className="h-4 w-4 mr-1" /> Dodaj budowe
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="p-6 text-[#94A3B8]">Ładowanie...</div> :
        rows.length === 0 ? <div className="p-6 text-[#94A3B8]">Brak budow. Dodaj pierwsza.</div> :
        <table className="w-full text-sm">
          <thead className="bg-[#131C2F] text-[#94A3B8] text-xs uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-3 px-4 text-left border-b border-[#2A3B59]">Nazwa</th>
              <th className="py-3 px-4 text-center border-b border-[#2A3B59]">W godzinach</th>
              <th className="py-3 px-4 text-center border-b border-[#2A3B59]">GIR %</th>
              <th className="py-3 px-4 text-center border-b border-[#2A3B59]">DW %</th>
              <th className="py-3 px-4 text-center border-b border-[#2A3B59]">Status</th>
              <th className="py-3 px-4 text-right border-b border-[#2A3B59]">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-[#2A3B59] hover:bg-[#131C2F]/50 transition-colors" data-testid={`finance-budowa-row-${b.id}`}>
                <td className="py-3 px-4 text-white font-medium">{b.name}</td>
                <td className="py-3 px-4 text-center">{b.show_in_hours ? <span className="text-[#5F7552]">TAK</span> : <span className="text-[#2A3B59]">-</span>}</td>
                <td className="py-3 px-4 text-center">{b.is_gir ? <span className="text-[#D4AF37] font-mono tabular-nums">{fmt(b.kaucja_gir_pct ?? 2)}%</span> : <span className="text-[#2A3B59]">-</span>}</td>
                <td className="py-3 px-4 text-center">{b.is_dw ? <span className="text-[#D4AF37] font-mono tabular-nums">{fmt(b.kaucja_dw_pct ?? 2)}%</span> : <span className="text-[#2A3B59]">-</span>}</td>
                <td className="py-3 px-4 text-center">
                  {b.is_archived ? <span className="text-[#94A3B8] text-xs px-2 py-1 bg-[#131C2F] rounded">Archiwum</span> : <span className="text-[#5F7552] text-xs px-2 py-1 bg-[#4F6343]/20 rounded">Aktywna</span>}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(b)} className="p-1.5 hover:bg-[#2A3B59] rounded transition-colors" title="Edytuj" data-testid={`finance-budowa-edit-${b.id}`}>
                      <Edit2 className="h-4 w-4 text-[#94A3B8]" />
                    </button>
                    {b.is_archived
                      ? <button onClick={() => unarchive(b)} className="p-1.5 hover:bg-[#2A3B59] rounded transition-colors" title="Przywroc" data-testid={`finance-budowa-unarchive-${b.id}`}><ArchiveRestore className="h-4 w-4 text-[#4F6343]" /></button>
                      : <button onClick={() => archive(b)} className="p-1.5 hover:bg-[#2A3B59] rounded transition-colors" title="Archiwizuj" data-testid={`finance-budowa-archive-${b.id}`}><Archive className="h-4 w-4 text-[#94A3B8]" /></button>
                    }
                    <button onClick={() => remove(b)} className="p-1.5 hover:bg-[#9B2C2C]/20 rounded transition-colors" title="Usuń trwale" data-testid={`finance-budowa-delete-${b.id}`}><Trash2 className="h-4 w-4 text-[#FCA5A5]" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1]" data-testid="finance-budowa-modal">
          <DialogHeader>
            <DialogTitle className="text-white">{editing ? 'Edytuj budowe' : 'Dodaj budowe'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Nazwa</label>
              <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="np. LEBA, SASINO" className="bg-[#131C2F] border-[#2A3B59] text-white" autoFocus
                data-testid="finance-budowa-name" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-[#131C2F] rounded">
              <input type="checkbox" checked={form.show_in_hours} onChange={(e) => setForm({...form, show_in_hours: e.target.checked})}
                className="accent-[#4F6343]" data-testid="finance-budowa-show-in-hours" />
              <span>Pokaż w liscie godzin (przypisywanie pracownikow)</span>
            </label>
            <div className="flex items-center gap-2 text-sm p-2 hover:bg-[#131C2F] rounded">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={form.is_gir} onChange={(e) => setForm({...form, is_gir: e.target.checked})}
                  className="accent-[#D4AF37]" data-testid="finance-budowa-is-gir" />
                <span>Budowa GIR — Kaucja</span>
              </label>
              <Input type="number" step="0.1" min="0" max="100" value={form.kaucja_gir_pct}
                onChange={(e) => setForm({...form, kaucja_gir_pct: parseFloat(e.target.value) || 0})}
                disabled={!form.is_gir}
                className="w-20 no-spinner bg-[#131C2F] border-[#2A3B59] text-white text-right"
                data-testid="finance-budowa-gir-pct" />
              <span className="text-[#94A3B8]">% z przychodu</span>
            </div>
            <div className="flex items-center gap-2 text-sm p-2 hover:bg-[#131C2F] rounded">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={form.is_dw} onChange={(e) => setForm({...form, is_dw: e.target.checked})}
                  className="accent-[#D4AF37]" data-testid="finance-budowa-is-dw" />
                <span>Budowa DW — Kaucja</span>
              </label>
              <Input type="number" step="0.1" min="0" max="100" value={form.kaucja_dw_pct}
                onChange={(e) => setForm({...form, kaucja_dw_pct: parseFloat(e.target.value) || 0})}
                disabled={!form.is_dw}
                className="w-20 no-spinner bg-[#131C2F] border-[#2A3B59] text-white text-right"
                data-testid="finance-budowa-dw-pct" />
              <span className="text-[#94A3B8]">% z przychodu</span>
            </div>
          </div>
          {/* Dane do generowania protokolu miesiecznego */}
          <div className="space-y-2 pt-3 border-t border-[#2A3B59]">
            <div className="text-xs text-[#D4AF37] font-semibold uppercase tracking-wide">Dane do protokołu miesięcznego</div>
            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">Zamawiający (nazwa, adres, NIP)</label>
              <textarea value={form.zamawiajacy} onChange={(e) => setForm({...form, zamawiajacy: e.target.value})}
                rows={2}
                className="w-full bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-1.5 text-sm"
                data-testid="finance-budowa-zamawiajacy" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">Nr umowy</label>
                <Input value={form.umowa_nr} onChange={(e) => setForm({...form, umowa_nr: e.target.value})}
                  className="bg-[#131C2F] border-[#2A3B59] text-white" data-testid="finance-budowa-umowa-nr" />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">Data umowy</label>
                <Input value={form.umowa_data} onChange={(e) => setForm({...form, umowa_data: e.target.value})}
                  placeholder="np. 15.09.2025 + ANEKS 1"
                  className="bg-[#131C2F] border-[#2A3B59] text-white" data-testid="finance-budowa-umowa-data" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] block mb-1">Wykonawca (puste = domyślnie FEGRRO)</label>
              <Input value={form.wykonawca} onChange={(e) => setForm({...form, wykonawca: e.target.value})}
                placeholder="FEGRRO SP. Z O.O. NIP: 589-206-61-74"
                className="bg-[#131C2F] border-[#2A3B59] text-white" data-testid="finance-budowa-wykonawca" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}
              className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] hover:text-white">Anuluj</Button>
            <Button onClick={submit} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="finance-budowa-submit">
              {editing ? 'Zapisz' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// =========================== ZAPISY / FAKTURY ===========================
const ZapisyPanel = ({ year, paymentFilter, setPaymentFilter }) => {
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
    kontrahent: '', netto: '', kod_id: 'PZS', budowa_id: '', budget_line_id: '', nr_faktury: '', pozycja_nazwa: '', notes: '',
  });
  // Pozycje budzetu dla aktualnie wybranej budowy (modal)
  const [budgetLines, setBudgetLines] = useState([]);

  // Auto-fetch budget lines gdy uzytkownik wybierze budowe w modalu
  useEffect(() => {
    if (!form.budowa_id) { setBudgetLines([]); return; }
    api.get(`/budget/${form.budowa_id}/lines`)
      .then((r) => setBudgetLines(r.data?.rows || []))
      .catch(() => setBudgetLines([]));
  }, [form.budowa_id]);

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
        // Caly rok: jedno wywolanie /payroll/year-totals zamiast petli 12 GET-ow.
        // Backend juz wie ze przyszle miesiace pomijac.
        try {
          const yt = await api.get(`/payroll/year-totals?year=${year}`);
          setPayrollExpected({ year, month: 0, total: yt.data?.total || 0 });
        } catch { setPayrollExpected(null); }
      }
    } catch {
      toast.error('Błąd pobierania zapisow');
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
        budget_line_id: form.budget_line_id || null,
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
      setForm({ date: new Date().toISOString().slice(0, 10), kontrahent: '', netto: '', kod_id: 'PZS', budowa_id: '', budget_line_id: '', nr_faktury: '', pozycja_nazwa: '', notes: '' });
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const openEdit = (z) => {
    setEditing(z);
    setForm({
      date: z.date, kontrahent: z.kontrahent || '', netto: String(z.netto),
      kod_id: z.kod_id || 'PZS', budowa_id: z.budowa_id || '',
      budget_line_id: z.budget_line_id || '',
      nr_faktury: z.nr_faktury || '', pozycja_nazwa: z.pozycja_nazwa || '', notes: z.notes || '',
    });
    setShowAdd(true);
  };

  // Quick assign dla pozycji (finance_zapisy)
  // Lokalna aktualizacja jednej pozycji (bez fetchData - nie reloadujemy calej listy).
  // Pozycje moga byc: standalone zapis (r.id === posId) lub pozycja faktury (r.positions[i].id === posId).
  const updatePosLocal = (posId, patch) => {
    setRows(prev => prev.map(r => {
      if (r.id === posId) return { ...r, ...patch };
      if (r.positions && r.positions.length > 0) {
        const idx = r.positions.findIndex(p => p.id === posId);
        if (idx >= 0) {
          const newPositions = [...r.positions];
          newPositions[idx] = { ...newPositions[idx], ...patch };
          return { ...r, positions: newPositions };
        }
      }
      return r;
    }));
  };

  const quickAssignPos = async (z, field, value) => {
    const oldValue = z[field];
    // Optymistyczna aktualizacja - od razu odswiezamy UI
    updatePosLocal(z.id, { [field]: value || null });
    try {
      await api.put(`/finance/zapisy/${z.id}`, { [field]: value });
    } catch (e) {
      // Rollback przy bledzie
      updatePosLocal(z.id, { [field]: oldValue });
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  // Quick assign dla naglowka faktury (finance_invoices) - tez optymistyczna aktualizacja
  const quickAssignInv = async (inv, field, value) => {
    const oldValue = inv[field];
    // Optymistyczna aktualizacja - od razu odswiezamy UI
    setRows(prev => prev.map(r =>
      r.is_invoice && r.id === inv.id ? { ...r, [field]: value || null } : r,
    ));
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
    } catch (e) {
      // Rollback przy bledzie
      setRows(prev => prev.map(r =>
        r.is_invoice && r.id === inv.id ? { ...r, [field]: oldValue } : r,
      ));
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const remove = async (z) => {
    if (!window.confirm(`Usunac zapis ${z.kontrahent || ''} ${z.netto}zł?`)) return;
    try { await api.delete(`/finance/zapisy/${z.id}`); toast.success('Usunieto'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };

  const removeInvoice = async (inv) => {
    if (!window.confirm(`Usunac FAKTURE ${inv.nr_faktury || ''} (${inv.kontrahent}) ${fmtPLN(inv.netto)} i WSZYSTKIE jej pozycje?`)) return;
    try {
      const r = await api.delete(`/finance/invoices/${inv.id}`);
      toast.success(`Usunieto fakture + ${r.data.positions_deleted} pozycji`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
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
  // Filtr platnosci (chip'y nad tabela, sterowane tez z kafelkow Rachunku Wynikow)
  const todayISO = new Date().toISOString().slice(0, 10);
  if (paymentFilter === 'paid') {
    filteredRows = filteredRows.filter(r => r.is_invoice && r.paid);
  } else if (paymentFilter === 'overdue') {
    filteredRows = filteredRows.filter(r => r.is_invoice && !r.is_income && !r.paid && r.payment_to && r.payment_to < todayISO);
  } else if (paymentFilter === 'due') {
    filteredRows = filteredRows.filter(r => r.is_invoice && !r.is_income && !r.paid);
  } else if (paymentFilter === 'receivables') {
    filteredRows = filteredRows.filter(r => r.is_invoice && r.is_income && !r.paid);
  }
  // Liczniki dla chipow (na bazie pelnego rows, nie filteredRows)
  const paidCount = rows.filter(r => r.is_invoice && r.paid).length;
  const overdueCount = rows.filter(r => r.is_invoice && !r.is_income && !r.paid && r.payment_to && r.payment_to < todayISO).length;
  const dueCount = rows.filter(r => r.is_invoice && !r.is_income && !r.paid).length;
  const receivablesCount = rows.filter(r => r.is_invoice && r.is_income && !r.paid).length;

  const syncCurrent = async () => {
    if (!window.confirm(
      'Synchronizowac godziny i wypłaty z bieżącym miesiacem?\n\n' +
      'Tylko AKTUALNY miesiąc - nie przyszly, nie historyczne. ' +
      'Stare auto-zapisy zostana nadpisane, ale reczne wpisy nie sa ruszane.'
    )) return;
    try {
      const r = await api.post('/finance/sync-current-month');
      toast.success(`Sync OK: ${r.data.g_zapisy} godzin + ${r.data.kp_zapisy} wypłat (${r.data.total_godziny}h, ${r.data.total_kp?.toFixed(2)} zł)`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd synchronizacji');
    }
  };

  const syncAllMonths = async () => {
    if (!window.confirm(
      'Resynchronizowac WSZYSTKIE miesiące od stycznia 2026?\n\n' +
      'Stare auto-zapisy zostana nadpisane, reczne wpisy nietkniete.'
    )) return;
    setSyncingPayroll(true);
    try {
      const r = await api.post('/finance/sync-all-months?from_year=2026&from_month=1');
      toast.success(`Sync OK: ${r.data.months_processed} mc, ${fmtPLN(r.data.total_kp || 0)}`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd synchronizacji');
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
      className={`w-full bg-[#131C2F] border rounded px-1 py-1 text-xs ${isUnassignedHighlight ? 'border-[#D4AF37] text-[#D4AF37]' : 'border-[#2A3B59] text-white'}`}
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
      className="w-full bg-[#131C2F] border border-[#2A3B59] text-white rounded px-1 py-1 text-xs"
      data-testid={testid}>
      <option value="">— bez budowy —</option>
      {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );

  return (
    <Card className="bg-[#19243C] border-[#2A3B59]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-white">
          Faktury i zapisy ({filteredRows.length}{filteredRows.length !== rows.length ? `/${rows.length}` : ''}, suma: {fmtPLN(totalNetto)})
          {unassignedCount > 0 && !filterUnassigned && (
            <button onClick={() => setFilterUnassigned(true)}
              className="ml-3 px-2 py-0.5 text-xs bg-[#D4AF37]/20 text-[#D4AF37] rounded hover:bg-[#D4AF37]/30"
              data-testid="finance-unassigned-filter">
              {unassignedCount} bez kodu (kliknij aby przefiltrowac)
            </button>
          )}
          {filterUnassigned && (
            <button onClick={() => setFilterUnassigned(false)}
              className="ml-3 px-2 py-0.5 text-xs bg-[#2A3B59] text-[#CBD5E1] rounded hover:bg-[#2A3B59]">
              Pokaż wszystkie
            </button>
          )}
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtr platnosci (Fakturownia paid/overdue/due/receivables) */}
          <div className="inline-flex rounded-md overflow-hidden border border-[#2A3B59]" data-testid="payment-filter-chips">
            <button onClick={() => setPaymentFilter('all')}
              className={`px-2 py-1 text-xs font-medium ${paymentFilter === 'all' ? 'bg-[#4F6343] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="payment-filter-all">
              Wszystko
            </button>
            <button onClick={() => setPaymentFilter('paid')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#2A3B59] ${paymentFilter === 'paid' ? 'bg-[#4F6343] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="payment-filter-paid">
              ✓ Opłacone ({paidCount})
            </button>
            <button onClick={() => setPaymentFilter('due')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#2A3B59] ${paymentFilter === 'due' ? 'bg-[#D4AF37] text-[#0B1120]' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="payment-filter-due">
              Do zapłaty ({dueCount})
            </button>
            <button onClick={() => setPaymentFilter('overdue')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#2A3B59] ${paymentFilter === 'overdue' ? 'bg-[#9B2C2C] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="payment-filter-overdue">
              ⚠ Przeterminowane ({overdueCount})
            </button>
            <button onClick={() => setPaymentFilter('receivables')}
              className={`px-2 py-1 text-xs font-medium border-l border-[#2A3B59] ${paymentFilter === 'receivables' ? 'bg-[#5F7552] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="payment-filter-receivables">
              Kontrahenci mi do zapłaty ({receivablesCount})
            </button>
          </div>
          <div className="inline-flex rounded-md overflow-hidden border border-[#2A3B59]">
            <button onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs font-medium ${filterType === 'all' ? 'bg-[#4F6343] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="finance-filter-all">
              Wszystko ({rows.length})
            </button>
            <button onClick={() => setFilterType('cost')}
              className={`px-3 py-1 text-xs font-medium border-l border-[#2A3B59] ${filterType === 'cost' ? 'bg-[#DC4A3A] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="finance-filter-cost">
              Koszty ({costCount})
            </button>
            <button onClick={() => setFilterType('income')}
              className={`px-3 py-1 text-xs font-medium border-l border-[#2A3B59] ${filterType === 'income' ? 'bg-[#4F6343] text-white' : 'bg-[#131C2F] text-[#94A3B8] hover:bg-[#2A3B59]'}`}
              data-testid="finance-filter-income">
              Sprzedaż ({incomeCount})
            </button>
          </div>
          <Button onClick={syncCurrent} variant="outline"
            className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#2A3B59] hover:text-[#D4AF37]"
            data-testid="finance-sync-current">
            Sync bieżący miesiąc
          </Button>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-1 text-sm"
            data-testid="finance-zapisy-month">
            <option value="0">Caly rok</option>
            {PL_MONTHS_SHORT.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <Button onClick={() => { setEditing(null); setShowAdd(true); }}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="finance-add-zapis">
            <Plus className="h-4 w-4 mr-1" /> Dodaj zapis
          </Button>
        </div>
      </CardHeader>
      {kpMismatch && (
        <div className="mx-4 mb-3 flex items-start gap-3 rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-4 py-3 text-sm"
          data-testid="finance-payroll-mismatch-banner">
          <AlertTriangle className="h-5 w-5 text-[#9B2C2C] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#FCA5A5]">
              Niezgodność kosztu wynagrodzeń {month > 0 ? `${PL_MONTHS_SHORT[month-1]} ${year}` : `caly rok ${year}`}
            </div>
            <div className="text-[#FCA5A5]/90 text-xs mt-1">
              W zapisach: <strong>{fmtPLN(actualKpSum)}</strong> | W Wyplatach: <strong>{fmtPLN(expectedKp)}</strong> | Różnica: <strong>{fmtPLN(expectedKp - actualKpSum)}</strong>
            </div>
            <div className="text-[#FCA5A5]/60 text-xs mt-1">
              Możliwa przyczyna: brak resyncu po zmianach w Wyplatach lub w godzinach. Kliknij ponizej aby wymusić resync.
            </div>
          </div>
          <Button onClick={month > 0 ? syncCurrent : syncAllMonths} disabled={syncingPayroll}
            className="bg-[#9B2C2C] hover:bg-[#B91C1C] text-white text-xs h-8"
            data-testid="finance-payroll-mismatch-resync">
            {syncingPayroll ? 'Sync...' : (month > 0 ? 'Sync ten miesiąc' : 'Sync wszystkie')}
          </Button>
        </div>
      )}
      <CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-6 text-[#94A3B8]">Ładowanie...</div> :
        rows.length === 0 ? <div className="p-6 text-[#94A3B8]">Brak zapisow w tym okresie.</div> :
        <table className="w-full text-sm">
          <thead className="bg-[#131C2F] text-[#94A3B8]">
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
                    <tr className={`border-t border-[#2A3B59] hover:bg-[#131C2F]/50 ${
                      unassigned ? 'bg-[#D4AF37]/10 ring-1 ring-inset ring-[#D4AF37]/40' : ''
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
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <span className="text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] px-1 rounded">FAKTUROWNIA</span>
                          {r.is_income && <span className="text-[10px] bg-[#4F6343]/30 text-[#5F7552] px-1 rounded">SPRZEDAŻ</span>}
                          {r.paid && (
                            <span className="text-[10px] bg-[#4F6343]/30 text-[#5F7552] px-1 rounded" title={r.payment_date ? `Zapłacono: ${r.payment_date}` : 'Zapłacona'} data-testid={`finance-invoice-paid-${r.id}`}>
                              ✓ ZAPŁACONA
                            </span>
                          )}
                          {!r.paid && r.payment_to && r.payment_to < new Date().toISOString().slice(0,10) && (
                            <span className="text-[10px] bg-[#9B2C2C]/30 text-[#FCA5A5] px-1 rounded" title={`Termin minął: ${r.payment_to}`} data-testid={`finance-invoice-overdue-${r.id}`}>
                              ⚠ PRZETERMINOWANA
                            </span>
                          )}
                          {!r.paid && r.payment_to && r.payment_to >= new Date().toISOString().slice(0,10) && (
                            <span className="text-[10px] bg-[#D4AF37]/15 text-[#D4AF37] px-1 rounded" title={`Termin do: ${r.payment_to}`}>
                              Do zapłaty: {r.payment_to}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-[#94A3B8] text-xs italic">
                        {(r.positions || []).length} {(r.positions || []).length === 1 ? 'pozycja' : 'pozycji'}
                        {hasAssignedPositions && r.kod_id && (
                          <div className="text-[10px] text-[#D4AF37] mt-0.5" title="Naglowek faktury wnosi do aggregacji TYLKO reszte (netto - przypisane pozycje)">
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
                        <button onClick={() => removeInvoice(r)} className="p-1 hover:bg-[#7F1D1D] rounded" title="Usuń fakture + pozycje"><Trash2 className="h-4 w-4 text-[#9B2C2C]" /></button>
                      </td>
                    </tr>
                    {isOpen && (r.positions || []).map((p) => (
                      <tr key={p.id} className="border-t border-[#2A3B59] bg-[#131C2F]/50">
                        <td></td>
                        <td className="p-2 text-[#94A3B8] text-[10px]"></td>
                        <td className="p-2 text-[#94A3B8] text-xs pl-6">
                          <span className="text-[#2A3B59]">└</span> pozycja
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
                <tr key={z.id} className={`border-t border-[#2A3B59] hover:bg-[#131C2F]/50 ${
                  isUnassigned ? 'bg-[#D4AF37]/10 ring-1 ring-inset ring-[#D4AF37]/40' : (z.source && z.source.startsWith('auto_') ? 'bg-[#131C2F]/40' : '')
                }`} data-testid={`finance-zapis-row-${z.id}`}>
                  <td></td>
                  <td className="p-2 text-white text-xs whitespace-nowrap">{z.date}</td>
                  <td className="p-2 text-[#CBD5E1] text-xs">
                    <div>{z.kontrahent || '-'}</div>
                    {z.nr_faktury && <div className="text-[#94A3B8] text-[10px]">{z.nr_faktury}</div>}
                    {z.source === 'manual' && <span className="inline-block mt-0.5 text-[10px] bg-[#2A3B59]/40 text-[#CBD5E1] px-1 rounded">RECZNY</span>}
                    {z.source && z.source.startsWith('auto_') && <span className="inline-block mt-0.5 text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] px-1 rounded">AUTO</span>}
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
                      <button onClick={() => openEdit(z)} className="p-1 hover:bg-[#2A3B59] rounded" title="Edytuj"><Edit2 className="h-4 w-4 text-[#94A3B8]" /></button>
                      <button onClick={() => remove(z)} className="p-1 hover:bg-[#7F1D1D] rounded" title="Usuń"><Trash2 className="h-4 w-4 text-[#9B2C2C]" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-2xl" data-testid="finance-zapis-modal">
          <DialogHeader><DialogTitle className="text-white">{editing ? 'Edytuj zapis' : 'Dodaj zapis ksiegowy'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Data</label>
              <Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}
                className="bg-[#131C2F] border-[#2A3B59] text-white" data-testid="finance-zapis-date" />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Nr faktury</label>
              <Input value={form.nr_faktury} onChange={(e) => setForm({...form, nr_faktury: e.target.value})}
                placeholder="FV/.../2026" className="bg-[#131C2F] border-[#2A3B59] text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#94A3B8] block mb-1">Kontrahent</label>
              <Input value={form.kontrahent} onChange={(e) => setForm({...form, kontrahent: e.target.value})}
                placeholder="np. INWESTOR ABC" className="bg-[#131C2F] border-[#2A3B59] text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#94A3B8] block mb-1">Pozycja (nazwa towaru/uslugi)</label>
              <Input value={form.pozycja_nazwa} onChange={(e) => setForm({...form, pozycja_nazwa: e.target.value})}
                placeholder="np. Beton B25, Stal preta fi12" className="bg-[#131C2F] border-[#2A3B59] text-white" />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Kod kosztu</label>
              <select value={form.kod_id} onChange={(e) => setForm({...form, kod_id: e.target.value})}
                className="w-full bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-2 text-sm"
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
              <select value={form.budowa_id} onChange={(e) => setForm({...form, budowa_id: e.target.value, budget_line_id: ''})}
                className="w-full bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-2 text-sm"
                data-testid="finance-zapis-budowa">
                <option value="">— bez budowy —</option>
                {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {form.budowa_id && budgetLines.length > 0 && (
              <div>
                <label className="text-sm text-[#94A3B8] block mb-1">Pozycja budżetu (opcjonalnie)</label>
                <select value={form.budget_line_id} onChange={(e) => setForm({...form, budget_line_id: e.target.value})}
                  className="w-full bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-2 text-sm"
                  data-testid="finance-zapis-budget-line">
                  <option value="">— bez przypisania —</option>
                  {budgetLines.map(ln => (
                    <option key={ln.id} value={ln.id}>
                      {ln.category} → {ln.name} (plan: {ln.plan_netto_computed?.toLocaleString('pl-PL') || 0} zł)
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Netto (zł)</label>
              <Input type="number" step="0.01" value={form.netto} onChange={(e) => setForm({...form, netto: e.target.value})}
                placeholder="0.00" className="no-spinner bg-[#131C2F] border-[#2A3B59] text-white"
                data-testid="finance-zapis-netto" />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-[#94A3B8] block mb-1">Uwagi</label>
              <Input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}
                className="bg-[#131C2F] border-[#2A3B59] text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}
              className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] hover:text-white">Anuluj</Button>
            <Button onClick={submit} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="finance-zapis-submit">
              {editing ? 'Zapisz' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// =========================== RACHUNEK WYNIKOW ===========================
const RachunekWynikowPanel = ({ year, onTileClick }) => {
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
      toast.error(e.response?.data?.detail || 'Błąd');
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
      toast.error(e.response?.data?.detail || 'Nie można usunac');
    }
  };

  const fetchRW = () => {
    setLoading(true);
    api.get(`/finance/rachunek-wynikow?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Błąd pobierania rachunku'))
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
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  useEffect(() => {
    fetchRW();
    fetchAllKody();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  if (loading) return <Card className="bg-[#19243C] border-[#2A3B59]"><CardContent className="p-6 text-[#94A3B8]">Ładowanie...</CardContent></Card>;
  if (!data) return null;

  const { summary, ratios, groups } = data;
  const monthsHeader = PL_MONTHS_SHORT;
  // Renderujemy panel platnosci nad tabela (kontrachenci do zaplaty / my do zaplaty / przeterminowane)

  const renderRow = (label, monthly, total, opts = {}) => (
    <tr className={`border-t-2 border-[#2A3B59] ${opts.bg || ''}`} data-testid={opts.testid}>
      <td className={`p-2 border-r-2 border-[#2A3B59] ${opts.labelClass || 'text-white'} sticky left-0 ${opts.bg || 'bg-[#19243C]'} z-10`}>
        {opts.indent && <span className="ml-4" />}
        {label}
      </td>
      {monthly.map((v, i) => (
        <td key={i} className={`p-1 text-right text-xs border-r border-[#2A3B59] ${opts.valClass || 'text-[#CBD5E1]'}`}>{(opts.numFmt || fmtNum)(v)}</td>
      ))}
      <td className={`p-2 text-right font-bold border-l-2 border-[#2A3B59] ${opts.totalClass || 'text-white'} bg-[#131C2F]`}>{total === '-' ? '-' : (opts.numFmt || fmtNum)(total)}</td>
    </tr>
  );

  const toggle = (k) => setExpanded(s => ({ ...s, [k]: !s[k] }));

  return (
    <>
      {/* Podsumowanie platnosci - tylko w Rachunek wynikow */}
      <PaymentSummaryPanel onTileClick={onTileClick} year={year} />
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-white">Rachunek wyników {year}</CardTitle>
          <Button onClick={() => setShowAddKod(true)}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="rw-add-kod-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycje kosztowa
          </Button>
        </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm finance-grid-table" data-testid="finance-rw-table">
          <thead className="bg-[#131C2F] text-[#94A3B8] sticky top-0">
            <tr>
              <th className="p-2 text-left border-r-2 border-[#2A3B59] sticky left-0 bg-[#131C2F] z-20">Pozycja</th>
              {monthsHeader.map((m, i) => <th key={i} className="p-1 text-right text-xs min-w-[60px] border-r border-[#2A3B59]">{m}</th>)}
              <th className="p-2 text-right border-l-2 border-[#2A3B59]">SUMA</th>
            </tr>
          </thead>
          <tbody>
            {renderRow('PRZYCHODY NETTO', summary.przychody_netto.monthly, summary.przychody_netto.total,
              { bg: 'bg-[#4F6343]/15', labelClass: 'text-[#4F6343] font-bold', totalClass: 'text-[#4F6343]', testid: 'rw-przychody' })}
            {renderRow('SUMA KOSZTOW', summary.suma_kosztow.monthly, summary.suma_kosztow.total,
              { bg: 'bg-[#DC4A3A]/10', labelClass: 'text-[#DC4A3A] font-bold', totalClass: 'text-[#DC4A3A]', testid: 'rw-koszty' })}
            {renderRow('PODATEK', summary.podatek.monthly, summary.podatek.total,
              { labelClass: 'text-[#CBD5E1]', testid: 'rw-podatek' })}
            {renderRow('KAUCJA GIR', summary.kaucja_gir.monthly, summary.kaucja_gir.total,
              { labelClass: 'text-[#94A3B8]' })}
            {renderRow('KAUCJA DW', summary.kaucja_dw.monthly, summary.kaucja_dw.total,
              { labelClass: 'text-[#94A3B8]' })}
            {renderRow('WYNIK NETTO', summary.wynik_netto.monthly, summary.wynik_netto.total,
              { bg: 'bg-[#D4AF37]/15', labelClass: 'text-[#D4AF37] font-bold', totalClass: 'text-[#D4AF37]', testid: 'rw-wynik' })}
            {renderRow('ILOSC GODZIN', summary.godziny.monthly, summary.godziny.total,
              { labelClass: 'text-[#94A3B8]' })}

            {/* Wskaźniki */}
            <tr><td colSpan={14} className="p-1 bg-[#131C2F] text-[#94A3B8] text-xs uppercase border-y-2 border-[#2A3B59]">Wskaźniki / R-G</td></tr>
            {renderRow('Koszt R-G (firma + pracownik)', ratios.koszt_rg_firma_pracownik, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Przychody / R-G', ratios.przychody_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty / R-G', ratios.koszty_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty budowy / R-G', ratios.koszty_budowy_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}
            {renderRow('Koszty ogolne / R-G', ratios.koszty_ogolne_rg, '-', { labelClass: 'text-[#94A3B8] italic', valClass: 'text-[#CBD5E1] text-xs italic' })}

            {/* Groups */}
            {['kp','kbb','ksb','ksp'].map(g => (
              <React.Fragment key={g}>
                <tr className="border-t-4 border-[#4F6343] hover:bg-[#131C2F]/50 cursor-pointer" onClick={() => toggle(g)} data-testid={`rw-group-toggle-${g}`}>
                  <td className="p-2 text-white font-semibold border-r-2 border-[#2A3B59] sticky left-0 bg-[#19243C] z-10">
                    {expanded[g] ? <ChevronDown className="inline h-4 w-4 mr-1" /> : <ChevronRight className="inline h-4 w-4 mr-1" />}
                    {groups[g].label}
                  </td>
                  {groups[g].monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#CBD5E1] border-r border-[#2A3B59]">{fmtNum(v)}</td>)}
                  <td className="p-2 text-right font-bold text-white bg-[#131C2F] border-l-2 border-[#2A3B59]">{fmtNum(groups[g].total)}</td>
                </tr>
                {expanded[g] && groups[g].rows.map((r) => {
                  const isEditing = editingKod?.kod_id === r.kod_id;
                  const kodMeta = allKody.find(k => k.id === r.kod_id);
                  const isCustom = !!kodMeta?.is_custom;
                  return (
                  <tr key={r.kod_id} className="border-t border-[#2A3B59] bg-[#131C2F]/30" data-testid={`rw-detail-${r.kod_id}`}>
                    <td className="p-2 pl-8 text-[#94A3B8] text-xs border-r-2 border-[#2A3B59] sticky left-0 bg-[#19243C] z-10">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editingKod.name}
                            onChange={(e) => setEditingKod({ ...editingKod, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') renameKod(r.kod_id); if (e.key === 'Escape') setEditingKod(null); }}
                            onBlur={() => renameKod(r.kod_id)}
                            className="bg-[#131C2F] border border-[#4F6343] text-white rounded px-1 py-0.5 text-xs flex-1"
                            data-testid={`rw-kod-edit-input-${r.kod_id}`} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span className="cursor-pointer hover:text-white flex-1" onClick={() => setEditingKod({ kod_id: r.kod_id, name: r.name })}
                            data-testid={`rw-kod-label-${r.kod_id}`}>
                            {r.name}
                          </span>
                          <button onClick={() => setEditingKod({ kod_id: r.kod_id, name: r.name })}
                            className="text-[#4F6343] hover:text-white opacity-50 hover:opacity-100"
                            title="Edytuj nazwe"
                            data-testid={`rw-kod-edit-btn-${r.kod_id}`}>
                            <Edit2 className="h-3 w-3" />
                          </button>
                          {isCustom && (
                            <button onClick={() => deleteKod(r.kod_id, r.name)}
                              className="text-[#9B2C2C] hover:text-white opacity-80 hover:opacity-100"
                              title="Usuń kod (tylko gdy nieuzywany)"
                              data-testid={`rw-kod-del-btn-${r.kod_id}`}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    {r.monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#94A3B8] border-r border-[#2A3B59]">{fmtNum(v)}</td>)}
                    <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#131C2F] border-l-2 border-[#2A3B59]">{fmtNum(r.total)}</td>
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
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-white">
          <DialogHeader>
            <DialogTitle>Dodaj pozycje kosztowa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Nazwa kodu</label>
              <Input value={newKod.name} onChange={(e) => setNewKod({...newKod, name: e.target.value})}
                placeholder="np. Telefony, Internet, Paliwo..." className="bg-[#131C2F] border-[#2A3B59] text-white"
                data-testid="rw-add-kod-name" />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Kategoria (do ktorej grupy)</label>
              <select value={newKod.category} onChange={(e) => setNewKod({...newKod, category: e.target.value})}
                className="w-full bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-2 text-sm"
                data-testid="rw-add-kod-category">
                <option value="KBB">KBB - Koszty budowy bezpośrednie</option>
                <option value="KSB">KSB - Koszty stałe budowy</option>
                <option value="KSP">KSP - Koszty stałe przedsiebiorstwa</option>
                <option value="KP">KP - Koszty pracy</option>
              </select>
            </div>
            <div className="text-[10px] text-[#64748B]">
              Po dodaniu kod będzie dostępny w dropdownie "Kod kosztu" w Zapisach (faktury i recznych). Można usunac kod tylko jesli nie jest używany w zadnym zapisie.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddKod(false)}
              className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] hover:text-white">Anuluj</Button>
            <Button onClick={submitNewKod} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="rw-add-kod-submit">
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Card>
    </>
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
      .catch(() => toast.error('Błąd pobierania sprzedaży'))
      .finally(() => setLoading(false));
  }, [year, month]);

  if (loading) return <Card className="bg-[#19243C] border-[#2A3B59]"><CardContent className="p-6 text-[#94A3B8]">Ładowanie...</CardContent></Card>;
  if (!data) return null;

  const { rows, totals } = data;

  return (
    <Card className="bg-[#19243C] border-[#2A3B59]">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white">
          Sprzedaż per budowa {year}{month > 0 ? ` - ${PL_MONTHS_SHORT[month-1]}` : ' (caly rok)'}
        </CardTitle>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="bg-[#131C2F] border border-[#2A3B59] text-white rounded px-2 py-1 text-sm"
            data-testid="finance-sprzedaz-month">
            <option value="0">Caly rok</option>
            {PL_MONTHS_SHORT.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <Button variant="outline" onClick={() => setShowDetails(!showDetails)}
            className="border-[#4F6343] text-[#4F6343] hover:bg-[#2A3B59] hover:text-[#4F6343]"
            data-testid="sprzedaz-toggle-details">
            {showDetails ? <><ChevronDown className="h-4 w-4 mr-1" /> Ukryj szczegóły</> : <><ChevronRight className="h-4 w-4 mr-1" /> Rozwin szczegóły (kol. E-X)</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm finance-grid-table" data-testid="finance-sprzedaz-table">
          <thead className="bg-[#131C2F] text-[#94A3B8] text-xs">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Budowa</th>
              {showDetails && <>
                <InfoHeader label="Sprzedaż" info={SPRZEDAZ_COL_INFO['Sprzedaż']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="KP" info={SPRZEDAZ_COL_INFO['KP']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="KP-alok" info={SPRZEDAZ_COL_INFO['KP-alok']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="KBB" info={SPRZEDAZ_COL_INFO['KBB']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="KBB-alok" info={SPRZEDAZ_COL_INFO['KBB-alok']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża brutto" info={SPRZEDAZ_COL_INFO['Marża brutto']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża brutto %']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="KSB" info={SPRZEDAZ_COL_INFO['KSB']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="KSP układy" info={SPRZEDAZ_COL_INFO['KSP układy']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża I" info={SPRZEDAZ_COL_INFO['Marża I']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża I %']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="KSP alok" info={SPRZEDAZ_COL_INFO['KSP alok']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża II" info={SPRZEDAZ_COL_INFO['Marża II']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża II %']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="Podatek alok" info={SPRZEDAZ_COL_INFO['Podatek alok']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="Marża III" info={SPRZEDAZ_COL_INFO['Marża III']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
                <InfoHeader label="%" info={SPRZEDAZ_COL_INFO['Marża III %']} className="p-2 text-right bg-[#131C2F]/70 text-[#D4AF37]" />
              </>}
              {/* Y-AI visible */}
              <InfoHeader label="Przychod" info={SPRZEDAZ_COL_INFO['Przychod']} className="p-2 text-right text-[#4F6343] font-bold" />
              <InfoHeader label="Koszt" info={SPRZEDAZ_COL_INFO['Koszt']} className="p-2 text-right text-[#DC4A3A] font-bold" />
              <InfoHeader label="KGIR" info={SPRZEDAZ_COL_INFO['KGIR']} className="p-2 text-right" />
              <InfoHeader label="KDW" info={SPRZEDAZ_COL_INFO['KDW']} className="p-2 text-right" />
              <InfoHeader label="Różnica" info={SPRZEDAZ_COL_INFO['Różnica']} className="p-2 text-right text-[#D4AF37] font-bold" />
              <InfoHeader label="Zysk%" info={SPRZEDAZ_COL_INFO['Zysk%']} className="p-2 text-right" />
              <InfoHeader label="Godz." info={SPRZEDAZ_COL_INFO['Godz.']} className="p-2 text-right" />
              <InfoHeader label="Przych/Rg" info={SPRZEDAZ_COL_INFO['Przych/Rg']} className="p-2 text-right" />
              <InfoHeader label="Zysk/Rg" info={SPRZEDAZ_COL_INFO['Zysk/Rg']} className="p-2 text-right" />
              <InfoHeader label="Koszt/Rg" info={SPRZEDAZ_COL_INFO['Koszt/Rg']} className="p-2 text-right" />
              <InfoHeader label="Kszt zmienny" info={SPRZEDAZ_COL_INFO['Kszt zmienny']} className="p-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={showDetails ? 30 : 13} className="p-6 text-center text-[#94A3B8]">Brak budow. Dodaj w zakladce Budowy.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.budowa_id} className="border-t border-[#2A3B59] hover:bg-[#131C2F]/50" data-testid={`sprzedaz-row-${r.budowa_id}`}>
                <td className="p-2 text-[#94A3B8]">{r.nr}</td>
                <td className="p-2 text-white font-medium">{r.name}{r.is_archived && <span className="ml-1 text-xs text-[#94A3B8]">(arch)</span>}</td>
                {showDetails && <>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#131C2F]/30">{fmtNum(r.details.sprzedaz)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#131C2F]/30">{fmtNum(r.details.kp)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#131C2F]/30">{fmtNum(r.details.kp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#131C2F]/30">{fmtNum(r.details.kbb)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#131C2F]/30">{fmtNum(r.details.kbb_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtNum(r.details.marza_brutto)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtPct(r.details.marza_brutto_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#CBD5E1] bg-[#131C2F]/30">{fmtNum(r.details.ksb)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#131C2F]/30">{fmtNum(r.details.ksp_uklady_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtNum(r.details.marza1)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtPct(r.details.marza1_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#131C2F]/30">{fmtNum(r.details.ksp_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtNum(r.details.marza2)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtPct(r.details.marza2_pct)}</td>
                  <td className="p-2 text-right text-xs text-[#94A3B8] bg-[#131C2F]/30">{fmtNum(r.details.podatek_aloc)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtNum(r.details.marza3)}</td>
                  <td className="p-2 text-right text-xs text-[#4F6343] bg-[#131C2F]/30">{fmtPct(r.details.marza3_pct)}</td>
                </>}
                <td className="p-2 text-right text-[#4F6343] font-semibold">{fmtNum(r.visible.przychod)}</td>
                <td className="p-2 text-right text-[#DC4A3A] font-semibold">{fmtNum(r.visible.koszt)}</td>
                <td className="p-2 text-right text-xs text-[#94A3B8]">{fmtNum(r.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-xs text-[#94A3B8]">{fmtNum(r.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#D4AF37] font-bold">{fmtNum(r.visible.różnica)}</td>
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
              <tr className="border-t-2 border-[#4F6343] bg-[#131C2F]" data-testid="sprzedaz-totals-row">
                <td className="p-2 text-white font-bold" colSpan={2}>SUMA</td>
                {showDetails && totals.details && <>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#131C2F]">{fmtNum(totals.details.sprzedaż)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#131C2F]">{fmtNum(totals.details.kp)}</td>
                  <td className="p-2 text-right text-[#94A3B8] font-semibold bg-[#131C2F]">{fmtNum(totals.details.kp_aloc)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#131C2F]">{fmtNum(totals.details.kbb)}</td>
                  <td className="p-2 text-right text-[#94A3B8] font-semibold bg-[#131C2F]">{fmtNum(totals.details.kbb_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#131C2F]">{fmtNum(totals.details.marza_brutto)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#131C2F]">{fmtPct(totals.details.marza_brutto_pct)}</td>
                  <td className="p-2 text-right text-[#CBD5E1] font-semibold bg-[#131C2F]">{fmtNum(totals.details.ksb)}</td>
                  <td className="p-2 text-right text-[#94A3B8] font-semibold bg-[#131C2F]">{fmtNum(totals.details.ksp_uklady_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#131C2F]">{fmtNum(totals.details.marza1)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#131C2F]">{fmtPct(totals.details.marza1_pct)}</td>
                  <td className="p-2 text-right text-[#94A3B8] font-semibold bg-[#131C2F]">{fmtNum(totals.details.ksp_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#131C2F]">{fmtNum(totals.details.marza2)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#131C2F]">{fmtPct(totals.details.marza2_pct)}</td>
                  <td className="p-2 text-right text-[#94A3B8] font-semibold bg-[#131C2F]">{fmtNum(totals.details.podatek_aloc)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold bg-[#131C2F]">{fmtNum(totals.details.marza3)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-semibold bg-[#131C2F]">{fmtPct(totals.details.marza3_pct)}</td>
                </>}
                <td className="p-2 text-right text-[#4F6343] font-bold">{fmtNum(totals.visible.przychod)}</td>
                <td className="p-2 text-right text-[#DC4A3A] font-bold">{fmtNum(totals.visible.koszt)}</td>
                <td className="p-2 text-right text-[#94A3B8]">{fmtNum(totals.visible.kaucja_gir)}</td>
                <td className="p-2 text-right text-[#94A3B8]">{fmtNum(totals.visible.kaucja_dw)}</td>
                <td className="p-2 text-right text-[#D4AF37] font-bold">{fmtNum(totals.visible.różnica)}</td>
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
