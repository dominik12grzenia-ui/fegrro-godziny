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

export const EquipmentRow = ({ item, onLocalUpdate, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  const save = async () => {
    const payload = {
      name: edit.name || '',
      price_hour: edit.price_hour === '' || edit.price_hour == null ? null : parseFloat(edit.price_hour),
      price_day: edit.price_day === '' || edit.price_day == null ? null : parseFloat(edit.price_day),
      price_month: edit.price_month === '' || edit.price_month == null ? null : parseFloat(edit.price_month),
      wynajmujacy: edit.wynajmujacy || '',
      extra_cost: edit.extra_cost === '' || edit.extra_cost == null ? null : parseFloat(edit.extra_cost),
      extra_cost_desc: edit.extra_cost_desc || '',
    };
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      onLocalUpdate(item.id, payload);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#152033] outline-none px-1";

  return (
    <tr className="border-b border-[#3D5378]/40 hover:bg-[#152033]/30" data-testid={`equipment-row-${item.id}`}>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save}
          placeholder="np. zagęszczarka, młot udarowy..."
          className={`${inputCls} text-white`} data-testid={`equipment-name-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_hour ?? ''}
          onChange={(e) => setEdit({ ...edit, price_hour: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-hour-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_day ?? ''}
          onChange={(e) => setEdit({ ...edit, price_day: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-day-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.price_month ?? ''}
          onChange={(e) => setEdit({ ...edit, price_month: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-month-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input value={edit.wynajmujacy || ''} onChange={(e) => setEdit({ ...edit, wynajmujacy: e.target.value })}
          onBlur={save}
          placeholder="np. Ramirent, własny..."
          className={`${inputCls} text-[#F1F5F9]`} data-testid={`equipment-wyn-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input type="number" step="0.01" value={edit.extra_cost ?? ''}
          onChange={(e) => setEdit({ ...edit, extra_cost: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#FCA5A5]`}
          data-testid={`equipment-extra-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 p-1">
        <input value={edit.extra_cost_desc || ''} onChange={(e) => setEdit({ ...edit, extra_cost_desc: e.target.value })}
          onBlur={save}
          placeholder="np. transport, paliwo..."
          className={`${inputCls} text-[#CBD5E1]`} data-testid={`equipment-extra-desc-${item.id}`} />
      </td>
      <td className="text-right pr-1">
        <button onClick={onDel} className="text-[#CBD5E1] hover:text-[#FCA5A5]" data-testid={`equipment-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

