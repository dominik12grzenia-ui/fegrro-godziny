// iter95aw: wspólne helpery i mini-komponenty używane przez wiele podkomponentów Wycen.
// Wcześniej inline w /app/frontend/src/components/Wyceny.js — wydzielone w refaktorze.
import React, { useState, useEffect } from 'react';

export const fmtPLN = (v) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

export const TYPE_LABEL = { materials: 'Materiał', labor: 'Robocizna', equipment: 'Sprzęt' };
export const TYPE_COLOR = { materials: '#F1F5F9', labor: '#9DBC85', equipment: '#D4AF37' };

export const SUB_TYPE_LABEL = { labor: 'robocizna', materials: 'Materiał', equipment: 'Sprzęt' };
export const SUB_TYPE_COLOR = { labor: '#9DBC85', materials: '#D4AF37', equipment: '#7AB3D6' };

export const UNITS = ['', 'mb', 'm²', 'm³', 'szt', 'kg', 't', 'godz', 'dzień', 'm-c', 'kpl'];

// iter95bi: PRZENIESIONE z Wyceny.js (zguba po refaktorze iter95bc).
// Stale dla cennikow materialow + helper przelicznika ceny na jednostke wyrobu.
export const MATERIAL_SUB_CATS = ['izolacje', 'betony', 'stal', 'murowane', 'drobnica', 'pozostałe'];

export const PKG_UNITS = ['', 'kg', 'l', 'm²', 'm³', 'mb', 'szt', 'kpl', 't', 'rol', 'opak.'];

// jd. do jd. = norma zuzycia (np. kg na 1 m2 ulozonej posadzki)
export const ZAP_UNITS = [
  '',
  'kg/m²', 'kg/m³', 'kg/mb', 'kg/szt', 'kg/kpl',
  'l/m²', 'l/m³', 'l/mb', 'l/szt',
  'm²/m²', 'm²/m³', 'm²/mb', 'm²/szt',
  'm³/m²', 'm³/m³', 'm³/mb', 'm³/szt',
  'mb/m²', 'mb/m³', 'mb/mb', 'mb/szt',
  'szt/m²', 'szt/m³', 'szt/mb', 'szt/szt', 'szt/kpl',
  't/m³',
];

// ile kosztuje material na 1 jednostke wyrobu (np. m² sciany).
// Wzor: (cena_oferty + koszty_inne) × zapotrzebowanie / pkg_qty
// Wymaga: zap_unit konczacy sie na "/" + workUnit (np. "kg/m²"), pkg_qty>0, zap>0.
// Jezeli workUnit nie podany - uzyj sufiksu zap_unit jako workUnit (np. "kg/m²" -> "m²").
export const computeMaterialPerWorkUnit = (it, workUnit = null) => {
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

export const UNIT_DIM = {
  'm': { m: 1 }, 'cm': { m: 1, scale: 0.01 }, 'mm': { m: 1, scale: 0.001 },
  'mb': { m: 1 }, 'm²': { m: 2 }, 'm³': { m: 3 },
  'kg': { kg: 1 }, 't': { kg: 1, scale: 1000 },
  'l': { l: 1 }, 'szt': { szt: 1 }, 'kpl': { kpl: 1 }, 'godz': { godz: 1 }, 'h': { godz: 1 },
};

export const dimToUnit = (dim) => {
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
  return '?';
};

export const evalFormula = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s.startsWith('=')) return null;
  s = s.slice(1).trim();
  if (!s) return { error: 'Pusta formuła' };
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
  const tokens = [];
  let cleanExpr = '';
  const re = /(\d+(?:\.\d+)?)\s*(m²|m³|cm|mm|mb|kg|l|szt|kpl|godz|t|h|m)?(?=\s|[+\-*/()]|$|[a-zA-ZąęóśłżźćńĄĘÓŚŁŻŹĆŃ])|([+\-*/()])|([a-zA-ZąęóśłżźćńĄĘÓŚŁŻŹĆŃ]+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) {
      const val = parseFloat(m[1]);
      const dim = {};
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
    } else if (m[4]) {
      // iter95ax: nieznany identyfikator (zmienna/funkcja) → odrzuć
      return { error: `Niepoprawna formuła: nieznany identyfikator "${m[4]}"` };
    }
  }
  if (!cleanExpr) return { error: 'Brak liczb' };
  if (!/^[\d.+\-*/()\s]+$/.test(cleanExpr)) return { error: 'Niepoprawna formuła' };
  let value;
  try {
    // eslint-disable-next-line no-new-func
    value = Function('"use strict"; return (' + cleanExpr + ')')();
  } catch (e) { return { error: 'Błąd składni' }; }
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) return { error: 'Wynik niepoprawny' };
  const dim = {};
  let lastOp = '*';
  tokens.forEach((t) => {
    if (t.type === 'op') {
      lastOp = t.val;
    } else if (t.type === 'num') {
      const sign = lastOp === '/' ? -1 : 1;
      if (lastOp === '*' || lastOp === '/') {
        Object.keys(t.dim).forEach((k) => { dim[k] = (dim[k] || 0) + sign * t.dim[k]; });
      }
    }
  });
  const unit = dimToUnit(dim);
  return { value: Math.round(value * 10000) / 10000, unit, error: null };
};

