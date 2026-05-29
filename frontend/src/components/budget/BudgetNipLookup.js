// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const BudgetNipLookup = ({ onResult }) => {
  const [nip, setNip] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchGus = async () => {
    const cleaned = nip.replace(/\D/g, '');
    if (cleaned.length !== 10) { toast.error('NIP musi mieć 10 cyfr'); return; }
    setBusy(true);
    try {
      const r = await api.get(`/finance/gus-lookup/${cleaned}`);
      onResult(r.data.formatted);
      toast.success(`Załadowano: ${r.data.name}`);
      setNip('');
    } catch (e) {
      toast.error('GUS: ' + (e.response?.data?.detail || e.message));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex gap-1 mb-1.5">
      <Input value={nip} onChange={(e) => setNip(e.target.value)}
        placeholder="NIP (10 cyfr)" maxLength={13}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fetchGus(); } }}
        className="h-7 text-xs bg-[#0B1120] border-[#2A3B59] text-white no-spinner"
        data-testid="budget-nip-lookup-input" />
      <Button type="button" size="sm" onClick={fetchGus} disabled={busy}
        className="h-7 px-2 text-xs bg-[#4F6343] hover:bg-[#3F5235] text-white whitespace-nowrap"
        data-testid="budget-nip-lookup-btn">
        {busy ? 'Pobieram...' : 'Pobierz z GUS'}
      </Button>
    </div>
  );
};

