// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { MONTHS_PL } from './_shared';

export const GanttView = ({ tasks, ganttData }) => {
  if (!ganttData) return null;
  const { minD, totalDays } = ganttData;
  const dayWidth = 24;  // px per dzien
  const totalWidth = totalDays * dayWidth;

  // Generuj naglowek z miesiacami
  const monthMarkers = [];
  const cur = new Date(minD);
  cur.setDate(1);
  while (cur <= new Date(minD.getTime() + totalDays * 24 * 60 * 60 * 1000)) {
    const offsetDays = Math.max(0, Math.floor((cur - minD) / (1000 * 60 * 60 * 24)));
    monthMarkers.push({
      label: `${MONTHS_PL[cur.getMonth()]} ${cur.getFullYear()}`,
      offset: offsetDays * dayWidth,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <div className="overflow-x-auto" data-testid="schedule-gantt">
      <div className="relative" style={{ minWidth: `${totalWidth + 240}px` }}>
        {/* Header z miesiacami */}
        <div className="flex border-b border-[#2A3B59]">
          <div className="w-60 shrink-0 p-2 text-xs text-[#94A3B8] font-semibold border-r border-[#2A3B59]">Zadanie</div>
          <div className="relative" style={{ width: `${totalWidth}px`, height: '32px' }}>
            {monthMarkers.map((m, i) => (
              <div key={i} className="absolute top-0 text-[10px] text-[#94A3B8] border-l border-[#2A3B59] h-full pl-1" style={{ left: `${m.offset}px` }}>
                {m.label}
              </div>
            ))}
          </div>
        </div>
        {/* Wiersze zadan */}
        {tasks.map((t) => {
          const start = new Date(t.start_date);
          const end = new Date(t.end_date);
          const startOffset = Math.max(0, (start - minD) / (1000 * 60 * 60 * 24));
          const duration = Math.max(1, (end - start) / (1000 * 60 * 60 * 24) + 1);
          return (
            <div key={t.id} className="flex border-b border-[#2A3B59]/30 hover:bg-[#0B1120]/40">
              <div className="w-60 shrink-0 p-2 text-xs text-white border-r border-[#2A3B59]">
                {t.name}
                <div className="text-[10px] text-[#94A3B8]">{t.progress_pct}%</div>
              </div>
              <div className="relative" style={{ width: `${totalWidth}px`, height: '36px' }}>
                <div
                  className="absolute top-1 h-6 rounded shadow flex items-center px-2 text-[10px] font-semibold text-[#0B1120] overflow-hidden"
                  style={{
                    left: `${startOffset * dayWidth}px`,
                    width: `${duration * dayWidth}px`,
                    backgroundColor: t.color || '#D4AF37',
                  }}
                  title={`${t.name} (${t.start_date} → ${t.end_date}, ${t.progress_pct}%)`}
                  data-testid={`gantt-bar-${t.id}`}
                >
                  <div className="absolute inset-0 bg-black/30" style={{ width: `${100 - t.progress_pct}%`, right: 0, left: 'auto' }} />
                  <span className="relative truncate">{t.progress_pct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

