// iter95bc: wspólne helpery i mini-komponenty wydzielone z Finance.js do dzielenia w finance/*
import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { HelpCircle } from 'lucide-react';

// Re-export ActionButton dla wygodnego importu w split-plikach
export { ActionButton } from '../ui/action-button';


// iter95dq: global event-bus dla auto-refresh paneli finansowych
// emit jak zapis sie zmienia (create/update/delete) -> wszystkie panele finanse refetchuja sie w tle
export const FINANCE_REFRESH_EVENT = 'finance:refresh';
export const emitFinanceRefresh = (source = 'unknown') => {
  try {
    window.dispatchEvent(new CustomEvent(FINANCE_REFRESH_EVENT, { detail: { source, ts: Date.now() } }));
  } catch (_e) { /* noop */ }
};
// React hook — uzywaj w komponencie aby zarejestrowac silent refetch
export const useFinanceRefresh = (handler) => {
  React.useEffect(() => {
    if (typeof handler !== 'function') return undefined;
    const cb = (e) => handler(e.detail);
    window.addEventListener(FINANCE_REFRESH_EVENT, cb);
    return () => window.removeEventListener(FINANCE_REFRESH_EVENT, cb);
  }, [handler]);
};


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


// iter94: reużywalny pasek miesięcy do włączania/wyłączania z sumy.
// Stan trzymany w localStorage per klucz. Zwraca:
//  - selectedMonths: Set<number 1..12>
//  - toggleMonth, selectAll, selectNone: metody
//  - monthsQueryParam: 'months=1,2,3' albo pusty string (gdy wszystkie 12)
//  - isAll: bool czy wszystkie zaznaczone
export const useMonthsFilter = (storageKey) => {
  const [selectedMonths, setSelectedMonths] = React.useState(() => {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) return new Set(JSON.parse(cached));
    } catch (_e) { /* ignore */ }
    return new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  React.useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify([...selectedMonths])); } catch (_e) { /* ignore */ }
  }, [selectedMonths, storageKey]);
  const toggleMonth = React.useCallback((m) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }, []);
  const selectAll = React.useCallback(() => setSelectedMonths(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), []);
  const selectNone = React.useCallback(() => setSelectedMonths(new Set()), []);
  const monthsArr = [...selectedMonths].sort((a, b) => a - b);
  const isAll = monthsArr.length === 12;
  const monthsQueryParam = isAll ? '' : `months=${monthsArr.join(',')}`;
  return { selectedMonths, toggleMonth, selectAll, selectNone, monthsQueryParam, isAll, monthsArr };
};

export const MonthsBar = ({ selectedMonths, toggleMonth, selectAll, selectNone, testIdPrefix = 'months-bar', label = 'Miesiące wliczane do sum:' }) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 py-2"
         data-testid={`${testIdPrefix}-container`}>
      <span className="text-[10px] uppercase tracking-wide text-[#94A3B8] mr-1">
        {label}
      </span>
      {PL_MONTHS_SHORT.map((label, i) => {
        const m = i + 1;
        const active = selectedMonths.has(m);
        return (
          <button
            key={m}
            onClick={() => toggleMonth(m)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition border ${
              active
                ? 'bg-[#4F6343] border-[#4F6343] text-white'
                : 'bg-[#1E2A44] border-[#3D5378] text-[#94A3B8] hover:bg-[#2A3654] line-through'
            }`}
            title={active ? `Wyłącz ${label} z sumy` : `Włącz ${label} do sumy`}
            data-testid={`${testIdPrefix}-month-${m}${active ? '-on' : '-off'}`}
          >
            {label}
          </button>
        );
      })}
      <div className="flex gap-1 ml-2">
        <button onClick={selectAll}
          className="text-[10px] text-[#D4AF37] hover:text-[#FCD34D] underline"
          data-testid={`${testIdPrefix}-all`}>
          Wszystkie
        </button>
        <span className="text-[#3D5378]">·</span>
        <button onClick={selectNone}
          className="text-[10px] text-[#94A3B8] hover:text-[#F1F5F9] underline"
          data-testid={`${testIdPrefix}-none`}>
          Żaden
        </button>
      </div>
    </div>
  );
};
