// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { BUDGET_TYPES, TYPE_ORDER, fmtNum } from './_shared';

export const PositionCard = ({
  position, totals, collapsed,
  onToggle, onEditPosition, onDeletePosition,
  onEditLine, onAddChildLine, onDeleteLine,
  childrenByParent,
}) => {
  return (
    <div className="rounded bg-[#131C2F] border border-[#2A3B59] overflow-hidden" data-testid={`position-card-${position.id}`}>
      {/* Naglowek pozycji - klikalny */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#19243C] border-b border-[#2A3B59]">
        <button type="button" onClick={onToggle} className="shrink-0 text-[#D4AF37] hover:text-white" data-testid={`position-toggle-${position.id}`}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="text-white text-sm font-semibold flex-1 truncate" title={position.name}>{position.name}</div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] tabular-nums">
          {TYPE_ORDER.map((t) => {
            const cfg = BUDGET_TYPES[t];
            const td = totals.byType[t] || { plan: 0, exec: 0, pct: 0 };
            return (
              <span key={t} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }} title={cfg.label}>
                {cfg.short}: {fmtNum(td.exec)}/{fmtNum(td.plan)}
              </span>
            );
          })}
          <span className="px-1.5 py-0.5 rounded bg-[#D4AF37] text-[#0B1120] font-bold">
            Σ {fmtNum(totals.totalExec)}/{fmtNum(totals.totalPlan)} zł ({totals.totalPct}%)
          </span>
        </div>
        <button onClick={() => onEditPosition(position)} className="text-[#94A3B8] hover:text-white shrink-0 p-1" data-testid={`position-edit-${position.id}`} title="Edytuj pozycję">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDeletePosition(position)} className="text-[#94A3B8] hover:text-[#FCA5A5] shrink-0 p-1" data-testid={`position-del-${position.id}`} title="Usuń pozycję (wraz z wszystkimi kosztami)">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!collapsed && (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-3 gap-px bg-[#2A3B59] min-w-[900px]">
            {TYPE_ORDER.map((type) => {
              const cfg = BUDGET_TYPES[type];
              const td = totals.byType[type] || {};
              const slot = td.slot;
              const children = slot ? (childrenByParent[slot.id] || []) : [];
              return (
                <div key={type} className="bg-[#0B1120] p-2" data-testid={`position-${position.id}-slot-${type}`}>
                  <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b" style={{ borderColor: `${cfg.color}40` }}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] shrink-0" style={{ backgroundColor: cfg.bg, color: cfg.textOnBg }}>{cfg.short}</div>
                      <div className="text-xs font-semibold truncate" style={{ color: cfg.color }}>{cfg.label}</div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {slot && (
                        <>
                          <button onClick={() => onAddChildLine(slot)} className="text-[#5F7552] hover:text-[#9DBC85] p-0.5" data-testid={`slot-add-child-${slot.id}`} title="Dodaj składową">
                            <Plus className="h-3 w-3" />
                          </button>
                          <button onClick={() => onEditLine(slot)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`slot-edit-${slot.id}`} title="Edytuj wartości slotu">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Wartosci slotu (lub agregat ze skladowych) */}
                  <div className="text-[10px] grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
                    <span className="text-[#94A3B8]">Plan:</span>
                    <span className="text-white font-semibold text-right">{fmtNum(td.plan || 0)} zł</span>
                    <span className="text-[#94A3B8]">Wykonanie:</span>
                    <span className="text-right" style={{ color: cfg.color }}>{fmtNum(td.exec || 0)} zł</span>
                    <span className="text-[#94A3B8]">Postęp:</span>
                    <span className={`text-right font-bold ${td.pct >= 100 ? 'text-[#9B2C2C]' : td.pct >= 80 ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`}>{td.pct || 0}%</span>
                    {slot && (slot.kaucja_gir_amount || slot.kaucja_dw_amount) ? (
                      <>
                        <span className="text-[#94A3B8]">Kaucje:</span>
                        <span className="text-[#94A3B8] text-right">{fmtNum((slot.kaucja_gir_amount || 0) + (slot.kaucja_dw_amount || 0))} zł</span>
                      </>
                    ) : null}
                  </div>
                  {/* Skladowe */}
                  {children.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-[#2A3B59]/50 space-y-0.5">
                      <div className="text-[9px] text-[#64748B] uppercase tracking-wide mb-0.5">Składowe ({children.length})</div>
                      {children.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-1 text-[10px] hover:bg-[#19243C]/60 px-1 py-0.5 rounded">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[#D4AF37] shrink-0">↳</span>
                            <span className="text-[#CBD5E1] truncate" title={c.name}>{c.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-white tabular-nums">{fmtNum(c.plan_netto_computed || 0)}</span>
                            <button onClick={() => onEditLine(c)} className="text-[#94A3B8] hover:text-white p-0.5" data-testid={`child-edit-${c.id}`} title="Edytuj składową">
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                            <button onClick={() => onDeleteLine(c.id)} className="text-[#94A3B8] hover:text-[#FCA5A5] p-0.5" data-testid={`child-del-${c.id}`} title="Usuń składową">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

