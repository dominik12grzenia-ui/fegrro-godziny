// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { PriceBookPicker } from './PriceBookPicker';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
} from './_shared';

export const SubRow = ({ code, sub, posComputed, defaults = {}, posUnit = null, onLocalUpdate, onDel }) => {
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
        // iter95ax: SMART auto-detect jednostki z formuły.
        // - jeśli pole 'unit' jest PUSTE → ustaw automatycznie (m × m → m², m² × m → m³, ...)
        // - jeśli 'unit' już ustawiona i RÓŻNI się od wykrytej → NIE nadpisuj (user wie lepiej),
        //   tylko zostaw — warning pokazuje preview poniżej inputa
        const detectedUnit = r.unit && r.unit !== '?' ? r.unit : null;
        const unitIsEmpty = !edit.unit;
        const next = {
          ...edit,
          quantity: r.value,
          quantity_formula: v,
          unit: unitIsEmpty && detectedUnit ? detectedUnit : edit.unit,
        };
        if (unitIsEmpty && detectedUnit) {
          toast.success(`Auto-jednostka: ${detectedUnit} (z analizy wymiarowej)`);
        }
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

  // iter95ax: ręczne dopasowanie jednostki do tego co zwróciła formuła (po kliknięciu w badge ⚠)
  const applyDetectedUnit = () => {
    if (!formulaPreview || formulaPreview.error || !formulaPreview.unit || formulaPreview.unit === '?') return;
    const next = { ...edit, unit: formulaPreview.unit };
    setEdit(next); save(next);
    toast.success(`Dopasowano jednostkę: ${formulaPreview.unit}`);
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
          {formulaPreview && !formulaPreview.error && (() => {
            // iter95ax: 3 stany badge'a dla jednostki z formuły
            const detected = formulaPreview.unit && formulaPreview.unit !== '?' ? formulaPreview.unit : null;
            const current = edit.unit || '';
            const match = detected && current === detected;
            const mismatch = detected && current && current !== detected;
            const empty = detected && !current;
            return (
              <div className="absolute left-0 -bottom-3.5 text-[9px] whitespace-nowrap flex items-center gap-1"
                   data-testid={`sub-qty-preview-${sub.id}`}>
                <span className={match ? 'text-[#9DBC85]' : mismatch ? 'text-[#F59E0B]' : 'text-[#9DBC85]'}>
                  = {formulaPreview.value} {formulaPreview.unit || ''}
                </span>
                {match && <span className="text-[#9DBC85]" title="Jednostka pozycji zgadza się z analizą wymiarową">✓</span>}
                {empty && (
                  <span className="text-[#94A3B8] italic">
                    (auto-przypisze {detected} po wyjściu z pola)
                  </span>
                )}
                {mismatch && (
                  <button type="button" onClick={applyDetectedUnit}
                    className="text-[#F59E0B] font-bold hover:underline pointer-events-auto"
                    title={`Formuła zwraca ${detected}, ale wybrałeś ${current}. Kliknij aby dopasować.`}
                    data-testid={`sub-qty-fix-unit-${sub.id}`}>
                    ⚠ użyj {detected}
                  </button>
                )}
              </div>
            );
          })()}
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

