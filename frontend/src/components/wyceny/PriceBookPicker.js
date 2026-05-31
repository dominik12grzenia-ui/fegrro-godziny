// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { QuickFillRow } from './QuickFillRow';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
  computeMaterialPerWorkUnit,
} from './_shared';

export const PriceBookPicker = ({ category, posUnit = null, onPick, onClose }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editRowId, setEditRowId] = useState(null); // iter95ab: szybkie uzupelnienie danych z poziomu pickera

  const reload = useCallback(() => {
    setLoading(true);
    api.get('/wyceny/cennik', { params: { category } })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.name || '').toLowerCase().includes(s) ||
      (r.sub_category || '').toLowerCase().includes(s) ||
      (r.oferent || '').toLowerCase().includes(s) ||
      (r.wynajmujacy || '').toLowerCase().includes(s)
    );
  }, [rows, q]);

  // iter95z: oblicz "efektywna" cene + jednostke uwzgledniajaca posUnit
  // iter95ac: jezeli posUnit nie pasuje, ale material MA wlasna norme (np. kg/m²) - uzyj jej i pokaz ostrzezenie
  // Zwraca { price, unit, source } gdzie source = "computed" | "computed-mismatch" | "m2"/"m3"/"hour"/.. | "raw"
  const getEffective = (it) => {
    // MATERIALS:
    if (category === 'materials') {
      // 1. Idealnie: posUnit pasuje do zap_unit
      if (posUnit) {
        const calc = computeMaterialPerWorkUnit(it, posUnit);
        if (calc) return { price: calc.price, unit: calc.workUnit, source: 'computed' };
      }
      // 2. Material ma wlasna norme (zap_unit) ale inna niz posUnit - uzyj jej
      const ownCalc = computeMaterialPerWorkUnit(it);
      if (ownCalc) {
        const mismatch = posUnit && ownCalc.workUnit !== posUnit;
        return { price: ownCalc.price, unit: ownCalc.workUnit, source: mismatch ? 'computed-mismatch' : 'computed' };
      }
    }
    // LABOR: dobierz cene zgodna z posUnit
    if (category === 'labor') {
      if (posUnit === 'm²' && it.price_m2) return { price: it.price_m2, unit: 'm²', source: 'm2' };
      if (posUnit === 'm³' && it.price_m3) return { price: it.price_m3, unit: 'm³', source: 'm3' };
      const fallback = it.price_m2 || it.price_m3 || it.unit_price_netto || 0;
      const fbUnit = it.price_m2 ? 'm²' : it.price_m3 ? 'm³' : (it.unit || '');
      return { price: fallback, unit: fbUnit, source: 'raw' };
    }
    // EQUIPMENT: godz/dzień/m-c
    if (category === 'equipment') {
      if (posUnit === 'godz' && it.price_hour) return { price: it.price_hour, unit: 'godz', source: 'hour' };
      if (posUnit === 'dzień' && it.price_day) return { price: it.price_day, unit: 'dzień', source: 'day' };
      if (posUnit === 'm-c' && it.price_month) return { price: it.price_month, unit: 'm-c', source: 'month' };
      const fallback = it.price_hour || it.price_day || it.price_month || it.unit_price_netto || 0;
      const fbUnit = it.price_hour ? 'godz' : it.price_day ? 'dzień' : it.price_month ? 'm-c' : (it.unit || '');
      return { price: fallback, unit: fbUnit, source: 'raw' };
    }
    return { price: it.unit_price_netto || 0, unit: it.unit || '', source: 'raw' };
  };

  const getExtraInfo = (it) => {
    if (category === 'materials') {
      const parts = [];
      if (it.sub_category) parts.push(it.sub_category);
      if (it.oferent) parts.push(it.oferent);
      if (it.opakowanie && it.pkg_qty) parts.push(`${it.opakowanie} ${it.pkg_qty}${it.pkg_unit || ''}`);
      if (it.zapotrzebowanie && it.zap_unit) parts.push(`norma ${it.zapotrzebowanie} ${it.zap_unit}`);
      return parts.join(' • ');
    }
    if (category === 'labor') {
      const parts = [];
      if (it.price_m2) parts.push(`m²: ${fmtPLN(it.price_m2)}`);
      if (it.price_m3) parts.push(`m³: ${fmtPLN(it.price_m3)}`);
      return parts.join(' • ');
    }
    if (category === 'equipment') {
      const parts = [];
      if (it.wynajmujacy) parts.push(it.wynajmujacy);
      if (it.price_hour) parts.push(`h: ${fmtPLN(it.price_hour)}`);
      if (it.price_day) parts.push(`d: ${fmtPLN(it.price_day)}`);
      if (it.price_month) parts.push(`m-c: ${fmtPLN(it.price_month)}`);
      return parts.join(' • ');
    }
    return '';
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-3xl wyceny-no-spin"
        data-testid={`price-picker-${category}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <BookOpen className="h-5 w-5" /> Cennik: {TYPE_LABEL[category] || category}
            {posUnit && (
              <span className="text-xs text-[#9DBC85] font-normal">
                — auto-przelicznik na <b>1 {posUnit}</b>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-[#CBD5E1]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj po nazwie, kategorii, oferencie..."
            className="bg-[#152033] border-[#3D5378] flex-1"
            data-testid="picker-search" autoFocus />
        </div>
        <div className="max-h-[60vh] overflow-y-auto border border-[#3D5378] rounded">
          {loading ? (
            <div className="text-[#CBD5E1] p-4 text-center text-sm">Ładowanie...</div>
          ) : filtered.length === 0 ? (
            <div className="text-[#CBD5E1] p-4 text-center text-sm">
              {rows.length === 0 ? 'Brak pozycji w cenniku. Dodaj je w zakładce „Ceny ' + (TYPE_LABEL[category] || '').toLowerCase() + '".' : 'Brak wyników.'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#152033] sticky top-0">
                <tr className="text-[#CBD5E1] uppercase text-[10px]">
                  <th className="text-left px-2 py-1.5">Nazwa</th>
                  <th className="text-left px-2 py-1.5">Info</th>
                  <th className="text-center px-2 py-1.5">Jedn.</th>
                  <th className="text-right px-2 py-1.5">{posUnit ? `Cena / ${posUnit}` : 'Cena'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const eff = getEffective(it);
                  // iter95ab/ac: tylko gdy material nie ma ZADNEJ normy -> wymaga uzupelnienia
                  const needsCompletion = category === 'materials' && posUnit && eff.source === 'raw';
                  const mismatch = eff.source === 'computed-mismatch';
                  const isEditing = editRowId === it.id;
                  return (
                    <React.Fragment key={it.id}>
                      <tr
                        onClick={() => { if (!needsCompletion && !isEditing) onPick({ ...it, unit_price_netto: eff.price, unit: eff.unit || it.unit }); }}
                        className={`border-t border-[#3D5378] ${needsCompletion ? 'opacity-70' : 'hover:bg-[#3F5235]/30 cursor-pointer'}`}
                        data-testid={`picker-row-${it.id}`}>
                        <td className="px-2 py-1.5 text-white">{it.name}</td>
                        <td className="px-2 py-1.5 text-[#CBD5E1] text-[10px]">{getExtraInfo(it)}</td>
                        <td className="px-2 py-1.5 text-center text-[#F1F5F9]">
                          {eff.unit || '—'}
                          {mismatch && (
                            <span className="ml-1 text-[10px] text-[#F59E0B]"
                              title={`Norma w cenniku to ${eff.unit}, ale pozycja wyceny ma ${posUnit}. Cena zostanie wstawiona jako zł/${eff.unit}.`}>
                              ≠{posUnit}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {needsCompletion ? (
                            <button onClick={(e) => { e.stopPropagation(); setEditRowId(isEditing ? null : it.id); }}
                              className="text-[#F59E0B] text-[10px] underline hover:text-[#FCD34D]"
                              data-testid={`picker-fill-${it.id}`}>
                              ⚠ uzupełnij dane
                            </button>
                          ) : (
                            <>
                              <span className={eff.source === 'computed' || (posUnit && eff.unit === posUnit)
                                ? 'text-[#9DBC85] font-semibold'
                                : mismatch ? 'text-[#F59E0B] font-semibold' : 'text-[#D4AF37] font-semibold'}>
                                {fmtPLN(eff.price)}
                              </span>
                              {(eff.source === 'computed' || mismatch) && (
                                <span className="ml-1 text-[10px] text-[#CBD5E1]"
                                  title={mismatch ? `Przeliczona, ale jednostka różni się od pozycji (${eff.unit} vs ${posUnit})` : 'Przeliczona z opakowania'}>⚙</span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                      {isEditing && (
                        <QuickFillRow item={it} posUnit={posUnit}
                          onSaved={(updated) => { setEditRowId(null); reload(); toast.success('Cennik zaktualizowany'); }}
                          onCancel={() => setEditRowId(null)} />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
            data-testid="picker-close">Anuluj</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

