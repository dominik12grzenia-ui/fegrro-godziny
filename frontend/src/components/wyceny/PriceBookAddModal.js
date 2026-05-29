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
} from './_shared';

export const PriceBookAddModal = ({ category, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: '', unit: '', unit_price_netto: 0, notes: '' });
  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę'); return; }
    try {
      await api.post('/wyceny/cennik', {
        category, name: form.name.trim(), unit: form.unit,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0, notes: form.notes,
      });
      toast.success('Dodano');
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="pricebook-modal">
        <DialogHeader>
          <DialogTitle>Dodaj pozycję cennika ({TYPE_LABEL[category]})</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div><label className="text-xs text-[#94A3B8]">Nazwa *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" data-testid="pricebook-modal-name" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-[#94A3B8]">J.m.</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="szt / m / kg / h..." className="bg-[#0B1120] border-[#2A3B59]" /></div>
            <div><label className="text-xs text-[#94A3B8]">Cena netto</label>
              <Input type="number" step="0.01" value={form.unit_price_netto}
                onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59]" data-testid="pricebook-modal-price" /></div>
          </div>
          <div><label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <Button onClick={save} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="pricebook-modal-save">Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

