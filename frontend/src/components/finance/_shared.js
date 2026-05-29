// iter95bc: wspólne helpery i mini-komponenty wydzielone z Finance.js do dzielenia w finance/*
import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { HelpCircle } from 'lucide-react';

// Re-export ActionButton dla wygodnego importu w split-plikach
export { ActionButton } from '../ui/action-button';

export const PL_MONTHS_SHORT = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paz','Lis','Gru'];

// Numerical formatter — usuwa zera po kropce: 0.00→"0", 12.50→"12.5"
export const fmt = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0';
  return n.toFixed(2).replace(/\.?0+$/, '') || '0';
};

// Polski format PLN: 25450.5 → "25 450,50 zł"
export const fmtPLN = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0,00 zł';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
};

// Polski format bez 'zł' — do gęstych tabel
export const fmtNum = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0,00';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtPct = (v) => {
  const n = Number(v ?? 0) * 100;
  if (!isFinite(n)) return '0%';
  return n.toFixed(1).replace(/\.?0+$/, '') + '%';
};

export const SUBTABS = [
  { id: 'rw', label: 'Rachunek wyników' },
  { id: 'sprzedaz', label: 'Sprzedaż' },
  { id: 'budowy', label: 'Budowy' },
  { id: 'zapisy', label: 'Zapisy' },
];

// Słownik kolumn tabeli "Sprzedaz per budowa"
export const SPRZEDAZ_COL_INFO = {
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
    formula: 'SUMA(KP_bez_budowy) * (KP_budowy / SUMA(KP_z_budowa))',
  },
  KM: {
    title: 'KM - Koszty Materiałow',
    desc: 'Koszty zakupu materiałow przypisane wprost do tej budowy.',
    formula: 'SUMA(zapisy KM gdzie budowa = ta budowa)',
  },
  KS: {
    title: 'KS - Koszty Sprzętu',
    desc: 'Koszty zakupu/leasingu sprzętu przypisane wprost do tej budowy.',
    formula: 'SUMA(zapisy KS gdzie budowa = ta budowa)',
  },
  KP_lacznie: {
    title: 'KP lacznie',
    desc: 'KP + KP-alok',
    formula: 'KP + KP-alok',
  },
  Marza: {
    title: 'Marża',
    desc: 'Sprzedaż minus wszystkie koszty bezpośrednie i alokowane.',
    formula: 'Sprzedaż - KP_lacznie - KM - KS',
  },
  'Marza %': {
    title: 'Marża %',
    desc: 'Procent marży od sprzedaży.',
    formula: 'Marża / Sprzedaż * 100',
  },
};

export const InfoHeader = ({ label, info, className = '', align = 'right' }) => {
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
