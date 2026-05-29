// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { fmtCell, fmtCellNum } from './_shared';

export const BudgetExcelView = ({ lines, onProgressChange, onEdit, onDelete, onAddChild }) => {
  // Helper: zbuduj displayRows per typ - parent + jego dzieci (max 2 poziomy)
  const buildDisplay = (typeLines) => {
    const parents = typeLines.filter(l => !l.parent_id);
    const childrenByParent = {};
    typeLines.filter(l => l.parent_id).forEach(c => {
      if (!childrenByParent[c.parent_id]) childrenByParent[c.parent_id] = [];
      childrenByParent[c.parent_id].push(c);
    });
    const rows = [];
    let nr = 1;
    parents.forEach((p) => {
      const kids = childrenByParent[p.id] || [];
      let aggregated = null;
      if (kids.length > 0) {
        const sumPlan = kids.reduce((s, k) => s + (k.plan_netto_computed || 0), 0);
        const sumExec = kids.reduce((s, k) => s + (k.execution_netto || 0), 0);
        const sumGir = kids.reduce((s, k) => s + (k.kaucja_gir_amount || 0), 0);
        const sumDw = kids.reduce((s, k) => s + (k.kaucja_dw_amount || 0), 0);
        const sumQty = kids.reduce((s, k) => s + (k.quantity || 0), 0);
        const pct = sumPlan > 0 ? Math.round((sumExec / sumPlan) * 100) : 0;
        aggregated = { plan: sumPlan, exec: sumExec, kg: sumGir, kd: sumDw, qty: sumQty, pct };
      }
      const parentNr = nr;
      rows.push({ line: p, isChild: false, nrLabel: String(parentNr), aggregated, hasChildren: kids.length > 0 });
      kids.forEach((k, ci) => {
        rows.push({ line: k, isChild: true, nrLabel: `${parentNr}.${ci + 1}`, aggregated: null, hasChildren: false });
      });
      nr++;
    });
    return rows;
  };

  // Filtruj wedlug typu, potem zbuduj rzedy display z parentami i dziecmi
  const materialsRows = useMemo(() => buildDisplay(lines.filter(l => !l.is_income && (l.type || 'materials') === 'materials')), [lines]);
  const laborRows = useMemo(() => buildDisplay(lines.filter(l => !l.is_income && l.type === 'labor')), [lines]);
  const equipmentRows = useMemo(() => buildDisplay(lines.filter(l => !l.is_income && l.type === 'equipment')), [lines]);
  const maxRows = Math.max(materialsRows.length, laborRows.length, equipmentRows.length, 1);

  // Liczniki glownych pozycji (parent count) dla naglowkow blokow
  const materialsCount = materialsRows.filter(r => !r.isChild).length;
  const laborCount = laborRows.filter(r => !r.isChild).length;
  const equipmentCount = equipmentRows.filter(r => !r.isChild).length;

  const KAUCJA_BG = 'rgba(79, 99, 67, 0.25)';
  const PRZEROB_BG = 'rgba(212, 175, 55, 0.18)';
  const CHILD_BG = 'rgba(15, 23, 42, 0.6)'; // ciemniejsze tlo dla skladowych
  const HEADER_BG = '#4F6343';
  const HEADER_DARK = '#3F5235';
  const BORDER = '#2A3B59';
  const SEPARATOR = '#D4AF37'; // złoty pionowy separator między blokami

  // Renderuje przyciski akcji w komorce NAZWA
  const renderNameActions = (line, isChild) => (
    <div className="flex items-center gap-1">
      {isChild && <span className="text-[#D4AF37] shrink-0">↳</span>}
      <span className="truncate flex-1" style={isChild ? { color: '#94A3B8', fontStyle: 'italic' } : {}}>{line.name}</span>
      {!isChild && onAddChild && (
        <button onClick={() => onAddChild(line)} className="text-[#5F7552] hover:text-[#9DBC85] shrink-0" data-testid={`excel-add-child-${line.id}`} title="Dodaj składową kosztową">
          <Plus className="h-3 w-3" />
        </button>
      )}
      {onEdit && (
        <button onClick={() => onEdit(line)} className="text-[#94A3B8] hover:text-white shrink-0" data-testid={`excel-edit-${line.id}`} title="Edytuj">
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button onClick={() => onDelete(line.id)} className="text-[#94A3B8] hover:text-[#FCA5A5] shrink-0" data-testid={`excel-del-${line.id}`} title={isChild ? 'Usuń składową' : 'Usuń (wraz ze składowymi)'}>
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]" data-testid="budget-excel-view">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <span style={{ color: '#D4AF37' }}>▦</span> Widok zestawienia kosztorysowego
        </CardTitle>
        <p className="text-[10px] text-[#94A3B8] mt-1">
          Pełna tabela 1:1 z arkuszem wykonawczym. Kolumny <span style={{ color: '#5F7552' }}>zielone</span> = kaucje (K.GIR / K.DW). Kolumny <span style={{ color: '#D4AF37' }}>złote</span> = przeroby. Klik <Plus className="h-3 w-3 inline-block text-[#5F7552]" /> obok nazwy = dodaj składową. Pozycja z ↳ = składowa kosztowa; wartości pozycji nadrzędnej liczą się jako suma składowych.
        </p>
      </CardHeader>
      <CardContent className="p-2">
        <div className="overflow-x-auto">
        <table className="text-[9px] border-collapse w-full table-fixed" style={{ minWidth: '1400px' }} data-testid="excel-combined-table">
          <thead>
            {/* Wiersz 1: 3 grupowe naglowki */}
            <tr>
              <th colSpan={13} className="px-1 py-1 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER }}>
                MATERIAŁY ({materialsCount})
              </th>
              <th colSpan={8} className="px-1 py-1 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER, borderLeft: `2px solid ${SEPARATOR}` }}>
                ROBOCIZNA ({laborCount})
              </th>
              <th colSpan={11} className="px-1 py-1 text-center font-bold text-white border" style={{ backgroundColor: HEADER_DARK, borderColor: BORDER, borderLeft: `2px solid ${SEPARATOR}` }}>
                SPRZĘT ({equipmentCount})
              </th>
            </tr>
            {/* Wiersz 2: nazwy kolumn — krotsze etykiety */}
            <tr style={{ backgroundColor: HEADER_BG }}>
              {[
                { l: 'KOD', w: '2%' },
                { l: 'NAZWA', w: '7%' },
                { l: 'JD.', w: '2%' },
                { l: 'ILOŚĆ', w: '2%' },
                { l: 'CENA MAT.', w: '3%' },
                { l: 'BUDŻET', w: '4%' },
                { l: 'K.GIR', w: '3%' },
                { l: 'K.DW', w: '3%' },
                { l: 'B.ZW.', w: '4%' },
                { l: 'C.B.JD.', w: '3%' },
                { l: 'PRZER.M', w: '4%' },
                { l: 'K.ZAK.', w: '4%' },
                { l: 'C.ZAK.', w: '3%' },
              ].map((c, i) => (
                <th key={`m-${i}`} className="px-0.5 py-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER, width: c.w }}>{c.l}</th>
              ))}
              {[
                { l: 'KOD', w: '2%' },
                { l: 'NAZWA', w: '7%' },
                { l: 'BUDŻET', w: '4%' },
                { l: 'K.GIR', w: '3%' },
                { l: 'K.DW', w: '3%' },
                { l: 'B.ZW.', w: '4%' },
                { l: 'PRZER.R', w: '4%' },
                { l: '%', w: '2%' },
              ].map((c, i) => (
                <th key={`r-${i}`} className="px-0.5 py-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER, width: c.w, ...(i === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>{c.l}</th>
              ))}
              {[
                { l: 'KOD', w: '2%' },
                { l: 'NAZWA', w: '7%' },
                { l: 'JD.', w: '2%' },
                { l: 'ILOŚĆ', w: '2%' },
                { l: 'CENA', w: '3%' },
                { l: 'KOSZT', w: '4%' },
                { l: 'K.GIR', w: '3%' },
                { l: 'K.DW', w: '3%' },
                { l: 'B.ZW.', w: '4%' },
                { l: 'PRZER.S', w: '4%' },
                { l: '%', w: '2%' },
              ].map((c, i) => (
                <th key={`s-${i}`} className="px-0.5 py-1 text-center font-bold text-white border whitespace-nowrap" style={{ borderColor: BORDER, width: c.w, ...(i === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>{c.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(materialsRows.length === 0 && laborRows.length === 0 && equipmentRows.length === 0) ? (
              <tr><td colSpan={32} className="p-4 text-center text-[#94A3B8] border" style={{ borderColor: BORDER }}>Brak pozycji. Dodaj najpierw pozycje budżetu.</td></tr>
            ) : Array.from({ length: maxRows }, (_, i) => {
              const mRow = materialsRows[i];
              const rRow = laborRows[i];
              const sRow = equipmentRows[i];
              return (
                <tr key={i} className="hover:bg-[#0B1120]/40">
                  {/* MATERIAŁY (13 kolumn) */}
                  {mRow ? (() => {
                    const m = mRow.line;
                    const agg = mRow.aggregated;
                    // Tryb mieszany: jezeli ma dzieci -> suma; jezeli nie -> wlasne wartosci
                    const plan = agg ? agg.plan : (m.plan_netto_computed || 0);
                    const ilosc = agg ? agg.qty : (m.quantity || 0);
                    const cena = ilosc > 0 ? plan / ilosc : (m.unit_price_netto || 0);
                    const kg = agg ? agg.kg : (m.kaucja_gir_amount || 0);
                    const kd = agg ? agg.kd : (m.kaucja_dw_amount || 0);
                    const bzw = plan - kg - kd;
                    const cenaBjd = ilosc > 0 ? plan / ilosc : 0;
                    const przerob = agg ? agg.exec : (m.execution_netto || 0);
                    const cenaZakupu = ilosc > 0 ? przerob / ilosc : 0;
                    const rowBg = mRow.isChild ? CHILD_BG : undefined;
                    const cellStyle = { borderColor: BORDER, ...(rowBg ? { backgroundColor: rowBg } : {}) };
                    return (
                      <>
                        <td className="px-1 py-0.5 text-center text-[#CBD5E1] border tabular-nums" style={cellStyle}>{mRow.nrLabel}</td>
                        <td className="px-1 py-0.5 text-left text-white border" style={{ ...cellStyle, maxWidth: 0 }} title={m.name}>
                          {renderNameActions(m, mRow.isChild)}
                        </td>
                        <td className="px-0.5 py-0.5 text-center text-[#94A3B8] border" style={cellStyle}>{m.unit || '—'}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCellNum(ilosc)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(cena)}</td>
                        <td className="px-0.5 py-0.5 text-right text-white font-semibold border tabular-nums" style={cellStyle}>{fmtCell(plan)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(bzw)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#94A3B8] border tabular-nums" style={cellStyle}>{fmtCell(cenaBjd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#94A3B8] border tabular-nums" style={cellStyle}>{fmtCell(przerob)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#94A3B8] border tabular-nums" style={cellStyle}>{fmtCell(cenaZakupu)}</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 13 }, (_, j) => (
                      <td key={`em-${j}`} className="px-0.5 py-0.5 border bg-[#0B1120]/30" style={{ borderColor: BORDER }}>&nbsp;</td>
                    ))}</>
                  )}
                  {/* ROBOCIZNA (8 kolumn) */}
                  {rRow ? (() => {
                    const r = rRow.line;
                    const agg = rRow.aggregated;
                    const plan = agg ? agg.plan : (r.plan_netto_computed || 0);
                    const kg = agg ? agg.kg : (r.kaucja_gir_amount || 0);
                    const kd = agg ? agg.kd : (r.kaucja_dw_amount || 0);
                    const bzw = plan - kg - kd;
                    const przerob = agg ? agg.exec : (r.execution_netto || 0);
                    const pct = agg ? agg.pct : (r.progress_pct || 0);
                    const rowBg = rRow.isChild ? CHILD_BG : undefined;
                    const cellStyle = { borderColor: BORDER, ...(rowBg ? { backgroundColor: rowBg } : {}) };
                    return (
                      <>
                        <td className="px-1 py-0.5 text-center text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, borderLeft: `2px solid ${SEPARATOR}` }}>{rRow.nrLabel}</td>
                        <td className="px-1 py-0.5 text-left text-white border" style={{ ...cellStyle, maxWidth: 0 }} title={r.name}>
                          {renderNameActions(r, rRow.isChild)}
                        </td>
                        <td className="px-0.5 py-0.5 text-right text-white font-semibold border tabular-nums" style={cellStyle}>{fmtCell(plan)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(bzw)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className={`px-0.5 py-0.5 text-right border tabular-nums font-semibold ${pct >= 100 ? 'text-[#9B2C2C]' : pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`} style={cellStyle}>{Math.round(pct)}%</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 8 }, (_, j) => (
                      <td key={`er-${j}`} className="px-0.5 py-0.5 border bg-[#0B1120]/30" style={{ borderColor: BORDER, ...(j === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>&nbsp;</td>
                    ))}</>
                  )}
                  {/* SPRZĘT (11 kolumn) */}
                  {sRow ? (() => {
                    const s = sRow.line;
                    const agg = sRow.aggregated;
                    const plan = agg ? agg.plan : (s.plan_netto_computed || 0);
                    const ilosc = agg ? agg.qty : (s.quantity || 0);
                    const cena = ilosc > 0 ? plan / ilosc : (s.unit_price_netto || 0);
                    const kg = agg ? agg.kg : (s.kaucja_gir_amount || 0);
                    const kd = agg ? agg.kd : (s.kaucja_dw_amount || 0);
                    const bzw = plan - kg - kd;
                    const przerob = agg ? agg.exec : (s.execution_netto || 0);
                    const pct = agg ? agg.pct : (s.progress_pct || 0);
                    const rowBg = sRow.isChild ? CHILD_BG : undefined;
                    const cellStyle = { borderColor: BORDER, ...(rowBg ? { backgroundColor: rowBg } : {}) };
                    return (
                      <>
                        <td className="px-1 py-0.5 text-center text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, borderLeft: `2px solid ${SEPARATOR}` }}>{sRow.nrLabel}</td>
                        <td className="px-1 py-0.5 text-left text-white border" style={{ ...cellStyle, maxWidth: 0 }} title={s.name}>
                          {renderNameActions(s, sRow.isChild)}
                        </td>
                        <td className="px-0.5 py-0.5 text-center text-[#94A3B8] border" style={cellStyle}>{s.unit || '—'}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCellNum(ilosc)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(cena)}</td>
                        <td className="px-0.5 py-0.5 text-right text-white font-semibold border tabular-nums" style={cellStyle}>{fmtCell(plan)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kg)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || KAUCJA_BG }}>{fmtCell(kd)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#CBD5E1] border tabular-nums" style={cellStyle}>{fmtCell(bzw)}</td>
                        <td className="px-0.5 py-0.5 text-right text-[#D4AF37] font-semibold border tabular-nums" style={{ ...cellStyle, backgroundColor: rowBg || PRZEROB_BG }}>{fmtCell(przerob)}</td>
                        <td className={`px-0.5 py-0.5 text-right border tabular-nums font-semibold ${pct >= 100 ? 'text-[#9B2C2C]' : pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`} style={cellStyle}>{Math.round(pct)}%</td>
                      </>
                    );
                  })() : (
                    <>{Array.from({ length: 11 }, (_, j) => (
                      <td key={`es-${j}`} className="px-0.5 py-0.5 border bg-[#0B1120]/30" style={{ borderColor: BORDER, ...(j === 0 ? { borderLeft: `2px solid ${SEPARATOR}` } : {}) }}>&nbsp;</td>
                    ))}</>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </CardContent>
    </Card>
  );
};

