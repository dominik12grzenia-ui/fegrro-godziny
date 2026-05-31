// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
  fmtPrice, LABOR_SUB_CATS,
} from './_shared';

export const LaborRow = ({ item, onLocalUpdate, onPriceChange, onCategoryChange, customCategories = [], onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  const save = async (extra = {}) => {
    const payload = {
      name: edit.name || '',
      price_m2: edit.price_m2 === '' || edit.price_m2 == null ? null : parseFloat(edit.price_m2),
      price_m3: edit.price_m3 === '' || edit.price_m3 == null ? null : parseFloat(edit.price_m3),
      // iter95bo: trzecia jednostka (mb/szt/kpl/godz/dzien/kg/t) - dowolna cena + jednostka
      price_other: edit.price_other === '' || edit.price_other == null ? null : parseFloat(edit.price_other),
      unit_other: (edit.unit_other || '').trim() || null,
      // iter95bm: minimum/maximum godzinowe robocizny (kopiowane do wyceny przy wyborze)
      price_min: edit.price_min === '' || edit.price_min == null ? null : parseFloat(edit.price_min),
      price_max: edit.price_max === '' || edit.price_max == null ? null : parseFloat(edit.price_max),
      // iter95bp: sub_category jak w materialach
      sub_category: edit.sub_category || null,
      ...extra,
    };
    // iter95p: czy zmienila sie cena? jezeli tak - refetch (zeby zaktualizowac price_history)
    const priceChanged = (item.price_m2 !== payload.price_m2)
      || (item.price_m3 !== payload.price_m3)
      || (item.price_other !== payload.price_other);
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      if (priceChanged) {
        await onPriceChange(item.id);
      } else {
        onLocalUpdate(item.id, payload);
      }
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#152033] outline-none px-1";
  const history = item.price_history || [];

  return (
    <tr className="border-b border-[#3D5378]/40 hover:bg-[#152033]/30 align-top" data-testid={`labor-row-${item.id}`}>
      {/* iter95bp: kategoria - jak w cenniku materialow */}
      <td className="border-r border-[#3D5378]/40 p-1">
        <select value={edit.sub_category || ''}
          onChange={(e) => {
            const newCat = e.target.value;
            setEdit({ ...edit, sub_category: newCat });
            save({ sub_category: newCat }).then(() => onCategoryChange && onCategoryChange());
          }}
          className={`${inputCls} text-[#F1F5F9]`}
          data-testid={`labor-cat-${item.id}`}>
          <option value="">— wybierz —</option>
          {[...new Set([...LABOR_SUB_CATS, ...customCategories])].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={() => save()}
          placeholder="np. tynkowanie ścian, malowanie..."
          className={`${inputCls} text-white`} data-testid={`labor-name-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m2 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m2: e.target.value })}
          onBlur={() => save()}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m2-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m3 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m3: e.target.value })}
          onBlur={() => save()}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m3-${item.id}`} />
      </td>
      {/* iter95bo: trzecia jednostka - cena + wybor jednostki (mb/szt/kpl/godz/dzien/kg/t) */}
      <td className="border-r border-[#3D5378]/40 p-1">
        <div className="flex items-center gap-0.5">
          <input type="number" step="0.01" value={edit.price_other ?? ''}
            onChange={(e) => setEdit({ ...edit, price_other: e.target.value })}
            onBlur={() => save()}
            className={`${inputCls} text-right tabular-nums text-[#9DBC85] font-semibold flex-1`}
            placeholder="—"
            data-testid={`labor-price-other-${item.id}`} />
          <span className="text-[10px] text-[#94A3B8] px-0.5">zł/</span>
          <select value={edit.unit_other || ''}
            onChange={(e) => { setEdit({ ...edit, unit_other: e.target.value }); }}
            onBlur={() => save()}
            className="bg-[#1E2A44] border border-[#3D5378] rounded h-6 text-[10px] text-[#9DBC85] px-1 outline-none focus:border-[#D4AF37] w-16"
            data-testid={`labor-unit-other-${item.id}`}>
            <option value="">—</option>
            <option value="mb">mb</option>
            <option value="szt">szt</option>
            <option value="kpl">kpl</option>
            <option value="godz">godz</option>
            <option value="dzień">dzień</option>
            <option value="kg">kg</option>
            <option value="t">t</option>
            <option value="m">m</option>
            <option value="punkt">punkt</option>
          </select>
        </div>
      </td>
      {/* iter95bm: cena min/max - kopiuje sie do wyceny przy wyborze pozycji */}
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_min ?? ''}
          onChange={(e) => setEdit({ ...edit, price_min: e.target.value })}
          onBlur={() => save()}
          className={`${inputCls} text-right tabular-nums text-[#FCA5A5]`}
          placeholder="—" title="Cena minimalna - nie da się zejść niżej w trybie negocjacji"
          data-testid={`labor-price-min-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_max ?? ''}
          onChange={(e) => setEdit({ ...edit, price_max: e.target.value })}
          onBlur={() => save()}
          className={`${inputCls} text-right tabular-nums text-[#FCD34D]`}
          placeholder="—" title="Cena maksymalna (info)"
          data-testid={`labor-price-max-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        {history.length === 0 ? (
          <span className="text-[10px] text-[#94A3B8]">— brak zmian —</span>
        ) : (
          <div className="space-y-0.5 max-h-32 overflow-y-auto" data-testid={`labor-history-${item.id}`}>
            {history.slice().reverse().map((h, i) => (
              <div key={i} className="text-[10px] flex gap-1.5 items-baseline">
                <span className="text-[#94A3B8] tabular-nums">{(h.date || '').slice(0, 10)}</span>
                <span className="text-[#CBD5E1]">
                  {h.field === 'price_m2' ? 'm²' : h.field === 'price_m3' ? 'm³' : h.field === 'price_other' ? (item.unit_other || 'inna') : h.field}:
                </span>
                <span className="text-[#FCA5A5] tabular-nums line-through">{fmtPrice(h.old)}</span>
                <span className="text-[#94A3B8]">→</span>
                <span className="text-[#9DBC85] tabular-nums font-semibold">{fmtPrice(h.new)}</span>
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="text-right pr-1 pt-1">
        <button onClick={onDel} className="text-[#CBD5E1] hover:text-[#FCA5A5]" data-testid={`labor-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

