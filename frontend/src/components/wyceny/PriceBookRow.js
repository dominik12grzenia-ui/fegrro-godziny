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

export const PriceBookRow = ({ item, onChange, onDel }) => {
  const [edit, setEdit] = useState({ name: item.name, unit: item.unit || '', unit_price_netto: item.unit_price_netto, notes: item.notes || '' });

  useEffect(() => {
    setEdit({ name: item.name, unit: item.unit || '', unit_price_netto: item.unit_price_netto, notes: item.notes || '' });
  }, [item]);

  const save = async () => {
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, {
        name: edit.name, unit: edit.unit,
        unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
        notes: edit.notes,
      });
      onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <tr className="border-b border-[#2A3B59]/40">
      <td className="p-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs" /></td>
      <td className="p-2"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs w-24" /></td>
      <td className="p-2"><Input type="number" step="0.01" value={edit.unit_price_netto}
        onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs text-right tabular-nums w-32" /></td>
      <td className="p-2"><Input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs" /></td>
      <td className="p-2 text-right">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`pricebook-del-${item.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
};

