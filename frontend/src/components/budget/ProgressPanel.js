// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { MONTHS_PL, fmtPLN, fmtPrice, fmtQty } from './_shared';
import { ProtokolControls } from './ProtokolControls';

export const ProgressPanel = ({ budowaId, year }) => {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState(null); // { nr, rows, totals }
  const [loading, setLoading] = useState(true);
  // Stan lokalny dla edytowanych % miesiaca rozliczeniowego (line_id -> string)
  const [edits, setEdits] = useState({});
  // iter95h: ktore pozycje sa rozwiniete (pokazuja subrows)
  const [expandedPos, setExpandedPos] = useState(() => new Set());

  const fetchData = useCallback(() => {
    if (!budowaId) return;
    setLoading(true);
    api.get(`/budget/${budowaId}/protokol-view/${year}/${month}`)
      .then((r) => { setData(r.data); setEdits({}); })
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [budowaId, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveCell = async (lineId, currentMiesiacPct, prevPct, plan, value) => {
    const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
    if (prevPct + pct > 100.01) {
      const max = Math.max(0, 100 - prevPct);
      toast.error(`Pozostało do rozdysponowania: ${max.toFixed(1)}% (poprzednie miesiące: ${prevPct.toFixed(1)}%)`);
      return null;
    }
    if (Math.abs(pct - currentMiesiacPct) < 0.001) return pct;
    try {
      // iter72+: protokol operuje na pozycjach (BudgetPosition), lineId tutaj = position_id
      await api.post(`/budget/positions/${lineId}/progress`, { year, month, progress_pct: pct });
      // Optymistyczna aktualizacja danych
      setData((d) => {
        if (!d) return d;
        const newRows = d.rows.map((row) => {
          if (row.type === 'line' && row.id === lineId) {
            const miesiac_val = Math.round(plan * pct / 100 * 100) / 100;
            const narast_pct = Math.min(100, prevPct + pct);
            const narast_val = Math.round(plan * narast_pct / 100 * 100) / 100;
            return { ...row, miesiac_pct: pct, miesiac_val, narast_pct, narast_val };
          }
          return row;
        });
        // Przelicz totale
        const lineRows = newRows.filter(r => r.type === 'line');
        const sum_budzet = lineRows.reduce((s, r) => s + (r.plan_netto || 0), 0);
        const sum_narast = lineRows.reduce((s, r) => s + (r.narast_val || 0), 0);
        const sum_prev = lineRows.reduce((s, r) => s + (r.prev_val || 0), 0);
        const sum_miesiac = lineRows.reduce((s, r) => s + (r.miesiac_val || 0), 0);
        return {
          ...d, rows: newRows,
          totals: {
            plan_netto: sum_budzet, narast_val: sum_narast, prev_val: sum_prev, miesiac_val: sum_miesiac,
            narast_pct: sum_budzet ? sum_narast / sum_budzet * 100 : 0,
            prev_pct: sum_budzet ? sum_prev / sum_budzet * 100 : 0,
            miesiac_pct: sum_budzet ? sum_miesiac / sum_budzet * 100 : 0,
          },
        };
      });
      return pct;
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
      return null;
    }
  };

  // iter95h: zapis % subpozycji + auto-przeliczenie % pozycji (suma wazona)
  const saveSubCell = async (posRow, subId, value) => {
    const sub = (posRow.subrows || []).find((s) => s.id === subId);
    if (!sub) return null;
    const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
    if ((sub.prev_pct || 0) + pct > 100.01) {
      const max = Math.max(0, 100 - (sub.prev_pct || 0));
      toast.error(`Subpozycja: pozostało ${max.toFixed(1)}% (poprzednie mc: ${(sub.prev_pct || 0).toFixed(1)}%)`);
      return null;
    }
    try {
      // Zapis subpozycji - klucz: budget_line_id
      await api.post(`/budget/lines/${subId}/progress`, { year, month, progress_pct: pct });
      // Wylicz nowy % pozycji jako srednia wazona z subrows
      const updatedSubs = (posRow.subrows || []).map((s) =>
        s.id === subId
          ? { ...s, miesiac_pct: pct, miesiac_val: Math.round(s.plan_netto * pct / 100 * 100) / 100,
              narast_pct: Math.min(100, (s.prev_pct || 0) + pct),
              narast_val: Math.round(s.plan_netto * Math.min(100, (s.prev_pct || 0) + pct) / 100 * 100) / 100 }
          : s
      );
      const sub_plan_total = updatedSubs.reduce((acc, s) => acc + (s.plan_netto || 0), 0) || 1;
      const new_pos_pct = updatedSubs.reduce((acc, s) => acc + (s.plan_netto || 0) * (s.miesiac_pct || 0), 0) / sub_plan_total;
      const new_prev_pct = updatedSubs.reduce((acc, s) => acc + (s.plan_netto || 0) * (s.prev_pct || 0), 0) / sub_plan_total;
      // Zapisz tez % pozycji (zeby alokacje O/P/Q dalej dzialaly)
      try {
        await api.post(`/budget/positions/${posRow.id}/progress`, { year, month, progress_pct: Math.round(new_pos_pct * 100) / 100 });
      } catch (e) {
        // Nie blokujemy - subpozycja juz zapisana
      }
      // Optymistyczna aktualizacja
      setData((d) => {
        if (!d) return d;
        const newRows = d.rows.map((row) => {
          if (row.type === 'line' && row.id === posRow.id) {
            const narast_pct = Math.min(100, new_prev_pct + new_pos_pct);
            return {
              ...row, subrows: updatedSubs, sub_has_progress: true,
              miesiac_pct: new_pos_pct,
              miesiac_val: Math.round(row.plan_netto * new_pos_pct / 100 * 100) / 100,
              prev_pct: new_prev_pct,
              prev_val: Math.round(row.plan_netto * new_prev_pct / 100 * 100) / 100,
              narast_pct, narast_val: Math.round(row.plan_netto * narast_pct / 100 * 100) / 100,
            };
          }
          return row;
        });
        // Przelicz totale
        const lineRows = newRows.filter(r => r.type === 'line');
        const sum_budzet = lineRows.reduce((s, r) => s + (r.plan_netto || 0), 0);
        const sum_narast = lineRows.reduce((s, r) => s + (r.narast_val || 0), 0);
        const sum_prev = lineRows.reduce((s, r) => s + (r.prev_val || 0), 0);
        const sum_miesiac = lineRows.reduce((s, r) => s + (r.miesiac_val || 0), 0);
        return {
          ...d, rows: newRows,
          totals: {
            plan_netto: sum_budzet, narast_val: sum_narast, prev_val: sum_prev, miesiac_val: sum_miesiac,
            narast_pct: sum_budzet ? sum_narast / sum_budzet * 100 : 0,
            prev_pct: sum_budzet ? sum_prev / sum_budzet * 100 : 0,
            miesiac_pct: sum_budzet ? sum_miesiac / sum_budzet * 100 : 0,
          },
        };
      });
      return pct;
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
      return null;
    }
  };

  const toggleExpand = (posId) => {
    setExpandedPos((prev) => {
      const n = new Set(prev);
      if (n.has(posId)) n.delete(posId); else n.add(posId);
      return n;
    });
  };

  if (loading) return <div className="text-[#94A3B8] text-sm">Ładuję...</div>;
  if (!data || data.rows.length === 0) {
    return (
      <Card className="bg-[#131C2F] border-[#2A3B59]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-white text-base">Protokół zaawansowania robót</CardTitle>
            <ProtokolControls month={month} setMonth={setMonth} budowaId={budowaId} year={year} />
          </div>
        </CardHeader>
        <CardContent className="pt-6 text-[#94A3B8] text-sm text-center">
          Brak pozycji budżetowych. Dodaj najpierw pozycje w zakładce „Budżet".
        </CardContent>
      </Card>
    );
  }

  const t = data.totals;
  const olive = '#4F6343';
  const oliveDark = '#3F5235';
  const oliveStage = '#5F7552';

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-white text-base">
              PROTOKÓŁ STANU ZAAWANSOWANIA ROBÓT NR {data.nr} — {MONTHS_PL[month - 1]} {year}
            </CardTitle>
            <p className="text-xs text-[#94A3B8] mt-1">
              Wpisz <strong>% wykonania w bieżącym miesiącu</strong> w kolumnie „MIESIĄC ROZLICZENIOWY". Pozostałe wartości wyliczają się automatycznie.
            </p>
          </div>
          <ProtokolControls month={month} setMonth={setMonth} budowaId={budowaId} year={year} />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-xs border-collapse" data-testid="progress-table">
          <thead>
            {/* Naglowek - dwa rzedy, olive green w brandingu strony */}
            <tr>
              <th colSpan={6} className="bg-[#0B1120]"></th>
              <th colSpan={2} className="p-1.5 text-center font-bold text-white border border-[#2A3B59]" style={{ backgroundColor: olive }}>NARASTAJĄCO</th>
              <th colSpan={2} className="p-1.5 text-center font-bold text-white border border-[#2A3B59]" style={{ backgroundColor: olive }}>POPRZEDNI MIESIĄC</th>
              <th colSpan={2} className="p-1.5 text-center font-bold text-white border border-[#2A3B59]" style={{ backgroundColor: olive }}>MIESIĄC ROZLICZENIOWY</th>
            </tr>
            <tr style={{ backgroundColor: oliveDark }}>
              <th className="p-1.5 text-center font-bold text-white border border-[#2A3B59] w-10">LP.</th>
              <th className="p-1.5 text-left font-bold text-white border border-[#2A3B59] min-w-[280px]">Robocizna</th>
              <th className="p-1.5 text-center font-bold text-white border border-[#2A3B59] w-14">Jd.</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">Ilość</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-20">Cena</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">Wartość</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">WARTOŚĆ</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">%</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">WARTOŚĆ</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">%</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-24">WARTOŚĆ</th>
              <th className="p-1.5 text-right font-bold text-white border border-[#2A3B59] w-16">%</th>
            </tr>
          </thead>
          <tbody className="bg-[#131C2F]">
            {data.rows.map((row, idx) => {
              if (row.type === 'section') {
                return (
                  <tr key={`s-${idx}`} style={{ backgroundColor: oliveStage }}>
                    <td className="border border-[#2A3B59] p-1.5"></td>
                    <td colSpan={11} className="border border-[#2A3B59] p-1.5 font-bold text-white uppercase tracking-wide">
                      ▣ {row.stage_name || row.category}
                    </td>
                  </tr>
                );
              }
              const editedVal = edits[row.id];
              const inputVal = editedVal !== undefined ? editedVal : (row.miesiac_pct || 0);
              const hasSubs = (row.subrows || []).length > 0;
              const isExpanded = expandedPos.has(row.id);
              const subLocked = row.sub_has_progress;  // gdy True - % pozycji wyliczane z subrows
              return (
                <React.Fragment key={row.id}>
                <tr className="hover:bg-[#0B1120]/40" data-testid={`progress-row-${row.id}`}>
                  <td className="border border-[#2A3B59] p-1.5 text-center text-[#CBD5E1] tabular-nums">{row.lp}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-left text-white">
                    {hasSubs && (
                      <button type="button" onClick={() => toggleExpand(row.id)}
                        className="mr-1.5 text-[#D4AF37] hover:text-[#FCE99A] text-xs"
                        data-testid={`progress-expand-${row.id}`}
                        title={isExpanded ? 'Zwiń podpozycje' : `Rozwiń ${row.subrows.length} podpozycji`}>
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    )}
                    {row.name}
                    {hasSubs && (
                      <span className="ml-2 text-[10px] text-[#94A3B8]">({row.subrows.length} podpoz.)</span>
                    )}
                  </td>
                  <td className="border border-[#2A3B59] p-1.5 text-center text-[#94A3B8]">{row.unit || '—'}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtQty(row.quantity)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPrice(row.unit_price_netto)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums font-semibold">{fmtPLN(row.plan_netto)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#5F7552] tabular-nums">{fmtPLN(row.narast_val)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#5F7552] tabular-nums">{(row.narast_pct || 0).toFixed(2)}%</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#94A3B8] tabular-nums">{fmtPLN(row.prev_val)}</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#94A3B8] tabular-nums">{(row.prev_pct || 0).toFixed(2)}%</td>
                  <td className="border border-[#2A3B59] p-1.5 text-right text-[#D4AF37] tabular-nums font-semibold">{fmtPLN(row.miesiac_val)}</td>
                  <td className="border border-[#2A3B59] p-0 text-right" style={{ backgroundColor: '#1A2540' }}>
                    {subLocked ? (
                      <div className="text-[#D4AF37] text-right text-xs font-bold px-1.5 py-1.5"
                           title="% wyliczone automatycznie ze średniej ważonej podpozycji">
                        {(row.miesiac_pct || 0).toFixed(2)}% 🔒
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={inputVal}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          onBlur={async (e) => {
                            await saveCell(row.id, row.miesiac_pct || 0, row.prev_pct || 0, row.plan_netto, e.target.value);
                            setEdits((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
                          }}
                          className="w-full bg-transparent text-[#D4AF37] text-right text-xs font-bold pl-1.5 pr-5 py-1.5 outline-none focus:bg-[#0B1120] no-spinner"
                          data-testid={`progress-input-${row.id}`}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#D4AF37] text-xs font-bold pointer-events-none">%</span>
                      </div>
                    )}
                  </td>
                </tr>
                {/* iter95h: subrows - rozwijane R/M/S z wlasnym % */}
                {isExpanded && (row.subrows || []).map((sub) => {
                  const subEditedVal = edits[`sub:${sub.id}`];
                  const subInputVal = subEditedVal !== undefined ? subEditedVal : (sub.miesiac_pct || 0);
                  const subTypeColor = sub.type === 'labor' ? '#9DBC85' : sub.type === 'equipment' ? '#D4AF37' : '#CBD5E1';
                  return (
                    <tr key={sub.id} className="bg-[#0B1120]/30 text-[11px]" data-testid={`progress-subrow-${sub.id}`}>
                      <td className="border border-[#2A3B59] p-1 text-center text-[#64748B]">↳</td>
                      <td className="border border-[#2A3B59] p-1 pl-8 text-left">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded mr-1" style={{ backgroundColor: '#2A3B59', color: subTypeColor }}>
                          {sub.type_label || sub.type}
                        </span>
                        <span className="text-[#CBD5E1]">{sub.name}</span>
                      </td>
                      <td className="border border-[#2A3B59] p-1" colSpan={3}></td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(sub.plan_netto)}</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#5F7552] tabular-nums">{fmtPLN(sub.narast_val)}</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#5F7552] tabular-nums">{(sub.narast_pct || 0).toFixed(2)}%</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#94A3B8] tabular-nums">{fmtPLN(sub.prev_val)}</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#94A3B8] tabular-nums">{(sub.prev_pct || 0).toFixed(2)}%</td>
                      <td className="border border-[#2A3B59] p-1 text-right text-[#D4AF37] tabular-nums">{fmtPLN(sub.miesiac_val)}</td>
                      <td className="border border-[#2A3B59] p-0 text-right" style={{ backgroundColor: '#0B1830' }}>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={subInputVal}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [`sub:${sub.id}`]: e.target.value }))}
                            onBlur={async (e) => {
                              await saveSubCell(row, sub.id, e.target.value);
                              setEdits((prev) => { const n = { ...prev }; delete n[`sub:${sub.id}`]; return n; });
                            }}
                            className="w-full bg-transparent text-[#D4AF37] text-right text-xs font-bold pl-1.5 pr-5 py-1 outline-none focus:bg-[#0B1120] no-spinner"
                            data-testid={`progress-sub-input-${sub.id}`}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#D4AF37] text-xs font-bold pointer-events-none">%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </React.Fragment>
              );
            })}
            {/* RAZEM */}
            <tr className="font-bold" style={{ backgroundColor: olive }}>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5 text-center text-white">RAZEM</td>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5"></td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{fmtPLN(t.plan_netto)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{fmtPLN(t.narast_val)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{Math.round(t.narast_pct || 0)}%</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{fmtPLN(t.prev_val)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-white tabular-nums">{Math.round(t.prev_pct || 0)}%</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-[#D4AF37] tabular-nums font-bold" data-testid="progress-total-miesiac-val">{fmtPLN(t.miesiac_val)}</td>
              <td className="border border-[#2A3B59] p-1.5 text-right text-[#D4AF37] tabular-nums font-bold">{Math.round(t.miesiac_pct || 0)}%</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

