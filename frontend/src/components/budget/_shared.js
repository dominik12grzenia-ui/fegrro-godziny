// iter95bc: wspólne helpery wydzielone z Budget.js do dzielenia w budget/*
export { ActionButton } from '../ui/action-button';

// Polski format PLN
export const fmtPLN = (v) =>
  `${Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

// Numerical formatter — usuwa końcowe zera ("12.50" -> "12.5")
export const num = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0';
  return n.toFixed(2).replace(/\.?0+$/, '') || '0';
};

export const fmtNum = (n) =>
  Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtCell = (v) =>
  (v == null || v === 0) ? '—' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtCellNum = (v) =>
  (v == null || v === 0) ? '0' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtQty = (v) =>
  Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtPrice = (v) =>
  `${Math.round(Number(v || 0)).toLocaleString('pl-PL')} zł`;

export const MONTHS_PL = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
export const PL_MONTHS_SHORT = MONTHS_PL;

export const SUB_TYPE_LABEL = { equipment: 'sprzęt', labor: 'robocizna', materials: 'Materiał' };
export const SUB_TYPE_ORDER = ['equipment', 'labor', 'materials'];

export const BUDGET_TYPES = {
  materials: { label: 'Materiały', short: 'M', color: '#D4AF37', bg: '#D4AF37', textOnBg: '#0B1120' },
  labor:     { label: 'Robocizna', short: 'R', color: '#5F7552', bg: '#5F7552', textOnBg: '#FFFFFF' },
  equipment: { label: 'Sprzęt',    short: 'S', color: '#94A3B8', bg: '#64748B', textOnBg: '#FFFFFF' },
};

export const TYPE_ORDER = ['labor', 'materials', 'equipment'];
