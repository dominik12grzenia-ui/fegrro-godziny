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
  UNITS, evalFormula, computeSubRow, computePosRow, Th, Td, PctInput,
} from './_shared';

export const PosRow = ({ code, position, row, collapsed, onToggle, onLocalUpdate, onDel }) => {
  const [edit, setEdit] = useState(position);
  useEffect(() => { setEdit(position); }, [position]);

  const save = async (patch) => {
    try {
      await api.patch(`/wyceny/positions/${position.id}`, patch);
      onLocalUpdate(position.id, patch);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-6 text-xs w-full focus:bg-[#152033] outline-none";

  return (
    <tr className="bg-[#243049] text-white font-semibold" data-testid={`pos-row-${position.id}`}>
      <Td>
        <button onClick={onToggle} className="text-[#D4AF37] mr-1 text-[10px]" data-testid={`pos-toggle-${position.id}`}>
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="tabular-nums">{code}</span>
      </Td>
      <Td><span className="text-[#D4AF37] text-[10px] hidden sm:inline">Pozycja Główna</span>
        {/* iter95am/an + iter95ba: chipy PC/PC↓/PC↑/PUM w kompaktowym grid 2×2 — niska wysokość wiersza na mobile */}
        <div className="grid grid-cols-2 gap-0.5 sm:mt-1 max-w-[64px]" data-testid={`pos-divisor-${position.id}`}>
          <button
            type="button"
            onClick={() => save({ include_in_pc: !edit.include_in_pc })}
            title={edit.include_in_pc ? 'Usuń z sumy PC' : 'Wlicz do wskaźnika PC (zł/m² PC)'}
            className={`text-[8px] font-bold px-1 py-px rounded transition border leading-tight ${
              edit.include_in_pc
                ? 'bg-[#9DBC85] text-[#152033] border-[#9DBC85]'
                : 'border-[#5F7552]/50 text-[#5F7552] hover:text-[#9DBC85] hover:border-[#9DBC85]/60'
            }`}
            data-testid={`pos-pc-${position.id}`}
          >PC</button>
          <button
            type="button"
            onClick={() => save({ include_in_pc_podziemie: !edit.include_in_pc_podziemie })}
            title={edit.include_in_pc_podziemie ? 'Usuń z sumy PC podziemie' : 'Wlicz do wskaźnika PC podziemie (zł/m²)'}
            className={`text-[8px] font-bold px-1 py-px rounded transition border leading-tight ${
              edit.include_in_pc_podziemie
                ? 'bg-[#9DBC85] text-[#152033] border-[#9DBC85]'
                : 'border-[#5F7552]/50 text-[#5F7552] hover:text-[#9DBC85] hover:border-[#9DBC85]/60'
            }`}
            data-testid={`pos-pc-pod-${position.id}`}
          >PC↓</button>
          <button
            type="button"
            onClick={() => save({ include_in_pc_nadziemie: !edit.include_in_pc_nadziemie })}
            title={edit.include_in_pc_nadziemie ? 'Usuń z sumy PC nadziemie' : 'Wlicz do wskaźnika PC nadziemie (zł/m²)'}
            className={`text-[8px] font-bold px-1 py-px rounded transition border leading-tight ${
              edit.include_in_pc_nadziemie
                ? 'bg-[#9DBC85] text-[#152033] border-[#9DBC85]'
                : 'border-[#5F7552]/50 text-[#5F7552] hover:text-[#9DBC85] hover:border-[#9DBC85]/60'
            }`}
            data-testid={`pos-pc-nad-${position.id}`}
          >PC↑</button>
          <button
            type="button"
            onClick={() => save({ include_in_pum: !edit.include_in_pum })}
            title={edit.include_in_pum ? 'Usuń z sumy PUM' : 'Wlicz do wskaźnika PUM (zł/m² PUM)'}
            className={`text-[8px] font-bold px-1 py-px rounded transition border leading-tight ${
              edit.include_in_pum
                ? 'bg-[#9DBC85] text-[#152033] border-[#9DBC85]'
                : 'border-[#5F7552]/50 text-[#5F7552] hover:text-[#9DBC85] hover:border-[#9DBC85]/60'
            }`}
            data-testid={`pos-pum-${position.id}`}
          >PUM</button>
        </div>
      </Td>
      <Td>
        <textarea value={edit.name || ''}
          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={() => save({ name: edit.name })}
          rows={1}
          title={edit.name || ''}
          className={`bg-transparent border-0 text-xs w-full focus:bg-[#152033] outline-none text-white font-semibold resize-none overflow-hidden leading-tight py-0.5`}
          style={{ minHeight: '20px', height: 'auto' }}
          onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
          data-testid={`pos-name-${position.id}`} />
      </Td>
      <Td right>
        <input type="number" step="0.01" min="0" value={edit.quantity ?? ''}
          onChange={(e) => setEdit({ ...edit, quantity: e.target.value })}
          onBlur={() => save({ quantity: edit.quantity === '' || edit.quantity == null ? null : parseFloat(edit.quantity) || 0 })}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          placeholder="wpisz"
          className="bg-[#152033] border border-[#5F7552]/60 rounded h-7 text-xs w-full text-right tabular-nums text-[#D4AF37] font-bold px-2 outline-none focus:border-[#D4AF37] focus:bg-[#152033] hover:border-[#9DBC85]"
          data-testid={`pos-qty-${position.id}`} />
      </Td>
      <Td>
        <select value={edit.unit || ''}
          onChange={(e) => { const v = e.target.value; setEdit({ ...edit, unit: v }); save({ unit: v || null }); }}
          className="bg-[#152033] border border-[#5F7552]/60 rounded h-7 text-xs w-full text-center text-[#F1F5F9] px-1 outline-none focus:border-[#D4AF37]"
          data-testid={`pos-unit-${position.id}`}>
          {UNITS.map((u) => <option key={u || 'empty'} value={u}>{u || '—'}</option>)}
          {/* iter95v: zachowaj custom unit zaimportowany z Excela jezeli nie jest w UNITS */}
          {edit.unit && !UNITS.includes(edit.unit) && (
            <option key="custom" value={edit.unit}>{edit.unit}</option>
          )}
        </select>
      </Td>
      <Td right className="text-[#CBD5E1] font-semibold" data-testid={`pos-cena-${position.id}`}>
        {row.cena ? new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(row.cena) : '—'}
      </Td>
      <Td right className="text-[#94A3B8]">—</Td>
      <Td right className="text-[#94A3B8]">—</Td>
      <Td right>{fmtPLN(row.kaucjaGir)}</Td>
      <Td right>{fmtPLN(row.kaucjaDw)}</Td>
      <Td right>{fmtPLN(row.kosztBudowy)}</Td>
      <Td right>{fmtPLN(row.budzet)}</Td>
      <Td right className="font-bold">{fmtPLN(row.budzetZwolniony)}</Td>
      <Td right className="text-[#D4AF37] tabular-nums" data-testid={`pos-koszt-progn-${position.id}`}>
        {fmtPLN(row.kosztPrognozowany)}
      </Td>
      <Td right className={row.prognozy >= 0 ? 'text-[#9DBC85] font-semibold' : 'text-[#FCA5A5] font-semibold'}
          data-testid={`pos-zysk-${position.id}`}>
        {fmtPLN(row.prognozy)}
      </Td>
      <Td right className={row.zyskPlusDw >= 0 ? 'text-[#9DBC85] font-semibold' : 'text-[#FCA5A5] font-semibold'}
          data-testid={`pos-zysk-dw-${position.id}`}>
        {fmtPLN(row.zyskPlusDw)}
      </Td>
      <Td right>
        <button onClick={onDel} className="text-[#CBD5E1] hover:text-[#FCA5A5]" data-testid={`pos-del-${position.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Td>
    </tr>
  );
};

