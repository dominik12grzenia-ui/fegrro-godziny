// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { ArrowLeft, BookOpen, Briefcase, Calendar, ChevronDown, ChevronLeft, ChevronRight, FileBarChart, FileDown, FilePlus, FileSpreadsheet, FileText, FolderTree, Pencil, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { PositionCard } from './PositionCard';
import { TYPE_ORDER, fmtNum } from './_shared';

export const BudgetCostingView = ({
  positions, stages, lines, loading,
  onAddPosition, onEditPosition, onDeletePosition,
  onEditLine, onAddChildLine, onDeleteLine,
}) => {
  const [collapsedStages, setCollapsedStages] = useState({});
  const [collapsedPositions, setCollapsedPositions] = useState({});

  const toggleStage = (id) => setCollapsedStages((s) => ({ ...s, [id]: !s[id] }));
  const togglePosition = (id) => setCollapsedPositions((s) => ({ ...s, [id]: !s[id] }));

  // Grupuj pozycje per etap
  const positionsByStage = useMemo(() => {
    const m = {};
    positions.forEach((p) => {
      const sid = p.stage_id || '__none__';
      if (!m[sid]) m[sid] = [];
      m[sid].push(p);
    });
    return m;
  }, [positions]);

  // Sloty (parent_id=null, position_id ustawione) i skladowe (parent_id != null)
  const slotsByPosition = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.position_id || ln.parent_id) return;
      const k = ln.position_id;
      if (!m[k]) m[k] = {};
      m[k][ln.type || 'materials'] = ln;
    });
    return m;
  }, [lines]);

  const childrenByParent = useMemo(() => {
    const m = {};
    lines.forEach((ln) => {
      if (!ln.parent_id) return;
      if (!m[ln.parent_id]) m[ln.parent_id] = [];
      m[ln.parent_id].push(ln);
    });
    return m;
  }, [lines]);

  // Agreguj wartosci pozycji (suma slotow + skladowych)
  const computePositionTotals = (positionId) => {
    const slots = slotsByPosition[positionId] || {};
    const byType = {};
    let totalPlan = 0;
    let totalExec = 0;
    TYPE_ORDER.forEach((t) => {
      const slot = slots[t];
      if (!slot) { byType[t] = { plan: 0, exec: 0, pct: 0, hasChildren: false }; return; }
      const kids = childrenByParent[slot.id] || [];
      let plan = slot.plan_netto_computed || 0;
      let exec = slot.execution_netto || 0;
      if (kids.length > 0) {
        plan = kids.reduce((s, k) => s + (k.plan_netto_computed || 0), 0);
        exec = kids.reduce((s, k) => s + (k.execution_netto || 0), 0);
      }
      const pct = plan > 0 ? Math.round((exec / plan) * 100) : 0;
      byType[t] = { plan, exec, pct, hasChildren: kids.length > 0, slot };
      totalPlan += plan;
      totalExec += exec;
    });
    const totalPct = totalPlan > 0 ? Math.round((totalExec / totalPlan) * 100) : 0;
    return { byType, totalPlan, totalExec, totalPct };
  };

  const computeStageTotals = (stageId) => {
    const stagePositions = positionsByStage[stageId] || [];
    let plan = 0; let exec = 0;
    stagePositions.forEach((p) => {
      const tt = computePositionTotals(p.id);
      plan += tt.totalPlan;
      exec += tt.totalExec;
    });
    return { plan, exec, pct: plan > 0 ? Math.round((exec / plan) * 100) : 0, count: stagePositions.length };
  };

  // Suma calego kosztorysu
  const grandTotals = useMemo(() => {
    let plan = 0; let exec = 0;
    positions.forEach((p) => {
      const tt = computePositionTotals(p.id);
      plan += tt.totalPlan;
      exec += tt.totalExec;
    });
    return { plan, exec, pct: plan > 0 ? Math.round((exec / plan) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, slotsByPosition, childrenByParent]);

  const stagesWithPositions = stages.filter((s) => positionsByStage[s.id]?.length > 0);
  const orphanPositions = positionsByStage['__none__'] || [];

  if (loading) return <Card className="bg-[#131C2F] border-[#2A3B59]"><CardContent className="p-6 text-[#94A3B8] text-sm">Ładuję...</CardContent></Card>;

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]" data-testid="budget-costing-view">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <FolderTree className="h-5 w-5" style={{ color: '#D4AF37' }} />
          Kosztorys: Etapy → Pozycje → Robocizna · Materiały · Sprzęt
        </CardTitle>
        <Button size="sm"
          onClick={onAddPosition}
          disabled={stages.length === 0}
          className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120] h-8 disabled:opacity-40"
          data-testid="costing-add-position-btn"
          title={stages.length === 0 ? 'Najpierw utwórz etap' : 'Dodaj nową pozycję kosztorysową'}>
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
      </CardHeader>
      <CardContent className="p-2 space-y-2">
        {positions.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-8 text-center" data-testid="costing-empty">
            Brak pozycji kosztorysowych. {stages.length === 0 ? <>Najpierw utwórz <b>etap</b> (np. „Roboty zewnętrzne"), potem dodaj pozycje.</> : 'Kliknij „Dodaj pozycję" aby zacząć.'}
          </div>
        ) : (
          <>
            {stagesWithPositions.map((stage) => {
              const collapsed = collapsedStages[stage.id];
              const stagePositions = positionsByStage[stage.id] || [];
              const st = computeStageTotals(stage.id);
              return (
                <div key={stage.id} className="rounded border border-[#2A3B59] overflow-hidden" data-testid={`stage-block-${stage.id}`}>
                  <button
                    type="button"
                    onClick={() => toggleStage(stage.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-gradient-to-r from-[#3F5235] to-[#4F6343] hover:from-[#4F6343] hover:to-[#5F7552] text-left"
                    data-testid={`stage-toggle-${stage.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {collapsed ? <ChevronRight className="h-4 w-4 text-white shrink-0" /> : <ChevronDown className="h-4 w-4 text-white shrink-0" />}
                      <span className="text-white font-bold text-sm uppercase tracking-wide truncate">{stage.name}</span>
                      <span className="text-[#0B1120] bg-[#D4AF37] text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">{st.count}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] tabular-nums shrink-0">
                      <span className="text-[#0B1120] bg-white/85 px-2 py-0.5 rounded font-semibold">Plan: {fmtNum(st.plan)} zł</span>
                      <span className="text-[#0B1120] bg-[#D4AF37] px-2 py-0.5 rounded font-bold">Wyk: {fmtNum(st.exec)} zł ({st.pct}%)</span>
                    </div>
                  </button>
                  {!collapsed && (
                    <div className="bg-[#0B1120]/40 p-2 space-y-2">
                      {stagePositions.map((pos) => (
                        <PositionCard
                          key={pos.id}
                          position={pos}
                          totals={computePositionTotals(pos.id)}
                          collapsed={collapsedPositions[pos.id]}
                          onToggle={() => togglePosition(pos.id)}
                          onEditPosition={onEditPosition}
                          onDeletePosition={onDeletePosition}
                          onEditLine={onEditLine}
                          onAddChildLine={onAddChildLine}
                          onDeleteLine={onDeleteLine}
                          childrenByParent={childrenByParent}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {orphanPositions.length > 0 && (
              <div className="rounded border border-dashed border-[#9B2C2C]" data-testid="orphan-positions">
                <div className="px-3 py-2 bg-[#9B2C2C]/20 text-[#FCA5A5] text-xs font-bold uppercase tracking-wide">
                  ⚠ Pozycje bez etapu ({orphanPositions.length}) - przypisz je do etapu
                </div>
                <div className="bg-[#0B1120]/40 p-2 space-y-2">
                  {orphanPositions.map((pos) => (
                    <PositionCard
                      key={pos.id}
                      position={pos}
                      totals={computePositionTotals(pos.id)}
                      collapsed={collapsedPositions[pos.id]}
                      onToggle={() => togglePosition(pos.id)}
                      onEditPosition={onEditPosition}
                      onDeletePosition={onDeletePosition}
                      onEditLine={onEditLine}
                      onAddChildLine={onAddChildLine}
                      onDeleteLine={onDeleteLine}
                      childrenByParent={childrenByParent}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Suma calego kosztorysu */}
            <div className="rounded border-2 border-[#D4AF37] bg-gradient-to-r from-[#3F5235] to-[#1a2436] px-3 py-2 mt-2 flex items-center justify-between" data-testid="costing-grand-total">
              <div className="text-white font-bold text-sm uppercase tracking-wide">SUMA KOSZTORYSU</div>
              <div className="flex items-center gap-4 text-xs tabular-nums">
                <span className="text-white">Plan: <b>{fmtNum(grandTotals.plan)} zł</b></span>
                <span className="text-[#D4AF37] font-bold">Wykonanie: {fmtNum(grandTotals.exec)} zł ({grandTotals.pct}%)</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

