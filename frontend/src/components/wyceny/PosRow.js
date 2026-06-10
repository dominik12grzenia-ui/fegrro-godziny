// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye, EyeOff, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, Td, PctInput, parseFloatPL2,
} from './_shared';
import { AiPolishButton } from './AiPolishButton';

export const PosRow = ({ code, position, row, collapsed, onToggle, onLocalUpdate, onDel }) => {
  // iter95cp: normalizuj quantity/kaucje do 2dp przy wczytaniu (chroni przed legacy floatami)
  const _norm = (p) => ({
    ...p,
    quantity: p?.quantity != null ? parseFloatPL2(p.quantity) : p?.quantity,
    kaucja_gir_pct: p?.kaucja_gir_pct != null ? parseFloatPL2(p.kaucja_gir_pct) : p?.kaucja_gir_pct,
    kaucja_dw_pct: p?.kaucja_dw_pct != null ? parseFloatPL2(p.kaucja_dw_pct) : p?.kaucja_dw_pct,
    koszt_budowy_pct: p?.koszt_budowy_pct != null ? parseFloatPL2(p.koszt_budowy_pct) : p?.koszt_budowy_pct,
  });
  const [edit, setEdit] = useState(_norm(position));
  useEffect(() => { setEdit(_norm(position)); }, [position]);
  // iter94: dialog uwag do pozycji glownej (widoczne w eksporcie PDF/XLSX)
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  useEffect(() => { setNotesDraft(position.notes || ''); }, [position.notes]);

  const save = async (patch) => {
    try {
      await api.patch(`/wyceny/positions/${position.id}`, patch);
      onLocalUpdate(position.id, patch);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-6 text-xs w-full focus:bg-[#152033] outline-none";

  return (
    <tr
      className={`${position.excluded ? 'bg-[#3a2c1c] text-[#94A3B8]' : 'bg-[#243049] text-white'} font-semibold transition-colors`}
      data-testid={`pos-row-${position.id}`}
    >
      <Td>
        <button onClick={onToggle} className="text-[#D4AF37] mr-1 text-[10px]" data-testid={`pos-toggle-${position.id}`}>
          {collapsed ? '▶' : '▼'}
        </button>
        <span className={`tabular-nums ${position.excluded ? 'line-through opacity-70' : ''}`}>{code}</span>
        {position.excluded && (
          <div
            className="mt-0.5 text-[8px] font-bold bg-[#F59E0B] text-[#152033] rounded px-1 py-px inline-flex items-center gap-0.5"
            data-testid={`pos-excluded-badge-${position.id}`}
            title="Pozycja wyłączona — nie jest wliczana do totali, nie pojawi się w PDF/Excel"
          >
            <Ban className="h-2.5 w-2.5" /> WYŁ.
          </div>
        )}
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
        <div className="flex items-start gap-1">
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
          <AiPolishButton
            text={edit.name}
            kind="name"
            onApply={(polished) => { setEdit({ ...edit, name: polished }); save({ name: polished }); }}
            testId={`pos-name-ai-${position.id}`}
          />
          {/* iter94: Uwagi do pozycji glownej (widoczne w PDF/XLSX dla klienta) */}
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            title={(position.notes || '').trim()
              ? `Uwagi do pozycji (widoczne w ofercie):\n${position.notes}`
              : 'Dodaj uwagi do pozycji — pojawią się w pobranej ofercie PDF/XLSX pod nazwą'}
            className={`shrink-0 mt-0.5 transition ${
              (position.notes || '').trim()
                ? 'text-[#D4AF37] hover:text-[#FCD34D]'
                : 'text-[#5F7552] hover:text-[#9DBC85]'
            }`}
            data-testid={`pos-notes-btn-${position.id}`}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* iter94: preview uwag inline (jezeli sa) - dyskretny, jasnoszary */}
        {(position.notes || '').trim() && (
          <div
            className="text-[10px] text-[#9DBC85]/80 italic mt-0.5 truncate"
            title={position.notes}
            data-testid={`pos-notes-preview-${position.id}`}
          >
            ⓘ {position.notes}
          </div>
        )}
        <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
          <DialogContent className="bg-[#152033] border-[#3D5378] text-[#F1F5F9] max-w-lg"
            data-testid={`pos-notes-dialog-${position.id}`}>
            <DialogHeader>
              <DialogTitle className="text-[#D4AF37] text-base flex items-center justify-between gap-2">
                <span>
                  Uwagi do pozycji: <span className="text-[#F1F5F9]">{position.name || '—'}</span>
                </span>
                {/* iter94: AI polish dla uwag — wyrownuje literowki i terminologie */}
                <AiPolishButton
                  text={notesDraft}
                  kind="notes"
                  onApply={(polished) => setNotesDraft(polished)}
                  title="AI: popraw pisownię i terminologię w uwagach"
                  testId={`pos-notes-ai-${position.id}`}
                />
              </DialogTitle>
              <p className="text-xs text-[#94A3B8] mt-1">
                Te uwagi pojawią się <b>pod nazwą pozycji</b> w pobranej ofercie (PDF + Excel) widzianej przez klienta.
              </p>
            </DialogHeader>
            <textarea value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={5}
              placeholder="np. Cena zawiera transport. Termin realizacji: 30 dni. Wymaga zatwierdzenia projektu wykonawczego."
              className="bg-[#0F1828] border border-[#3D5378] rounded p-2 text-sm w-full outline-none focus:border-[#D4AF37] resize-vertical text-[#F1F5F9]"
              data-testid={`pos-notes-textarea-${position.id}`} />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setNotesDraft(position.notes || ''); setNotesOpen(false); }}
                className="border-[#3D5378] text-[#CBD5E1]">
                Anuluj
              </Button>
              <Button onClick={async () => {
                const v = (notesDraft || '').trim();
                await save({ notes: v || null });
                setNotesOpen(false);
                toast.success(v ? 'Uwagi zapisane' : 'Uwagi usunięte');
              }} className="bg-[#9DBC85] hover:bg-[#C8E4B5] text-[#152033]"
                data-testid={`pos-notes-save-${position.id}`}>
                Zapisz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Td>
      <Td right>
        <input type="number" step="0.01" min="0" value={edit.quantity ?? ''}
          onChange={(e) => setEdit({ ...edit, quantity: e.target.value })}
          onBlur={() => save({ quantity: edit.quantity === '' || edit.quantity == null ? null : parseFloatPL2(edit.quantity) })}
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
      <Td right className="text-[#9DBC85] tabular-nums" title="Suma kwot narzutu z podpozycji">
        {row.narzutAmount > 0 ? fmtPLN(row.narzutAmount) : '—'}
      </Td>
      <Td right className="text-[#D4AF37] tabular-nums" title="Suma kwot marży z podpozycji">
        {row.marzaAmount > 0 ? fmtPLN(row.marzaAmount) : '—'}
      </Td>
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
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => save({ excluded: !position.excluded })}
            className={`transition ${
              position.excluded
                ? 'text-[#F59E0B] hover:text-[#FCD34D]'
                : 'text-[#5F7552] hover:text-[#F59E0B]'
            }`}
            title={position.excluded
              ? 'Włącz z powrotem do wyceny (będzie liczona i eksportowana)'
              : 'Wyłącz z wyceny (klient zrezygnował — pozycja zostanie zachowana, ale nie będzie liczona ani eksportowana)'}
            data-testid={`pos-exclude-${position.id}`}
          >
            {position.excluded ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onDel} className="text-[#CBD5E1] hover:text-[#FCA5A5]" data-testid={`pos-del-${position.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </Td>
    </tr>
  );
};

