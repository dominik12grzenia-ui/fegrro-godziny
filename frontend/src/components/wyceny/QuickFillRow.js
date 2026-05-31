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
  PKG_UNITS, ZAP_UNITS, computeMaterialPerWorkUnit,
} from './_shared';

export const QuickFillRow = ({ item, posUnit, onSaved, onCancel }) => {
  const [pkgQty, setPkgQty] = useState(item.pkg_qty ?? '');
  const [pkgUnit, setPkgUnit] = useState(item.pkg_unit || 'kg');
  const [zap, setZap] = useState(item.zapotrzebowanie ?? '');
  const [zapUnit, setZapUnit] = useState(item.zap_unit || (posUnit ? `kg/${posUnit}` : ''));
  const [saving, setSaving] = useState(false);

  // iter95ab/ac: oblicz na zywo preview - uzyj sufiksu zap_unit (nie posUnit), bo uzytkownik moze wybrac jednostke rozna od pozycji
  const preview = computeMaterialPerWorkUnit({
    ...item,
    pkg_qty: pkgQty, zapotrzebowanie: zap, zap_unit: zapUnit,
  }, null);
  const previewMismatch = preview && posUnit && preview.workUnit !== posUnit;

  const save = async () => {
    if (!pkgQty || !zap || !zapUnit) { toast.error('Wszystkie 3 pola wymagane'); return; }
    setSaving(true);
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, {
        pkg_qty: parseFloat(pkgQty) || 0,
        pkg_unit: pkgUnit,
        zapotrzebowanie: parseFloat(zap) || 0,
        zap_unit: zapUnit,
      });
      onSaved({ ...item, pkg_qty: parseFloat(pkgQty), pkg_unit: pkgUnit, zapotrzebowanie: parseFloat(zap), zap_unit: zapUnit });
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  // iter95ac: pokaz wszystkie warianty, ale wyrozij pasujace do posUnit (uzytkownik moze chciec uzyc kg/m² nawet gdy pozycja jest m³)
  const isMatching = (u) => posUnit && u.endsWith('/' + posUnit);
  const zapUnitOptions = ZAP_UNITS;

  return (
    <tr className="bg-[#3F2F0A]/30 border-t border-[#F59E0B]/40">
      <td colSpan={4} className="px-3 py-2">
        <div className="text-[10px] text-[#F59E0B] mb-1.5 uppercase tracking-wide">
          ⚙ Uzupełnij aby przeliczyć cenę na 1 {posUnit || 'jd. wyrobu'}
        </div>
        <div className="grid grid-cols-12 gap-2 items-center">
          <label className="col-span-2 text-[10px] text-[#CBD5E1]">Ilość w opak.</label>
          <input type="number" step="0.01" value={pkgQty}
            onChange={(e) => setPkgQty(e.target.value)} placeholder="np. 20"
            className="col-span-2 bg-[#152033] border border-[#3D5378] rounded h-7 text-xs text-[#F1F5F9] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-pkg-qty-${item.id}`} />
          <select value={pkgUnit} onChange={(e) => setPkgUnit(e.target.value)}
            className="col-span-2 bg-[#152033] border border-[#3D5378] rounded h-7 text-xs text-[#F1F5F9] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-pkg-unit-${item.id}`}>
            {PKG_UNITS.filter((u) => u).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <label className="col-span-1 text-[10px] text-[#CBD5E1]">Zap.</label>
          <input type="number" step="0.01" value={zap}
            onChange={(e) => setZap(e.target.value)} placeholder="np. 0.3"
            className="col-span-2 bg-[#152033] border border-[#3D5378] rounded h-7 text-xs text-[#F1F5F9] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-zap-${item.id}`} />
          <select value={zapUnit} onChange={(e) => setZapUnit(e.target.value)}
            className="col-span-3 bg-[#152033] border border-[#3D5378] rounded h-7 text-xs text-[#F1F5F9] px-2 outline-none focus:border-[#D4AF37]"
            data-testid={`qf-zap-unit-${item.id}`}>
            {zapUnitOptions.map((u) => (
              <option key={u || 'empty'} value={u}>
                {`${u || '—'}${isMatching(u) ? '  ★' : ''}`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-[10px] text-[#CBD5E1]">
            Wzór: (cena + koszty inne) × zap / ilość w opak.
            {preview && (
              <span className={`ml-2 font-semibold ${previewMismatch ? 'text-[#F59E0B]' : 'text-[#9DBC85]'}`}>
                = {fmtPLN(preview.price)} zł / 1 {preview.workUnit}
                {previewMismatch && <span className="ml-1 text-[10px]" title={`Pozycja wyceny ma jednostkę ${posUnit}, a norma jest dla ${preview.workUnit}`}>≠{posUnit}</span>}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={saving}
              className="text-[10px] text-[#CBD5E1] hover:text-white px-3 py-1 border border-[#3D5378] rounded"
              data-testid={`qf-cancel-${item.id}`}>
              Anuluj
            </button>
            <button onClick={save} disabled={saving || !preview}
              className="text-[10px] bg-[#D4AF37] text-[#152033] font-semibold px-3 py-1 rounded hover:bg-[#FCD34D] disabled:opacity-40"
              data-testid={`qf-save-${item.id}`}>
              {saving ? '...' : 'Zapisz i przelicz'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
};