export const computeSubRow = (sub, defaults = {}) => {
  const qty = parseFloat(sub.quantity) || 0;
  const cena = parseFloat(sub.unit_price_netto) || 0;
  const narzutPct = parseFloat(sub.narzut_zapas_pct ?? defaults.narzut ?? 0) || 0;
  const marzaPct = parseFloat(sub.marza_pct ?? defaults.marza ?? 0) || 0;
  const budzetZwolniony = qty * cena * (1 + narzutPct / 100 + marzaPct / 100);
  const kosztPrognozowany = qty * cena * (1 + narzutPct / 100);
  return { qty, cena, budzetZwolniony, kosztPrognozowany, narzutPct, marzaPct };
};

export const computePosRow = (p, defaults = {}) => {
  const subs = p.slots || [];
  let budzetZwolniony = 0, kosztPrognozowany = 0;
  subs.forEach((s) => {
    const r = computeSubRow(s, defaults);
    budzetZwolniony += r.budzetZwolniony;
    kosztPrognozowany += r.kosztPrognozowany;
  });
  const manualQty = parseFloat(p.quantity);
  const qty = !isNaN(manualQty) && manualQty > 0
    ? manualQty
    : (subs.length > 0 ? Math.max(...subs.map((s) => parseFloat(s.quantity) || 0)) : 0);
  const girPct = parseFloat(p.kaucja_gir_pct ?? defaults.gir ?? 2);
  const dwPct = parseFloat(p.kaucja_dw_pct ?? defaults.dw ?? 2);
  const kosztPct = parseFloat(p.koszt_budowy_pct ?? defaults.koszt ?? 2);
  const kaucjaGir = budzetZwolniony * girPct / 100;
  const kaucjaDw = budzetZwolniony * dwPct / 100;
  const kosztBudowy = budzetZwolniony * kosztPct / 100;
  const budzet = budzetZwolniony + kaucjaGir + kaucjaDw + kosztBudowy;
  const cena = qty > 0 ? budzet / qty : 0;
  const prognozy = budzetZwolniony - kosztPrognozowany;
  const zyskPlusDw = prognozy + kaucjaDw;
  return { qty, cena, budzet, kaucjaGir, kaucjaDw, kosztBudowy, budzetZwolniony, kosztPrognozowany, prognozy, zyskPlusDw };
};

export const Th = ({ children, w, tip }) => (
  <th className="bg-[#3F5235]/80 text-white font-semibold text-[10px] uppercase tracking-wide
                  border border-[#3D5378] px-2 py-2 text-center align-middle cursor-help"
      title={tip || undefined} style={w ? { minWidth: w } : null}>
    {children}{tip ? <span className="ml-1 text-[#D4AF37]">ⓘ</span> : null}
  </th>
);

// iter95bk: Td (wraper na <td>) zostal zgubiony przy refaktoryzacji Wyceny.js → wyceny/*. 
// Przywrocony zgodnie z oryginalna implementacja (kolory zaktualizowane do nowej palety #3D5378).
export const Td = ({ children, right = false, className = '' }) => (
  <td className={`border border-[#3D5378] px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className}`}>
    {children}
  </td>
);

export const PctInput = ({ label, testId, value, onSave }) => {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <label className="flex items-center gap-1.5 text-xs text-[#F1F5F9]">
      <span>{label}:</span>
      <input
        type="number" step="0.1" min="0" max="100"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSave(v)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        className="w-16 bg-[#152033] border border-[#3D5378] rounded text-[#D4AF37] text-right tabular-nums font-bold px-1.5 py-0.5 outline-none focus:border-[#D4AF37]"
        data-testid={testId}
      />
      <span className="text-[#CBD5E1]">%</span>
    </label>
  );
};
