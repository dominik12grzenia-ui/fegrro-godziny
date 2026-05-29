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

export const MaterialRow = ({ item, onLocalUpdate, onCategoryChange, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  // iter95p: zapis bez triggera fetch - aktualizuje tylko lokalnie (zachowuje focus)
  const save = async (extra = {}) => {
    // iter95y: gdy onBlur przekazuje event, ignoruj (uzywaj wylacznie czystego patcha)
    const safeExtra = extra && typeof extra === 'object' && !extra.nativeEvent && !extra.target ? extra : {};
    const payload = {
      name: edit.name || '',
      unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
      oferent: edit.oferent || '',
      opakowanie: edit.opakowanie || '',
      pkg_qty: edit.pkg_qty === '' || edit.pkg_qty == null ? null : parseFloat(edit.pkg_qty),
      pkg_unit: edit.pkg_unit || '',
      zapotrzebowanie: edit.zapotrzebowanie === '' || edit.zapotrzebowanie == null ? null : parseFloat(edit.zapotrzebowanie),
      zap_unit: edit.zap_unit || '',
      liczba_warstw: edit.liczba_warstw === '' || edit.liczba_warstw == null ? null : parseFloat(edit.liczba_warstw),
      koszty_inne_do_jd: edit.koszty_inne_do_jd === '' || edit.koszty_inne_do_jd == null ? null : parseFloat(edit.koszty_inne_do_jd),
      notes: edit.notes || '',
      sub_category: edit.sub_category || '',
      ...safeExtra,
    };
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      onLocalUpdate(item.id, payload);  // optimistic update parent state
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#152033] outline-none px-1";
  // iter95aa: podswietl pola wymagane do przelicznika (cena/jd. wyrobu)
  const calcReady = computeMaterialPerWorkUnit(edit);
  const missing = !calcReady;
  const pkgMissing = missing && (!edit.pkg_qty || parseFloat(edit.pkg_qty) <= 0);
  const zapMissing = missing && (!edit.zapotrzebowanie || parseFloat(edit.zapotrzebowanie) <= 0);
  const zapUnitMissing = missing && (!edit.zap_unit || !String(edit.zap_unit).includes('/'));
  const hintCls = "bg-[#3F2F0A]/40 ring-1 ring-[#F59E0B]/60";
  const hintTitle = "Uzupełnij aby aktywować przelicznik ceny na jd. wyrobu";

  return (
    <tr className="border-b border-[#3D5378]/40 hover:bg-[#152033]/30" data-testid={`mat-row-${item.id}`}>
      <td className="border-r border-[#3D5378]/40">
        <select value={edit.sub_category || ''}
          onChange={(e) => { setEdit({ ...edit, sub_category: e.target.value }); save({ sub_category: e.target.value }).then(onCategoryChange); }}
          className={`${inputCls} text-[#F1F5F9]`}>
          {MATERIAL_SUB_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="border-r border-[#3D5378]/40">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save} className={`${inputCls} text-white`} data-testid={`mat-name-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40">
        <input type="number" step="0.01" value={edit.unit_price_netto ?? ''}
          onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right text-[#D4AF37] tabular-nums`} data-testid={`mat-price-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40">
        <input value={edit.oferent || ''} onChange={(e) => setEdit({ ...edit, oferent: e.target.value })}
          onBlur={save} className={`${inputCls} text-[#F1F5F9]`} />
      </td>
      <td className="border-r border-[#3D5378]/40">
        <input value={edit.opakowanie || ''} onChange={(e) => setEdit({ ...edit, opakowanie: e.target.value })}
          onBlur={save} placeholder="wiaderko/paleta..."
          className={`${inputCls} text-[#F1F5F9]`} />
      </td>
      <td className={`border-r border-[#3D5378]/40 ${pkgMissing ? hintCls : ''}`} title={pkgMissing ? hintTitle : undefined}>
        <input type="number" step="0.001" value={edit.pkg_qty ?? ''}
          onChange={(e) => setEdit({ ...edit, pkg_qty: e.target.value })}
          onBlur={save} placeholder={pkgMissing ? 'wpisz' : ''}
          className={`${inputCls} text-right tabular-nums text-[#F1F5F9]`}
          data-testid={`mat-pkg-qty-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40">
        <select value={edit.pkg_unit || ''}
          onChange={(e) => { const v = e.target.value; setEdit({ ...edit, pkg_unit: v }); save({ pkg_unit: v }); }}
          className={`${inputCls} text-[#CBD5E1]`} data-testid={`mat-pkg-unit-${item.id}`}>
          {PKG_UNITS.map((u) => <option key={u || 'empty'} value={u}>{u || '—'}</option>)}
        </select>
      </td>
      <td className={`border-r border-[#3D5378]/40 ${zapMissing ? hintCls : ''}`} title={zapMissing ? hintTitle : undefined}>
        <input type="number" step="0.001" value={edit.zapotrzebowanie ?? ''}
          onChange={(e) => setEdit({ ...edit, zapotrzebowanie: e.target.value })}
          onBlur={save} placeholder={zapMissing ? 'wpisz' : ''}
          className={`${inputCls} text-right tabular-nums text-[#F1F5F9]`}
          data-testid={`mat-zap-${item.id}`} />
      </td>
      <td className={`border-r border-[#3D5378]/40 ${zapUnitMissing ? hintCls : ''}`} title={zapUnitMissing ? hintTitle : undefined}>
        <select value={edit.zap_unit || ''}
          onChange={(e) => { const v = e.target.value; setEdit({ ...edit, zap_unit: v }); save({ zap_unit: v }); }}
          className={`${inputCls} text-[#CBD5E1]`} data-testid={`mat-zap-unit-${item.id}`}>
          {ZAP_UNITS.map((u) => <option key={u || 'empty'} value={u}>{u || '—'}</option>)}
        </select>
      </td>
      <td className="border-r border-[#3D5378]/40">
        <input type="number" step="0.5" value={edit.liczba_warstw ?? ''}
          onChange={(e) => setEdit({ ...edit, liczba_warstw: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#F1F5F9]`} />
      </td>
      <td className="border-r border-[#3D5378]/40">
        <input type="number" step="0.01" value={edit.koszty_inne_do_jd ?? ''}
          onChange={(e) => setEdit({ ...edit, koszty_inne_do_jd: e.target.value })}
          onBlur={save} placeholder="zł/jd"
          className={`${inputCls} text-right tabular-nums text-[#D4AF37]`}
          data-testid={`mat-koszty-inne-${item.id}`} />
      </td>
      <td className="border-r border-[#3D5378]/40 px-2 py-1 text-right tabular-nums"
          data-testid={`mat-per-work-${item.id}`}>
        {(() => {
          const r = computeMaterialPerWorkUnit(edit);
          if (!r) {
            const need = [];
            if (pkgMissing) need.push('ilość');
            if (zapMissing) need.push('zapotrzebowanie');
            if (zapUnitMissing) need.push('jd./jd.');
            const tip = need.length > 0 ? 'Brakuje: ' + need.join(', ') : hintTitle;
            return <span className="text-[#F59E0B] text-[10px] italic" title={tip}>⚠ uzupełnij</span>;
          }
          return (
            <span className="text-[#9DBC85] font-semibold" title={`${fmtPLN(r.price)} zł / 1 ${r.workUnit}`}>
              {fmtPLN(r.price)} <span className="text-[10px] text-[#CBD5E1]">/ {r.workUnit}</span>
            </span>
          );
        })()}
      </td>
      <td className="border-r border-[#3D5378]/40">
        <input value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
          onBlur={save} className={`${inputCls} text-[#CBD5E1]`} />
      </td>
      <td className="text-right pr-1">
        <button onClick={onDel} className="text-[#CBD5E1] hover:text-[#FCA5A5]" data-testid={`mat-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

