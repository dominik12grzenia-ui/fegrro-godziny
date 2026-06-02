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
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, Td, PctInput, parseFloatPL2,
} from './_shared';
import { AiPolishButton } from './AiPolishButton';

export const SubRow = ({ code, sub, posComputed, defaults = {}, posUnit = null, negotiationOn = false, onLocalUpdate, onDel }) => {
  // iter95cp: normalizuj wartosci numeryczne przy wczytaniu z bazy.
  // Stare rekordy moga miec floaty typu 92.14999999999 (legacy + float precision).
  // Zaokraglamy do 2dp w UI tak aby user nie widzial dlugich liczb.
  const _norm = (s) => ({
    ...s,
    quantity: s?.quantity != null ? parseFloatPL2(s.quantity) : s?.quantity,
    unit_price_netto: s?.unit_price_netto != null ? parseFloatPL2(s.unit_price_netto) : s?.unit_price_netto,
    narzut_zapas_pct: s?.narzut_zapas_pct != null ? parseFloatPL2(s.narzut_zapas_pct) : s?.narzut_zapas_pct,
    marza_pct: s?.marza_pct != null ? parseFloatPL2(s.marza_pct) : s?.marza_pct,
  });
  const [edit, setEdit] = useState(_norm(sub));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // iter95ae: tekst formuly (gdy input zaczyna sie od "=")
  const [qtyInput, setQtyInput] = useState(sub.quantity_formula || (sub.quantity != null ? parseFloatPL2(sub.quantity) : ''));
  useEffect(() => {
    setEdit(_norm(sub));
    setQtyInput(sub.quantity_formula || (sub.quantity != null ? parseFloatPL2(sub.quantity) : ''));
  }, [sub]);

  const save = async (override = null) => {
    const src = override || edit;
    // iter95cd: wszystkie wartosci zaokraglane do 2 miejsc po przecinku (precyzja groszowa).
    // parseFloatPL2 obsluguje PL przecinek + Math.round(*100)/100.
    const payload = {
      name: src.name || '',
      quantity: parseFloatPL2(src.quantity),
      unit: src.unit || null,
      unit_price_netto: parseFloatPL2(src.unit_price_netto),
      narzut_zapas_pct: src.narzut_zapas_pct === '' || src.narzut_zapas_pct == null
        ? null : parseFloatPL2(src.narzut_zapas_pct),
      marza_pct: src.marza_pct === '' || src.marza_pct == null
        ? null : parseFloatPL2(src.marza_pct),
      quantity_formula: src.quantity_formula || null,
      // iter95cw: koszt wykonania elementu (labor) - prognozowany koszt firmowy
      koszt_wykonania: src.koszt_wykonania === '' || src.koszt_wykonania == null
        ? null : parseFloatPL2(src.koszt_wykonania),
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
      // iter95cd: PL przecinek + zaokraglenie do 2 miejsc po przecinku
      const num = parseFloatPL2(v);
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
  // iter95cw: dla LABOR kopiuj takze koszt_wykonania - prognozowany koszt firmowy per jedn.
  const pickFromBook = (item) => {
    const next = {
      ...edit,
      name: item.name,
      unit: item.unit || edit.unit,
      unit_price_netto: item.unit_price_netto || 0,
      quantity_formula: null,
    };
    if (sub.type === 'labor' && item.koszt_wykonania != null) {
      next.koszt_wykonania = parseFloat(item.koszt_wykonania) || 0;
    }
    setEdit(next);
    setQtyInput(next.quantity ?? '');
    save(next);
    setPickerOpen(false);
    toast.success(`Wybrano: ${item.name}`);
  };

  const r = computeSubRow(edit, defaults);
  // Proporcjonalne kaucje/koszty w stosunku do zwolnionego sub-pozycji
  const ratio = posComputed.budzetZwolniony > 0 ? r.budzetZwolniony / posComputed.budzetZwolniony : 0;
  const inputCls = "bg-transparent border-0 h-6 text-xs w-full focus:bg-[#152033] outline-none";
  // placeholdery pokazuja domysla z poziomu wyceny
  // iter95bt: placeholder narzutu zalezy od typu linii (materials/labor/equipment)
  const defaultNarzutForType = sub.type === 'labor'
    ? (defaults.narzutLabor ?? 0)
    : sub.type === 'equipment'
      ? (defaults.narzutEquipment ?? 0)
      : (defaults.narzut ?? 0);
  const narzutPlaceholder = defaultNarzutForType ? String(defaultNarzutForType) : '0';
  // marza tylko dla materials
  const marzaPlaceholder = (sub.type === 'materials' || !sub.type)
    ? ((defaults.marza ?? 0) ? String(defaults.marza) : '0')
    : '—';
  const marzaDisabled = sub.type === 'labor' || sub.type === 'equipment';

  // iter95ab: tooltip historii zmian ceny + ostrzezenie ponizej minimum
  const priceHistory = sub.price_change_history || [];
  const effectiveMin = (sub.price_min != null) ? sub.price_min : null;
  const effectiveMax = (sub.price_max != null) ? sub.price_max : null;
  const currentPrice = parseFloat(edit.unit_price_netto) || 0;
  const belowMin = effectiveMin != null && currentPrice > 0 && currentPrice < effectiveMin;
  const aboveMax = effectiveMax != null && currentPrice > effectiveMax;
  // iter95bm: w trybie negocjacji - "na granicy minimum" (cena = min ± 0.01)
  const atMin = negotiationOn && effectiveMin != null && currentPrice > 0
                && Math.abs(currentPrice - effectiveMin) < 0.01;
  const historyTooltip = priceHistory.length > 0
    ? priceHistory.slice(-5).map((h) => {
        const date = (h.ts || '').slice(0, 16).replace('T', ' ');
        const minTxt = h.min_price != null ? ` (min: ${h.min_price.toFixed(2)})` : '';
        return `${date}: ${h.from_price.toFixed(2)} → ${h.to_price.toFixed(2)}${minTxt}${h.below_min ? ' ⚠ PON. MIN' : ''}`;
      }).join('\n')
    : '';

  return (
    <tr
      className={
        atMin
          ? 'bg-orange-500/15 border-l-4 border-l-orange-400 ring-1 ring-orange-400/40 animate-pulse'
          : 'bg-[#152033]/30'
      }
      data-testid={`sub-row-${sub.id}`}
      title={atMin ? `⚠ Pozycja na granicy minimum (${effectiveMin?.toFixed(2)} zł). Cena nie może być niższa.` : undefined}
    >
      <Td className="text-[#CBD5E1]">{code}</Td>
      <Td>
        <span className="text-[10px]" style={{ color: SUB_TYPE_COLOR[sub.type] }}>{SUB_TYPE_LABEL[sub.type]}</span>
      </Td>
      <Td>
        <div className="flex items-start gap-1">
          <textarea value={edit.name || ''}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            onBlur={() => save()}
            rows={1}
            title={edit.name || ''}
            placeholder="↳ nazwa"
            className="bg-transparent border-0 text-xs w-full focus:bg-[#152033] outline-none text-[#F1F5F9] resize-none overflow-hidden leading-tight pl-3 py-0.5"
            style={{ minHeight: '20px', height: 'auto' }}
            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
            data-testid={`sub-name-${sub.id}`} />
          <AiPolishButton
            text={edit.name}
            kind="name"
            onApply={(polished) => { const next = { ...edit, name: polished }; setEdit(next); save(next); }}
            testId={`sub-name-ai-${sub.id}`}
          />
        </div>
      </Td>
      <Td right>
        <div className="relative">
          <input type="text" value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={saveQty}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            className={`${inputCls} text-right tabular-nums text-[#F1F5F9] ${String(qtyInput).startsWith('=') ? 'text-[#D4AF37] font-mono' : ''}`}
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
                  <span className="text-[#CBD5E1] italic">
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
            <div className="absolute left-0 -bottom-3.5 text-[9px] text-[#CBD5E1] font-mono whitespace-nowrap pointer-events-none"
              title={`Formuła: ${sub.quantity_formula}`}>
              fx
            </div>
          )}
        </div>
      </Td>
      <Td>
        <select value={edit.unit || ''}
          onChange={(e) => { const v = e.target.value; const next = { ...edit, unit: v }; setEdit(next); save(next); }}
          className={`${inputCls} text-center text-[#F1F5F9]`}
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
          <input type="number" step="0.01"
            min={negotiationOn && effectiveMin != null ? effectiveMin : undefined}
            value={edit.unit_price_netto ?? ''}
            onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })}
            onBlur={() => save()}
            className={`${inputCls} text-right tabular-nums ${
              atMin
                ? 'text-[#FED7AA] ring-2 ring-orange-400 rounded bg-orange-500/15 font-bold'
                : belowMin
                  ? 'text-[#FCA5A5] ring-2 ring-[#DC2626] rounded bg-[#3F1A1A]/40'
                  : aboveMax
                    ? 'text-[#FCA5A5]'
                    : 'text-[#F1F5F9]'
            }`}
            title={
              atMin
                ? `⚠ MINIMUM (${effectiveMin?.toFixed(2)} zł) — nie można zejść niżej w trybie negocjacji`
                : (effectiveMin != null || effectiveMax != null)
                  ? `Cena ${effectiveMin != null ? `min: ${effectiveMin.toFixed(2)} zł` : ''}${effectiveMin != null && effectiveMax != null ? ' / ' : ''}${effectiveMax != null ? `max: ${effectiveMax.toFixed(2)} zł` : ''}`
                  : undefined
            }
            data-testid={`sub-price-${sub.id}`} />
          {/* iter95bd: warning dot ponizej min (czerwony) + popover z historia */}
          {(belowMin || priceHistory.length > 0) && (
            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`inline-block h-2.5 w-2.5 rounded-full cursor-pointer ${
                    belowMin
                      ? 'bg-[#DC2626] animate-pulse'
                      : 'bg-[#5F7552] opacity-70 hover:opacity-100'
                  }`}
                  data-testid={belowMin ? `sub-below-min-${sub.id}` : `sub-history-${sub.id}`}
                  title={belowMin ? 'Kliknij: historia + ostrzeżenie' : 'Kliknij: historia zmian ceny'}
                />
              </PopoverTrigger>
              <PopoverContent
                className="w-80 bg-[#152033] border border-[#3D5378] text-[#F1F5F9] p-3 text-xs"
                align="end"
                data-testid={`sub-price-history-popover-${sub.id}`}
              >
                {belowMin && (
                  <div className="mb-2 p-2 rounded bg-[#3F1A1A] border border-[#DC2626] text-[#FCA5A5] font-semibold">
                    ⚠ Cena {currentPrice.toFixed(2)} zł poniżej minimum ({effectiveMin?.toFixed(2)} zł)
                  </div>
                )}
                {effectiveMin != null && (
                  <div className="text-[#9DBC85]">Min: <span className="font-mono">{effectiveMin.toFixed(2)} zł</span></div>
                )}
                {effectiveMax != null && (
                  <div className="text-[#D4AF37] mb-2">Max: <span className="font-mono">{effectiveMax.toFixed(2)} zł</span></div>
                )}
                <div className="font-semibold text-[#D4AF37] mt-2 mb-1">
                  Historia zmian ({priceHistory.length}):
                </div>
                {priceHistory.length === 0 ? (
                  <div className="text-[#94A3B8] italic">Brak historii</div>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {priceHistory.slice().reverse().map((h, idx) => {
                      const date = (h.ts || '').slice(0, 16).replace('T', ' ');
                      const user = h.user_email || h.user_id || '—';
                      return (
                        <div
                          key={idx}
                          className={`p-1.5 rounded border ${
                            h.below_min ? 'border-[#DC2626] bg-[#3F1A1A]/40' : 'border-[#3D5378] bg-[#0F1828]'
                          }`}
                        >
                          <div className="text-[#94A3B8] text-[10px]">{date} · {user}</div>
                          <div className="font-mono">
                            <span className="text-[#94A3B8]">{h.from_price.toFixed(2)}</span>
                            {' → '}
                            <span className={h.below_min ? 'text-[#FCA5A5] font-bold' : 'text-[#F1F5F9]'}>
                              {h.to_price.toFixed(2)} zł
                            </span>
                            {h.min_price != null && (
                              <span className="text-[10px] text-[#94A3B8] ml-2">(min: {h.min_price.toFixed(2)})</span>
                            )}
                            {h.below_min && <span className="ml-2 text-[#DC2626] text-[10px]">⚠ PON. MIN</span>}
                          </div>
                          {h.reason && <div className="text-[10px] text-[#CBD5E1] mt-0.5">Powód: {h.reason}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
          {/* iter95ab: ikona ustawiania min/max */}
          <button
            type="button"
            onClick={() => {
              const newMin = window.prompt('Cena minimalna (zł, pusty = brak):', effectiveMin ?? '');
              if (newMin === null) return;
              const newMax = window.prompt('Cena maksymalna (zł, pusty = brak):', effectiveMax ?? '');
              if (newMax === null) return;
              const minVal = newMin.trim() === '' ? null : parseFloat(newMin.replace(',', '.'));
              const maxVal = newMax.trim() === '' ? null : parseFloat(newMax.replace(',', '.'));
              api.patch(`/wyceny/lines/${sub.id}`, { price_min: minVal, price_max: maxVal })
                .then(() => {
                  onLocalUpdate(sub.id, { price_min: minVal, price_max: maxVal });
                  toast.success('Zapisano min/max');
                })
                .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)));
            }}
            className="text-[#94A3B8] hover:text-[#D4AF37] text-[10px] px-1"
            title="Ustaw cenę minimalną / maksymalną"
            data-testid={`sub-minmax-${sub.id}`}
          >
            ⓘ
          </button>
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
          disabled={marzaDisabled}
          title={marzaDisabled ? 'Marża stosowana tylko do materiałów' : undefined}
          className={`${inputCls} text-right tabular-nums ${marzaDisabled ? 'text-[#475569] cursor-not-allowed opacity-40' : 'text-[#D4AF37]'}`}
          data-testid={`sub-marza-${sub.id}`} />
      </Td>
      <Td right className="text-[#CBD5E1]">{fmtPLN(posComputed.kaucjaGir * ratio)}</Td>
      <Td right className="text-[#CBD5E1]">{fmtPLN(posComputed.kaucjaDw * ratio)}</Td>
      <Td right className="text-[#CBD5E1]">{fmtPLN(posComputed.kosztBudowy * ratio)}</Td>
      <Td right className="text-white font-semibold">{fmtPLN(posComputed.budzet * ratio)}</Td>
      <Td right className="text-[#F1F5F9]">{fmtPLN(r.budzetZwolniony)}</Td>
      <Td right className="text-[#CBD5E1]">{fmtPLN(r.kosztPrognozowany)}</Td>
      <Td right className={(r.budzetZwolniony - r.kosztPrognozowany) >= 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>
        {fmtPLN(r.budzetZwolniony - r.kosztPrognozowany)}
      </Td>
      <Td right className={((r.budzetZwolniony - r.kosztPrognozowany) + posComputed.kaucjaDw * ratio) >= 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>
        {fmtPLN((r.budzetZwolniony - r.kosztPrognozowany) + posComputed.kaucjaDw * ratio)}
      </Td>
      <Td right>
        <button onClick={onDel} className="text-[#CBD5E1] hover:text-[#FCA5A5]" data-testid={`sub-del-${sub.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </Td>
    </tr>
  );
};

