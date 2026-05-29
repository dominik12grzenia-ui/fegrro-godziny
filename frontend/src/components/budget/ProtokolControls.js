// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ProtokolDownloaderInline } from './ProtokolDownloaderInline';
import { MONTHS_PL } from './_shared';

export const ProtokolControls = ({ month, setMonth, budowaId, year }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <label className="text-xs text-[#94A3B8]">Miesiąc rozliczeniowy:</label>
    <select
      value={month}
      onChange={(e) => setMonth(parseInt(e.target.value, 10))}
      className="bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1.5 rounded text-sm"
      data-testid="progress-month-select"
    >
      {MONTHS_PL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
    </select>
    <ProtokolDownloaderInline budowaId={budowaId} year={year} month={month} />
  </div>
);

