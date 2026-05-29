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
} from './_shared';

export const LaborRow = ({ item, onLocalUpdate, onPriceChange, onDel }) => {
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

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#152033] outline-none px-1";
  const history = item.price_history || [];

  return (
    <tr className="border-b border-[#3D5378]/40 hover:bg-[#152033]/30 align-top" data-testid={`labor-row-${item.id}`}>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save}
          placeholder="np. tynkowanie ścian, malowanie..."
          className={`${inputCls} text-white`} data-testid={`labor-name-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m2 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m2: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m2-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m3 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m3: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m3-${item.id}`} />
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
                  {h.field === 'price_m2' ? 'm²' : h.field === 'price_m3' ? 'm³' : h.field}:
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

