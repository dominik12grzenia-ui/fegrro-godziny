// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { ArrowLeft, BookOpen, Briefcase, Calendar, ChevronDown, ChevronLeft, ChevronRight, FileBarChart, FileDown, FilePlus, FileSpreadsheet, FileText, FolderTree, Pencil, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { BUDGET_TYPES, MONTHS_PL, SUB_TYPE_LABEL, SUB_TYPE_ORDER, fmtCellNum, fmtNum, num } from './_shared';

export const BudgetExcelTemplateView = ({ positions, stages, lines, budowaInfo, loading, year, allocMonth, setAllocMonth, allocations, equalDistribution, setEqualDistribution, onAddPosition, onEditPosition, onDeletePosition, onAddSubposition, onEditLine, onAddChildLine, onDeleteLine, onSaveLine }) => {
  // iter82: stan modalu z opisem kolumny po klikniciu w naglowek
  const [infoCol, setInfoCol] = useState(null);
  // iter95g: modal z rozbiciem Q (skąd się wziął)
  const [showQBreakdown, setShowQBreakdown] = useState(false);
  // Pozycje per etap (zachowaj kolejnosc z `stages`)
  const positionsByStage = useMemo(() => {
    const m = {};
    positions.forEach((p) => {
      const sid = p.stage_id || '__none__';
      if (!m[sid]) m[sid] = [];
      m[sid].push(p);
    });
    return m;
  }, [positions]);

  // Sloty per pozycja per typ (parent_id=null)
  // iter88: obsluga LEGACY duplicate slots tego samego typu - lista zamiast pojedynczego
  const slotsByPosition = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.position_id || ln.parent_id) return;
      if (!m[ln.position_id]) m[ln.position_id] = {};
      const t = ln.type || 'materials';
      if (!m[ln.position_id][t]) m[ln.position_id][t] = [];
      m[ln.position_id][t].push(ln);
    });
    return m;
  }, [lines]);

  // Skladowe per slot
  const childrenByParent = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.parent_id) return;
      if (!m[ln.parent_id]) m[ln.parent_id] = [];
      m[ln.parent_id].push(ln);
    });
    return m;
  }, [lines]);

  // Oblicz wartosci kolumn dla pojedynczej linii (slotu)
  // iter77: kaucje (H/I) oraz koszt budowy (J) zaciagane z backendu PER LINIA (effective_*_pct + *_amount)
  // iter80: P/Q dla slotu typu 'labor' (R) z allocations.slots
  const computeRow = (line) => {
    const kids = line ? (childrenByParent[line.id] || []) : [];
    const qty = kids.length > 0 ? kids.reduce((s, k) => s + (k.quantity || 0), 0) : (line?.quantity || 0);
    let plan = line?.plan_netto_computed || 0;
    let exec = line?.execution_netto || 0;
    let H = line?.kaucja_gir_amount || 0;
    let I = line?.kaucja_dw_amount || 0;
    let J = line?.koszt_budowy_amount || 0;
    if (kids.length > 0) {
      plan = kids.reduce((s, k) => s + (k.plan_netto_computed || 0), 0);
      exec = kids.reduce((s, k) => s + (k.execution_netto || 0), 0);
      H = kids.reduce((s, k) => s + (k.kaucja_gir_amount || 0), 0);
      I = kids.reduce((s, k) => s + (k.kaucja_dw_amount || 0), 0);
      J = kids.reduce((s, k) => s + (k.koszt_budowy_amount || 0), 0);
    }
    const cena = qty > 0 ? plan / qty : (line?.unit_price_netto || 0);
    const G = plan;
    const K = G - H - I - J;
    // L = forecast_cost: jezeli pozycja ma dzieci, sumujemy forecast_cost dzieci, w przeciwnym razie z linii
    let L = null;
    let forecastNote = line?.forecast_note || null;
    if (kids.length > 0) {
      const childForecasts = kids.filter(k => k.forecast_cost != null);
      if (childForecasts.length > 0) {
        L = childForecasts.reduce((s, k) => s + Number(k.forecast_cost || 0), 0);
      }
    } else if (line?.forecast_cost != null) {
      L = Number(line.forecast_cost);
    }
    // M = K - L (Budżet Zwolniony minus Koszt Prognozowany) - prognozowany zysk
    const M = (L != null) ? K - L : null;
    const N = exec;
    const O = 0;
    // iter80: P i Q tylko dla slotu typu 'labor' (R), z allocations.slots[slot_id]
    const isLaborSlot = line && !line.parent_id && (line.type || 'materials') === 'labor';
    const slotAlloc = isLaborSlot ? (allocations?.slots?.[line.id]) : null;
    const P = slotAlloc?.P || 0;
    const Q = slotAlloc?.Q || 0;
    const R = O + P + Q + N;
    // iter95: S = R/K × 100 (Koszty Razem / Budżet Zwolniony). Wczesniej R/N dawalo astronomiczne wartosci
    // gdy N=0 a P/Q duze. R/K pokazuje % wykorzystania realnego budzetu.
    const S = K > 0 ? (R / K) * 100 : 0;
    const T = (L != null) ? L - R : null;
    const U = K - R;
    const V = (M != null) ? M - U : null;
    return { qty, cena, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, forecastNote };
  };

  // Suma slotow danej pozycji
  // iter79: O - na poziomie pozycji (z allocations.positions)
  // iter80: P i Q - sumowane z slotow (faktycznie wpadaja tylko z slotu labor)
  const computePositionRow = (positionId) => {
    const slots = slotsByPosition[positionId] || {};
    const aggregate = { qty: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, hasL: false, M: 0, hasM: false, N: 0, O: 0, P: 0, Q: 0, R: 0, U: 0 };
    let hasL = false;
    SUB_TYPE_ORDER.forEach((t) => {
      const slotsArr = slots[t] || [];
      slotsArr.forEach((slot) => {
        const r = computeRow(slot);
        aggregate.qty += r.qty;
        aggregate.G += r.G;
        aggregate.H += r.H;
        aggregate.I += r.I;
        aggregate.J += r.J;
        aggregate.K += r.K;
        if (r.L != null) { aggregate.L += r.L; hasL = true; }
        aggregate.N += r.N;
        aggregate.P += r.P;  // P trafia tylko ze slotu labor (R)
        aggregate.Q += r.Q;
      });
    });
    // iter79: O alokowane na poziomie pozycji
    const alloc = allocations?.positions?.[positionId];
    aggregate.O = alloc?.O || 0;
    aggregate.R = aggregate.O + aggregate.P + aggregate.Q + aggregate.N;
    aggregate.U = aggregate.K - aggregate.R;
    aggregate.hasL = hasL;
    aggregate.M = hasL ? aggregate.K - aggregate.L : null;
    aggregate.S = aggregate.K > 0 ? (aggregate.R / aggregate.K) * 100 : 0;
    aggregate.T = hasL ? aggregate.L - aggregate.R : null;
    aggregate.V = hasL ? aggregate.M - aggregate.U : null;
    aggregate.cena = aggregate.qty > 0 ? aggregate.G / aggregate.qty : 0;
    return aggregate;
  };

  const BORDER = '#2A3B59';
  const STAGE_BG = '#3F5235';
  const POS_BG = '#19243C';
  const SUB_BG = '#0B1120';
  const HEADER_BG = '#4F6343';
  const KAUCJA_BG = 'rgba(212, 175, 55, 0.12)';
  const EXEC_BG = 'rgba(95, 117, 82, 0.14)';
  const STICKY = { position: 'sticky', left: 0, zIndex: 5, backgroundColor: undefined };

  // Naglowki kolumn 1:1 z arkusza
  // iter82: kazda kolumna ma description + formula - klikalny modal z detalami
  const cols = [
    { k: 'A', label: 'Kod', w: 60, desc: 'Kod pozycji w hierarchii: 101 (pozycja), 101.1 (slot), 101.1.1 (składowa).' },
    { k: 'B', label: 'Rodzaj', w: 100, desc: 'Typ wiersza: Pozycja Główna / sprzęt / robocizna / Materiał / składowa.' },
    { k: 'D', label: 'NAZWA', w: 240, sticky: true, desc: 'Nazwa pozycji budżetowej. Kliknij + na pozycji aby dodać podpozycję R/M/S.' },
    { k: 'E', label: 'Ilość', w: 60, desc: 'Ilość jednostek (z podpozycji lub składowych).' },
    { k: 'F', label: 'Cena', w: 80, desc: 'Cena jednostkowa: BUDŻET / Ilość.' },
    { k: 'G', label: 'BUDŻET', w: 90, formula: 'G = Ilość × Cena', desc: 'Wartość planowana pozycji (przychód oczekiwany).' },
    { k: 'H', label: 'KAUCJA GIR', w: 90, bg: KAUCJA_BG, formula: 'H = G × % kaucji GIR', desc: 'Kaucja gwarancyjna inwestycji (zatrzymywana przez inwestora).' },
    { k: 'I', label: 'KAUCJA DW', w: 90, bg: KAUCJA_BG, formula: 'I = G × % kaucji DW', desc: 'Kaucja gwarancji wykonania (zatrzymywana do zakończenia).' },
    { k: 'J', label: 'Koszt budowy', w: 90, formula: 'J = G × % koszt budowy', desc: 'Procentowy koszt obsługi budowy (admin, projekt itp.). Odejmowany od Budżetu Zwolnionego.' },
    { k: 'K', label: 'BUDŻET Zwolniony', w: 100, formula: 'K = G − H − I − J', desc: 'Realny przychód po odjęciu kaucji i kosztu budowy. To z czego liczymy zysk i koszty.' },
    { k: 'L', label: 'Koszt prognozowany', w: 110, desc: 'Wpisana ręcznie prognoza kosztów pozycji. Obsługuje formuły, np. =10*10*0.3. Hover dla notatki.' },
    { k: 'M', label: 'Prognozowany zysk', w: 110, formula: 'M = K − L', desc: 'Zysk oczekiwany: Budżet Zwolniony minus Koszt Prognozowany. Ujemny = przewidywana strata.' },
    { k: 'N', label: 'Koszty przypisane do etapów', w: 130, bg: EXEC_BG, desc: 'Suma zapisów (faktur/zapisów) przypisanych do tej linii budżetu w module Finanse → Zapisy.' },
    { k: 'O', label: 'Koszty budowy bez etapów (% protokół)', w: 140, desc: 'Koszty budowy BEZ kodu pozycji rozproszone na pozycje proporcjonalnie do % zaawansowania z protokołów. Tryb równy włącza przycisk „Rozłóż równo".' },
    { k: 'P', label: '% wynagrodzeń budowy → robocizna', w: 130, desc: 'Wynagrodzenia BEZ kodu pozycji rozproszone tylko na sloty robocizny (R) wg % zaawansowania.' },
    { k: 'Q', label: 'Koszty nieprzyp. × % sprzedaży → robocizna', w: 130, desc: 'Firmowe koszty BEZ budowy × (Sprzedaż tej budowy / Sprzedaż firmy) w wybranym miesiącu. Następnie rozproszone na sloty robocizny proporcjonalnie do % zaawansowania pozycji z protokołów.' },
    { k: 'R', label: 'KOSZTY RAZEM', w: 100, bg: EXEC_BG, formula: 'R = N + O + P + Q', desc: 'Suma wszystkich kosztów: bezpośrednich + alokowanych pośrednich.' },
    { k: 'S', label: '% zrealizowanego', w: 90, formula: 'S = R / K × 100', desc: 'Stosunek kosztów razem do Budżetu Zwolnionego (K). 100% = wykorzystano cały realny budżet. ALERT: ≥100% czerwone, ≥80% żółte.' },
    { k: 'T', label: 'POZOSTAŁO BUDŻETU', w: 110, formula: 'T = L − R', desc: 'Ile zostało z prognozowanego kosztu. Ujemne = przekroczono prognozę. ALERT: <0 czerwone, <5%·L żółte.' },
    { k: 'U', label: 'Zysk', w: 90, formula: 'U = K − R', desc: 'Faktyczny zysk z pozycji (Budżet Zwolniony − Koszty Razem). Ujemne = STRATA. ALERT: <0 czerwone, <5%·K żółte.' },
    { k: 'V', label: 'Różnica zysku', w: 100, formula: 'V = M − U', desc: 'Różnica między prognozowanym a faktycznym zyskiem. Ujemne = realizacja gorsza niż prognoza.' },
  ];

  const totalWidth = cols.reduce((s, c) => s + c.w, 0);

  // Render komorki numerycznej z formatowaniem
  const num = (v, opts = {}) => {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
    if (opts.pct) return `${Math.round(v)}%`;
    if (typeof v !== 'number') return '—';
    if (v === 0 && !opts.showZero) return '—';
    return v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // iter81: Alert wizualny przekroczenia budzetu.
  // - col 'S' (pct): >=100% czerwone (przekroczone), >=80% zolte, <80% zielone
  // - col 'T' (pozostalo budzetu z prognozy) i col 'U' (zysk z budzetu): <0 czerwone, < 5% ref zolte, >=5% zielone
  // - col 'V' (roznica zysku): <0 czerwone, w przeciwnym razie zielone (brak progu zoltego - referencja sluzy do M)
  // Zwraca {style, icon} - icon to '⚠' tekstowo gdy alert.
  const alertCell = (val, ref, opts = {}) => {
    const base = { borderColor: BORDER };
    if (val == null || (typeof val === 'number' && !isFinite(val))) {
      return { style: { ...base, color: '#94A3B8' }, icon: null };
    }
    if (opts.pct) {
      if (val >= 100) return { style: { ...base, color: '#FFFFFF', backgroundColor: '#9B2C2C', fontWeight: 700 }, icon: '⚠' };
      if (val >= 80) return { style: { ...base, color: '#0B1120', backgroundColor: '#D4AF37', fontWeight: 700 }, icon: null };
      return { style: { ...base, color: '#5F7552', fontWeight: 700 }, icon: null };
    }
    if (val < 0) {
      return { style: { ...base, color: '#FFFFFF', backgroundColor: '#9B2C2C', fontWeight: 700 }, icon: '⚠' };
    }
    if (!opts.skipWarn) {
      const refAbs = Math.abs(ref || 0);
      if (refAbs > 0 && val < refAbs * 0.05) {
        return { style: { ...base, color: '#0B1120', backgroundColor: '#D4AF37', fontWeight: 700 }, icon: null };
      }
    }
    return { style: { ...base, color: '#5F7552', fontWeight: 700 }, icon: null };
  };

  // Renderer komorki z opcjonalnym alert icon (T, U, V, S)
  const renderAlertCell = (val, ref, opts = {}) => {
    const { style, icon } = alertCell(val, ref, opts);
    return (
      <td className="px-1 py-1 text-right tabular-nums border-r" style={style} title={icon ? (opts.warningTitle || 'Uwaga: przekroczenie/strata') : undefined}>
        {icon && <span className="mr-0.5">{icon}</span>}
        {val == null ? '—' : num(val, opts.pct ? { pct: true, showZero: true } : {})}
      </td>
    );
  };

  if (loading) return <Card className="bg-[#131C2F] border-[#2A3B59]"><CardContent className="p-6 text-[#94A3B8] text-sm">Ładuję...</CardContent></Card>;

  const stagesWithPositions = stages.filter((s) => positionsByStage[s.id]?.length > 0);
  const orphanPositions = positionsByStage['__none__'] || [];

  // iter90: SUMY KOLUMN (caly budet) - liczone z agregatow pozycji
  const grandTotals = (() => {
    const tot = { qty: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, hasL: false, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, T: 0, hasT: false, U: 0, V: 0, hasV: false };
    const allPositions = [...stagesWithPositions.flatMap(s => positionsByStage[s.id] || []), ...orphanPositions];
    allPositions.forEach((pos) => {
      const a = computePositionRow(pos.id);
      tot.qty += a.qty || 0;
      tot.G += a.G || 0;
      tot.H += a.H || 0;
      tot.I += a.I || 0;
      tot.J += a.J || 0;
      tot.K += a.K || 0;
      if (a.hasL) { tot.L += a.L; tot.hasL = true; }
      if (a.M != null) tot.M += a.M;
      tot.N += a.N || 0;
      tot.O += a.O || 0;
      tot.P += a.P || 0;
      tot.Q += a.Q || 0;
      tot.R += a.R || 0;
      if (a.T != null) { tot.T += a.T; tot.hasT = true; }
      tot.U += a.U || 0;
      if (a.V != null) { tot.V += a.V; tot.hasV = true; }
    });
    tot.S = tot.K > 0 ? (tot.R / tot.K) * 100 : 0;
    tot.cena = tot.qty > 0 ? tot.G / tot.qty : 0;
    return tot;
  })();

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]" data-testid="budget-excel-template-view">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <FolderTree className="h-5 w-5" style={{ color: '#D4AF37' }} />
          Tabela kosztorysowa (szablon BUDŻET.xlsx)
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {/* iter79: Selektor okresu dla alokacji O/P/Q */}
          {setAllocMonth && (
            <div className="flex items-center gap-1 text-xs">
              <label className="text-[#94A3B8]">Alokacja (O/P/Q):</label>
              <select
                value={allocMonth || 0}
                onChange={(e) => setAllocMonth(parseInt(e.target.value, 10) || 0)}
                className="bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1 rounded text-xs"
                data-testid="budget-alloc-period">
                <option value={0}>Cały rok {year}</option>
                {MONTHS_PL.map((m, i) => <option key={i} value={i + 1}>{m} {year}</option>)}
              </select>
            </div>
          )}
          <Button size="sm"
            onClick={onAddPosition}
            disabled={stages.length === 0}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8 disabled:opacity-40"
            data-testid="template-add-position-btn"
            title={stages.length === 0 ? 'Najpierw utwórz etap' : 'Dodaj nową pozycję (kod 1xx) z 3 podpozycjami'}>
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
          </Button>
        </div>
      </CardHeader>
      {/* iter94: Banner gdy fallback dystrybucji (brak protokolu) - dystrybucja proporcjonalna do planu lub rowna */}
      {allocations?.distributed && allocations.fallback_mode && (
        (allocations.pools?.O > 0 || allocations.pools?.P > 0 || allocations.pools?.Q > 0) && (
          <div className="mx-4 mt-2 mb-1 rounded p-3 border border-[#D4AF37]/60 bg-[#D4AF37]/10" data-testid="alloc-fallback-banner">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1">
                <div className="text-[#D4AF37] font-bold text-sm mb-1">
                  {allocations.fallback_mode === 'plan'
                    ? 'ℹ Auto-dystrybucja proporcjonalna do BUDŻETU pozycji'
                    : 'ℹ Dystrybucja równa na wszystkie pozycje'}
                </div>
                <div className="text-[#FCE99A] text-xs">
                  Brak wpisów % zaawansowania w wybranym okresie. Pule:
                  {' '}O = <b>{fmtNum(allocations.pools.O)} zł</b>,
                  {' '}P = <b>{fmtNum(allocations.pools.P)} zł</b>,
                  {' '}Q = <b>{fmtNum(allocations.pools.Q)} zł</b>
                  {' '}{allocations.fallback_mode === 'plan'
                    ? '— rozdzielone proporcjonalnie do wartości planu G pozycji. Wpisz progresy w zakładce „% Protokół" aby użyć dystrybucji wg zaawansowania.'
                    : '— wszystkie pozycje mają plan=0, więc rozdzielone równo.'}
                </div>
              </div>
              {allocations.fallback_mode === 'plan' && (
                <Button size="sm"
                  onClick={() => setEqualDistribution && setEqualDistribution(!equalDistribution)}
                  className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-7 text-xs"
                  data-testid="alloc-equal-distribute-btn">
                  {equalDistribution ? 'Wg planu (G)' : 'Rozłóż równo'}
                </Button>
              )}
            </div>
          </div>
        )
      )}
      {/* iter80: Banner gdy P/Q nie trafiajaja do robocizny bo pozycja nie ma slotu labor */}
      {allocations?.distributed && (allocations.undistributed_labor?.P > 0 || allocations.undistributed_labor?.Q > 0) && (
        <div className="mx-4 mt-2 mb-1 rounded p-2 border border-[#9B2C2C]/60 bg-[#9B2C2C]/15 text-[#FCA5A5] text-xs" data-testid="alloc-labor-missing-banner">
          ⚠ Nie wszystkie pozycje mają slot <b>robocizny (R)</b>:
          {' '}<b>{fmtNum(allocations.undistributed_labor.P)} zł</b> (P) +
          {' '}<b>{fmtNum(allocations.undistributed_labor.Q)} zł</b> (Q)
          {' '}nie zostało przypisane do żadnej komórki (pozycje bez robocizny: {allocations.undistributed_labor.positions_without_labor?.length || 0}). Dodaj slot „robocizna" do tych pozycji aby koszty wynagrodzeń się rozpisały.
        </div>
      )}
      {/* iter95: Diagnostyczny banner pul allokacji - pokazuje DLACZEGO Q=0 (lub niskie) */}
      {allocations?.pools && (
        <div className="mx-4 mt-2 mb-1 rounded p-2 border border-[#2A3B59] bg-[#0B1120] text-[#94A3B8] text-xs"
             data-testid="alloc-pools-diagnostic">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>📊 <b className="text-[#CBD5E1]">Pule alokacji</b> ({allocMonth ? `${MONTHS_PL[allocMonth-1]} ${year}` : `cały rok ${year}`}{allocations.date_range ? ` · zakres: ${allocations.date_range.start} → ${allocations.date_range.end}` : ''}):</span>
            <span>O (koszty bez etapów) = <b className={allocations.pools.O > 0 ? 'text-[#D4AF37]' : 'text-[#64748B]'}>{fmtNum(allocations.pools.O)} zł</b></span>
            <span>P (wynagrodzenia bez etapów) = <b className={allocations.pools.P > 0 ? 'text-[#D4AF37]' : 'text-[#64748B]'}>{fmtNum(allocations.pools.P)} zł</b></span>
            <span>Q (firmowe × %sprzedaży) = <button onClick={() => setShowQBreakdown(true)}
              className={`underline decoration-dotted hover:decoration-solid font-bold ${allocations.pools.Q > 0 ? 'text-[#D4AF37]' : 'text-[#FCA5A5]'}`}
              data-testid="q-breakdown-btn" title="Kliknij aby zobaczyć rozbicie Q per miesiąc i kategoria">
              {fmtNum(allocations.pools.Q)} zł 🔍
            </button></span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px]">
            <span>↳ Sprzedaż firmy = <b>{fmtNum(allocations.pools.sprzedaz_total_firma)} zł</b></span>
            <span>Sprzedaż tej budowy = <b className={allocations.pools.sprzedaz_budowa > 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>{fmtNum(allocations.pools.sprzedaz_budowa)} zł</b></span>
            <span>% sprzedaży = <b>{((allocations.pools.sprzedaz_ratio || 0) * 100).toFixed(2)}%</b></span>
            <span>Koszty firmowe nieprzyp. (bez budowy) = <b className={allocations.pools.unassigned_company > 0 ? 'text-[#9DBC85]' : 'text-[#FCA5A5]'}>{fmtNum(allocations.pools.unassigned_company)} zł</b></span>
          </div>
          {(allocations.pools.q_categorized != null || allocations.pools.q_leftover != null) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-[#94A3B8]">
              <span>Q skład: kategoryzowane (KP/KSP/PPE pro-rata jak Sprzedaż) = <b className="text-[#CBD5E1]">{fmtNum(allocations.pools.q_categorized)} zł</b></span>
              <span>+ pozostałe (KSB bez budowy, kod=brak) × %sprzedaży = <b className="text-[#CBD5E1]">{fmtNum(allocations.pools.q_leftover)} zł</b></span>
            </div>
          )}
          {allocations.pools.Q === 0 && (
            <div className="mt-1 text-[10px] text-[#FCA5A5]">
              ⚠ Q = 0 bo:
              {allocations.pools.sprzedaz_budowa === 0 && ' brak sprzedaży przypisanej do tej budowy NA POZIOMIE POZYCJI (kliknij „Propaguj budowy → pozycje" w Finanse).'}
              {allocations.pools.unassigned_company === 0 && allocations.pools.sprzedaz_budowa > 0 && ' brak kosztów firmowych BEZ przypisanej budowy w tym okresie.'}
              {allocations.pools.sprzedaz_total_firma === 0 && ' brak żadnej sprzedaży firmy w okresie (sprawdź faktury sprzedażowe z is_income=true).'}
            </div>
          )}
        </div>
      )}
      <CardContent className="p-0">
        {positions.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-8 text-center" data-testid="template-empty">
            {stages.length === 0 ? (
              <div>
                <div className="text-base mb-3">Aby zacząć tworzyć kosztorys, najpierw utwórz <b className="text-white">etap budowy</b> (np. „Mury oporowe", „Roboty zewnętrzne").</div>
                <div className="text-xs text-[#64748B]">Etap to grupa pozycji kosztorysowych. Najczęściej odpowiada fazom realizacji budowy.</div>
              </div>
            ) : (
              'Kliknij „Dodaj pozycję" aby zacząć.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ maxHeight: '70vh' }}>
            <table className="text-[10px] border-collapse" style={{ minWidth: totalWidth, width: '100%' }}>
              <thead className="sticky top-0 z-20" style={{ backgroundColor: HEADER_BG }}>
                <tr>
                  {cols.map((c) => (
                    <th key={c.k}
                      className="px-1 py-2 text-center font-bold text-white border-r border-b text-[9px] uppercase cursor-pointer hover:bg-[#5F7552] transition-colors"
                      style={{
                        borderColor: BORDER,
                        width: c.w,
                        minWidth: c.w,
                        ...(c.sticky ? { position: 'sticky', left: 0, zIndex: 21, backgroundColor: HEADER_BG } : {}),
                        ...(c.bg ? { backgroundColor: c.bg } : {}),
                      }}
                      onClick={() => setInfoCol(c)}
                      data-testid={`col-header-${c.k}`}
                      title={'Kliknij aby zobaczyć opis kolumny: ' + c.label}>
                      <div className="leading-tight flex items-center justify-center gap-0.5">
                        {c.label}
                        <span className="text-[#D4AF37] text-[8px] opacity-70">ⓘ</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-1 py-2 sticky right-0 bg-[#3F5235] text-white text-[9px] uppercase border-l border-b" style={{ borderColor: BORDER, width: 70, minWidth: 70, zIndex: 21 }}>Akcje</th>
                </tr>
                {/* iter90: Wiersz SUM kolumn (sticky pod naglowkami) */}
                <tr data-testid="grand-totals-row" style={{ backgroundColor: '#0F1A30', borderTop: `2px solid #D4AF37`, borderBottom: `2px solid ${BORDER}` }}>
                  <td className="px-1 py-1.5 text-center font-bold text-[#D4AF37] text-[10px] uppercase border-r" style={{ borderColor: BORDER }} colSpan={2}>Σ SUMA</td>
                  <td className="px-1 py-1.5 text-left font-bold text-[#D4AF37] text-[10px] border-r" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 18, backgroundColor: '#0F1A30' }}>Wszystkie pozycje budowy</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.qty)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#94A3B8] text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.cena)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.G)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(grandTotals.H)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(grandTotals.I)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.J)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.K)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{grandTotals.hasL ? num(grandTotals.L) : '—'}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{grandTotals.hasL ? num(grandTotals.M) : '—'}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(grandTotals.N)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.O)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.P)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{num(grandTotals.Q)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(grandTotals.R)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums font-bold text-[10px] border-r" style={{ borderColor: BORDER, color: grandTotals.S >= 100 ? '#FCA5A5' : grandTotals.S >= 80 ? '#D4AF37' : '#5F7552' }}>{num(grandTotals.S, { pct: true, showZero: true })}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[#D4AF37] font-bold text-[10px] border-r" style={{ borderColor: BORDER }}>{grandTotals.hasT ? num(grandTotals.T) : '—'}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums font-bold text-[10px] border-r" style={{ borderColor: BORDER, color: (grandTotals.U || 0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{num(grandTotals.U)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums font-bold text-[10px] border-r" style={{ borderColor: BORDER, color: (grandTotals.V || 0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{grandTotals.hasV ? num(grandTotals.V) : '—'}</td>
                  <td className="px-1 py-1.5 sticky right-0" style={{ backgroundColor: '#0F1A30', zIndex: 17 }}></td>
                </tr>
              </thead>
              <tbody>
                {stagesWithPositions.map((stage, sIdx) => {
                  const stagePositions = positionsByStage[stage.id] || [];
                  return (
                    <React.Fragment key={stage.id}>
                      <tr>
                        <td colSpan={cols.length + 1} className="px-2 py-1.5 font-bold text-white text-[11px] uppercase tracking-wide"
                          style={{ backgroundColor: STAGE_BG, borderTop: `2px solid #D4AF37` }}
                          data-testid={`stage-label-${stage.id}`}>
                          {`▣ Etap ${sIdx + 1}: ${stage.name}`}
                        </td>
                      </tr>
                      {stagePositions.map((pos, pIdx) => {
                        const kod = `${100 + pIdx + 1}`;
                        const slots = slotsByPosition[pos.id] || {};
                        const agg = computePositionRow(pos.id);
                        return (
                          <React.Fragment key={pos.id}>
                            {/* Pozycja Glowna - auto suma */}
                            <tr data-testid={`pos-main-${pos.id}`} style={{ backgroundColor: POS_BG, borderTop: `1px solid ${BORDER}` }}>
                              <td className="px-1 py-1 text-center font-bold text-white border-r" style={{ borderColor: BORDER }}>{kod}</td>
                              <td className="px-1 py-1 text-center text-[#D4AF37] font-semibold border-r" style={{ borderColor: BORDER }}>Pozycja Główna</td>
                              <td className="px-1 py-1 text-left text-white font-bold border-r truncate" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 4, backgroundColor: POS_BG }} title={pos.name}>
                                <div className="flex items-center gap-1">
                                  <span className="truncate flex-1">{pos.name}</span>
                                  {pos.include_in_protocol === false && (
                                    <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-[#9B2C2C]/30 text-[#FCA5A5] border border-[#9B2C2C]/50" title="Pozycja NIE jest zaciągana do protokołu zaawansowania">
                                      bez prot.
                                    </span>
                                  )}
                                  <button onClick={() => onAddSubposition(pos)} className="text-[#5F7552] hover:text-[#9DBC85] shrink-0 p-0.5 rounded bg-[#0B1120] border border-[#5F7552]/40" data-testid={`pos-add-sub-${pos.id}`} title="Dodaj podpozycję (Robocizna / Materiał / Sprzęt)">
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{fmtCellNum(agg.qty)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }}>{num(agg.cena)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-white font-bold border-r" style={{ borderColor: BORDER }}>{num(agg.G)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(agg.H)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(agg.I)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }}>{num(agg.J)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-white font-bold border-r" style={{ borderColor: BORDER }}>{num(agg.K)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r relative" style={{ borderColor: BORDER }} title={agg.hasL ? 'Suma kosztu prognozowanego ze składowych' : 'Brak wartości - wpisz w podpozycjach'}>{agg.hasL ? num(agg.L) : '—'}</td>
                              <td className="px-1 py-1 text-right tabular-nums border-r font-semibold" style={{ borderColor: BORDER, color: (agg.M||0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{agg.M != null ? num(agg.M) : '—'}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(agg.N)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }} title="O = koszty bez budget_line_id na tej budowie (z wyl. KP), rozproszone wg % protokol pozycji">{num(agg.O)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }} title="P = wynagrodzenia tej budowy alokowane do slotu robocizny pozycji">{num(agg.P)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }} title="Q = firmowe koszty bez budowy x (KP_budowa / KP_firma), alokowane do slotu robocizny">{num(agg.Q)}</td>
                              <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] font-bold border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(agg.R)}</td>
                              {renderAlertCell(agg.S, null, { pct: true, warningTitle: 'Przekroczono 100% kosztu jednostkowego - sprawdz alokacje O/P/Q vs N' })}
                              {renderAlertCell(agg.T, agg.L, { warningTitle: 'Przekroczono prognozowany koszt (T = L - R < 0)' })}
                              {renderAlertCell(agg.U, agg.K, { warningTitle: 'STRATA - koszty przekraczaja Budzet Zwolniony (U = K - R < 0)' })}
                              {renderAlertCell(agg.V, null, { skipWarn: true, warningTitle: 'Zysk faktyczny gorszy od prognozowanego' })}
                              <td className="px-1 py-1 text-center sticky right-0" style={{ backgroundColor: POS_BG, zIndex: 4, borderLeft: `1px solid ${BORDER}` }}>
                                <button onClick={() => onEditPosition(pos)} className="text-[#94A3B8] hover:text-white p-1" data-testid={`pos-edit-${pos.id}`} title="Edytuj nazwę/etap"><Pencil className="h-3 w-3" /></button>
                                <button onClick={() => onDeletePosition(pos)} className="text-[#94A3B8] hover:text-[#FCA5A5] p-1" data-testid={`pos-del-${pos.id}`} title="Usuń pozycję (wraz z podpozycjami)"><Trash2 className="h-3 w-3" /></button>
                              </td>
                            </tr>
                            {/* Podpozycje (3 sloty R/M/S w kolejnosci sprzet/robocizna/material) */}
                            {(() => {
                              const hasAnySub = SUB_TYPE_ORDER.some((t) => (slots[t] || []).length > 0);
                              if (!hasAnySub) {
                                return (
                                  <tr data-testid={`pos-empty-${pos.id}`} style={{ backgroundColor: SUB_BG }}>
                                    <td colSpan={cols.length + 1} className="px-3 py-2 text-center text-[#94A3B8] text-[10px] italic border-r" style={{ borderColor: BORDER }}>
                                      Brak podpozycji. Kliknij <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#0B1120] border border-[#5F7552]/40 text-[#5F7552]"><Plus className="h-2.5 w-2.5" /></span> przy nazwie pozycji aby dodać Robociznę / Materiał / Sprzęt.
                                    </td>
                                  </tr>
                                );
                              }
                              return null;
                            })()}
                            {(() => {
                              // iter88: rozwijamy wszystkie sloty (tez duplikaty legacy)
                              const flatSlots = [];
                              let counter = 1;
                              SUB_TYPE_ORDER.forEach((type) => {
                                (slots[type] || []).forEach((slot) => {
                                  flatSlots.push({ slot, type, subKod: `${kod}.${counter++}` });
                                });
                              });
                              return flatSlots.map(({ slot, type, subKod }) => {
                                const r = computeRow(slot);
                                const children = childrenByParent[slot.id] || [];
                                return (
                                  <React.Fragment key={`${pos.id}-${slot.id}`}>
                                  <tr data-testid={`pos-sub-${slot.id}`} style={{ backgroundColor: SUB_BG }}>
                                    <td className="px-1 py-1 text-center text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{subKod}</td>
                                    <td className="px-1 py-1 text-center border-r" style={{ borderColor: BORDER, color: BUDGET_TYPES[type].color }}>{SUB_TYPE_LABEL[type]}</td>
                                    <td className="px-1 py-1 text-left text-[#CBD5E1] border-r truncate pl-4" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 4, backgroundColor: SUB_BG }} title={slot.name}>
                                      <span className="text-[#64748B] mr-1">↳</span>{slot.name}
                                    </td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{fmtCellNum(r.qty)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{num(r.cena)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-white border-r" style={{ borderColor: BORDER }}>{num(r.G)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(r.H)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(r.I)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#94A3B8] border-r" style={{ borderColor: BORDER }}>{num(r.J)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#CBD5E1] border-r" style={{ borderColor: BORDER }}>{num(r.K)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums border-r relative" style={{ borderColor: BORDER }} data-testid={`forecast-cell-${slot.id}`}>
                                      <ForecastCell line={slot} computedL={r.L} isParent={false} computedQty={r.qty} computedCena={r.cena} computedG={r.G} onSave={onSaveLine} num={num} />
                                    </td>
                                    <td className="px-1 py-1 text-right tabular-nums border-r font-semibold" style={{ borderColor: BORDER, color: (r.M||0) >= 0 ? '#5F7552' : '#FCA5A5' }}>{r.M != null ? num(r.M) : '—'}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(r.N)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#64748B] border-r" style={{ borderColor: BORDER }}>{num(r.O)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#64748B] border-r" style={{ borderColor: BORDER }}>{num(r.P)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#64748B] border-r" style={{ borderColor: BORDER }}>{num(r.Q)}</td>
                                    <td className="px-1 py-1 text-right tabular-nums text-[#D4AF37] font-bold border-r" style={{ borderColor: BORDER, backgroundColor: EXEC_BG }}>{num(r.R)}</td>
                                    {renderAlertCell(r.S, null, { pct: true, warningTitle: 'Slot: przekroczono 100% kosztu (R/K)' })}
                                    {renderAlertCell(r.T, r.L, { warningTitle: 'Slot: przekroczono prognoze (T = L - R)' })}
                                    {renderAlertCell(r.U, r.K, { warningTitle: 'Slot: strata (U = K - R)' })}
                                    {renderAlertCell(r.V, null, { skipWarn: true })}
                                    <td className="px-1 py-1 text-center sticky right-0" style={{ backgroundColor: SUB_BG, zIndex: 4, borderLeft: `1px solid ${BORDER}` }}>
                                      <button onClick={() => onAddChildLine(slot)} className="text-[#5F7552] hover:text-[#9DBC85] p-0.5" data-testid={`sub-add-child-${slot.id}`} title="Dodaj składową (rozwiń podpozycję)"><Plus className="h-3 w-3" /></button>
                                      <button onClick={() => onEditLine(slot)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`sub-edit-${slot.id}`} title="Edytuj wartości"><Pencil className="h-3 w-3" /></button>
                                    </td>
                                  </tr>
                                  {/* Skladowe (np. cement, piasek) - wciecie x2 */}
                                  {children.map((c) => {
                                    const cr = computeRow(c);
                                    return (
                                      <tr key={c.id} data-testid={`pos-skladowa-${c.id}`} style={{ backgroundColor: '#0a0f1d' }}>
                                        <td className="px-1 py-0.5 text-center text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER }}>{subKod}.</td>
                                        <td className="px-1 py-0.5 text-center text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER }}>składowa</td>
                                        <td className="px-1 py-0.5 text-left text-[#94A3B8] italic text-[9px] border-r truncate pl-8" style={{ borderColor: BORDER, position: 'sticky', left: 0, zIndex: 4, backgroundColor: '#0a0f1d' }} title={c.name}>
                                          <span className="text-[#D4AF37] mr-1">↳↳</span>{c.name}
                                        </td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#94A3B8] text-[9px] border-r" style={{ borderColor: BORDER }}>{fmtCellNum(cr.qty)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#94A3B8] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.cena)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#CBD5E1] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.G)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(cr.H)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER, backgroundColor: KAUCJA_BG }}>{num(cr.I)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#64748B] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.J)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums text-[#94A3B8] text-[9px] border-r" style={{ borderColor: BORDER }}>{num(cr.K)}</td>
                                        <td className="px-1 py-0.5 text-right tabular-nums border-r text-[9px] relative" style={{ borderColor: BORDER }} data-testid={`forecast-cell-skladowa-${c.id}`}>
                                          <ForecastCell line={c} computedL={cr.L} isParent={false} computedQty={cr.qty} computedCena={cr.cena} computedG={cr.G} onSave={onSaveLine} num={num} />
                                        </td>
                                        <td colSpan={10} className="px-1 py-0.5 text-[9px] text-[#64748B] text-center border-r" style={{ borderColor: BORDER }}>(składowa — wartości agregują się do podpozycji)</td>
                                        <td className="px-1 py-0.5 text-center sticky right-0" style={{ backgroundColor: '#0a0f1d', zIndex: 4, borderLeft: `1px solid ${BORDER}` }}>
                                          <button onClick={() => onEditLine(c)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`skladowa-edit-${c.id}`}><Pencil className="h-3 w-3" /></button>
                                          <button onClick={() => onDeleteLine(c.id)} className="text-[#94A3B8] hover:text-[#FCA5A5] p-0.5" data-testid={`skladowa-del-${c.id}`}><Trash2 className="h-3 w-3" /></button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            });
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
                {orphanPositions.length > 0 && (
                  <tr>
                    <td colSpan={cols.length + 1} className="px-2 py-2 text-[#FCA5A5] bg-[#9B2C2C]/20 text-xs font-bold">
                      ⚠ Pozycje bez etapu ({orphanPositions.length}) - przypisz je do etapu klikając ikonę ✎
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3 py-2 bg-[#0B1120] border-t border-[#2A3B59] text-[10px] text-[#94A3B8]">
          <div className="flex items-center gap-2 flex-wrap" data-testid="budget-legend">
            <span className="text-[#D4AF37] font-semibold">ⓘ</span>
            <span>Kliknij nagłówek kolumny aby zobaczyć opis i wzór.</span>
            <span className="text-[#475569]">·</span>
            <span>Alerty:</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: '#9B2C2C', color: '#fff' }}>⚠ czerwone</span>
            <span>= strata / przekroczenie</span>
            <span className="text-[#475569]">·</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: '#D4AF37', color: '#0B1120' }}>żółte</span>
            <span>= rezerwa &lt; 5%</span>
            <span className="text-[#475569]">·</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: '#5F7552' }}>zielone</span>
            <span>= bezpieczny zapas</span>
          </div>
        </div>
      </CardContent>
      {/* iter82: Modal opisu kolumny */}
      <Dialog open={!!infoCol} onOpenChange={(o) => { if (!o) setInfoCol(null); }}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-lg" data-testid="col-info-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-[#4F6343] text-white text-xs font-mono">{infoCol?.k}</span>
              <span>{infoCol?.label}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {infoCol?.formula && (
              <div>
                <div className="text-[#94A3B8] text-xs uppercase mb-1">Wzór</div>
                <code className="block bg-[#0B1120] border border-[#2A3B59] rounded px-3 py-2 text-[#D4AF37] font-mono">{infoCol.formula}</code>
              </div>
            )}
            <div>
              <div className="text-[#94A3B8] text-xs uppercase mb-1">Opis</div>
              <div className="text-[#CBD5E1] leading-relaxed">{infoCol?.desc || 'Brak opisu.'}</div>
            </div>
            {['S', 'T', 'U', 'V'].includes(infoCol?.k) && (
              <div>
                <div className="text-[#94A3B8] text-xs uppercase mb-1">Alerty kolorów</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#9B2C2C', color: '#fff' }}>⚠ czerwone</span>
                    <span>strata lub przekroczenie planu</span>
                  </div>
                  {['T', 'U'].includes(infoCol?.k) && (
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#D4AF37', color: '#0B1120' }}>żółte</span>
                      <span>mała rezerwa (mniej niż 5% wartości referencyjnej)</span>
                    </div>
                  )}
                  {infoCol?.k === 'S' && (
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#D4AF37', color: '#0B1120' }}>żółte</span>
                      <span>≥ 80% i &lt; 100%</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded font-bold" style={{ color: '#5F7552' }}>zielone</span>
                    <span>w normie / bezpieczny zapas</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* iter95g: Modal rozbicia Q (skąd się wziął) */}
      <Dialog open={showQBreakdown} onOpenChange={setShowQBreakdown}>
        <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-3xl" data-testid="q-breakdown-modal">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-[#4F6343] text-white text-xs font-mono">Q</span>
              <span>Skąd wzięła się ta kwota? Rozbicie kolumny Q</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
            <div className="rounded bg-[#0B1120] border border-[#2A3B59] p-3">
              <div className="text-[#D4AF37] font-bold text-lg mb-1">
                Q = {fmtNum(allocations?.pools?.Q || 0)} zł
              </div>
              <div className="text-xs text-[#94A3B8]">
                Suma kosztów firmowych BEZ przypisanej budowy, rozdzielonych pomiędzy budowy proporcjonalnie do sprzedaży.
                Następnie ta kwota trafia tylko na sloty <b>robocizny (R)</b> proporcjonalnie do % zaawansowania pozycji.
              </div>
            </div>

            {/* Skład Q */}
            <div>
              <div className="text-[#94A3B8] text-xs uppercase mb-2">Skład Q (jak liczone)</div>
              <table className="w-full text-xs border border-[#2A3B59] rounded overflow-hidden">
                <tbody>
                  <tr className="border-b border-[#2A3B59]">
                    <td className="px-2 py-1.5">🔹 Kategoryzowane (KP/KSP/PPE pro-rata jak Sprzedaż)</td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#D4AF37]">{fmtNum(allocations?.pools?.q_categorized || 0)} zł</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5">🔹 Pozostałe (KSB bez budowy, kod=brak) × %sprzedaży</td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#D4AF37]">{fmtNum(allocations?.pools?.q_leftover || 0)} zł</td>
                  </tr>
                  <tr className="bg-[#0B1120] border-t border-[#D4AF37]/40">
                    <td className="px-2 py-1.5 font-bold">SUMA Q</td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#D4AF37]">{fmtNum(allocations?.pools?.Q || 0)} zł</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Per miesiąc */}
            {allocations?.q_monthly?.length > 0 && (
              <div>
                <div className="text-[#94A3B8] text-xs uppercase mb-2">
                  Rozbicie per miesiąc (w widoku rocznym sumujemy Q liczone NIEZALEŻNIE dla każdego miesiąca)
                </div>
                <table className="w-full text-xs border border-[#2A3B59] rounded overflow-hidden">
                  <thead className="bg-[#131C2F] text-[#94A3B8]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Miesiąc</th>
                      <th className="px-2 py-1.5 text-right">Sprzedaż tej budowy</th>
                      <th className="px-2 py-1.5 text-right">Sprzedaż firmy</th>
                      <th className="px-2 py-1.5 text-right">% sprzedaży</th>
                      <th className="px-2 py-1.5 text-right">Kategoryzow.</th>
                      <th className="px-2 py-1.5 text-right">Pozostałe × %</th>
                      <th className="px-2 py-1.5 text-right">Q miesiąca</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.q_monthly.map((m) => (
                      <tr key={m.month} className="border-t border-[#2A3B59]">
                        <td className="px-2 py-1.5 font-mono">{MONTHS_PL[m.month-1]} {m.year}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.sprzedaz_budowa)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.sprzedaz_firma)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{(m.ratio * 100).toFixed(2)}%</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.q_cat)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.q_left)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-[#D4AF37]">{fmtNum(m.q)}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#0B1120] border-t border-[#D4AF37]/40 font-bold">
                      <td className="px-2 py-1.5">SUMA</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.sprzedaz_budowa)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.sprzedaz_total_firma)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{((allocations.pools.sprzedaz_ratio || 0) * 100).toFixed(2)}%</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.q_categorized)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(allocations.pools.q_leftover)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[#D4AF37]">{fmtNum(allocations.pools.Q)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-[10px] text-[#64748B] mt-2">
                  ℹ Miesiące, w których budowa nie miała żadnego zapisu (faktury/kosztu), są pomijane.
                  Q jest liczone osobno per miesiąc i sumowane — dzięki temu różne miesięczne ratio
                  sprzedaży są poprawnie odzwierciedlone.
                </div>
              </div>
            )}

            {/* Wyjaśnienie metody */}
            <div className="rounded bg-[#0B1120] border border-[#2A3B59] p-3 text-xs">
              <div className="text-[#94A3B8] uppercase mb-1">Jak działa „Kategoryzowane"</div>
              <ul className="space-y-0.5 list-disc list-inside text-[#CBD5E1]">
                <li>KP (wynagrodzenia) nieprzyp. × (KP tej budowy / suma KP wszystkich budów)</li>
                <li>KSP_STAWKI nieprzyp. × ((KP+KBB) tej budowy / suma)</li>
                <li>KSP_UKLADY nieprzyp. × udział KP</li>
                <li>Pozostałe KSP × udział KP</li>
                <li>PPE (podatki) × (sprzedaż tej budowy / sprzedaż całej firmy)</li>
              </ul>
              <div className="text-[#94A3B8] uppercase mt-3 mb-1">Jak działa „Pozostałe"</div>
              <div className="text-[#CBD5E1]">
                Wszystkie firmowe koszty BEZ budowy które NIE są w kategoriach KP/KSP/PPE
                (np. faktury Hilti, NOE bez kodu — patrz screenshot).
                Mnożone przez: <code className="bg-[#19243C] px-1 rounded">sprzedaż_budowy / sprzedaż_firmy</code> dla danego miesiąca.
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowQBreakdown(false)}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white px-4 py-2 rounded text-sm"
              data-testid="q-breakdown-close">Zamknij</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

