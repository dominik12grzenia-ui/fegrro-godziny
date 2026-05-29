import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { ChevronDown, ChevronRight, Plus, Archive, ArchiveRestore, Trash2, Edit2, AlertTriangle, HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { toast } from 'sonner';

// iter95bc: subkomponenty wydzielone z Finance.js (refaktor)
import { BudowyPanel } from './finance/BudowyPanel';
import { DiscrepancyDetailsModal } from './finance/DiscrepancyDetailsModal';
import { FakturowniaSyncWarning } from './finance/FakturowniaSyncWarning';
import { NipLookup } from './finance/NipLookup';
import { PaymentSummaryPanel } from './finance/PaymentSummaryPanel';
import { QuickAddZapis } from './finance/QuickAddZapis';
import { RachunekWynikowPanel } from './finance/RachunekWynikowPanel';
import { SprzedazPanel } from './finance/SprzedazPanel';
import { ZapisyPanel } from './finance/ZapisyPanel';


const PL_MONTHS_SHORT = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paz','Lis','Gru'];

// ============= NIP LOOKUP (Biala Lista MF) =============
// iter95bc: NipLookup wydzielony do ./finance/NipLookup.js


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
          className="w-80 bg-[#152033] border-[#3D5378] text-[#F1F5F9] text-xs p-4"
          align="start"
          side="bottom">
          <div className="font-semibold text-[#D4AF37] text-sm mb-2">{info.title}</div>
          <div className="text-[#F1F5F9] mb-3 leading-relaxed">{info.desc}</div>
          {info.formula && (
            <div className="pt-2 border-t border-[#3D5378]">
              <div className="text-[10px] uppercase tracking-wide text-[#CBD5E1] mb-1">Wzor</div>
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
// iter95bc: FakturowniaSyncWarning wydzielony do ./finance/FakturowniaSyncWarning.js


// =================== MODAL: SZYBKI DODAJ ZAPIS (koszt bez faktury) ===================
// iter95bc: QuickAddZapis wydzielony do ./finance/QuickAddZapis.js


// =================== PANEL: PODSUMOWANIE PLATNOSCI ===================
// iter95bc: PaymentSummaryPanel wydzielony do ./finance/PaymentSummaryPanel.js


// ============= MODAL: SZCZEGOLY ROZBIEZNOSCI FAKTUROWNIA =============
// iter95bc: DiscrepancyDetailsModal wydzielony do ./finance/DiscrepancyDetailsModal.js


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
      <div className="flex flex-wrap items-center gap-2 border-b border-[#3D5378] pb-2">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            data-testid={`finance-subtab-${t.id}`}
            className={`px-3 py-1.5 rounded-t text-sm font-semibold transition-colors ${
              active === t.id
                ? 'bg-[#4F6343] text-white'
                : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378] hover:text-white'
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
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] font-semibold"
            data-testid="finance-quick-add-zapis-btn"
          >
            <Plus className="h-4 w-4 mr-1" /> Dodaj zapis
          </Button>
          <span className="text-[#CBD5E1] text-sm">Rok:</span>
          <Input
            type="number"
            min="2020" max="2099"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
            className="w-24 bg-[#1E2A44] border-[#3D5378] text-white h-8"
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
// iter95bc: BudowyPanel wydzielony do ./finance/BudowyPanel.js


// =========================== ZAPISY / FAKTURY ===========================
// iter95bc: ZapisyPanel wydzielony do ./finance/ZapisyPanel.js


// =========================== RACHUNEK WYNIKOW ===========================
// iter95bc: RachunekWynikowPanel wydzielony do ./finance/RachunekWynikowPanel.js


// =========================== SPRZEDAZ ===========================
// iter95bc: SprzedazPanel wydzielony do ./finance/SprzedazPanel.js


export default Finance;
