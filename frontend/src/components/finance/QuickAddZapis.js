// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase, AlertCircle, AlertTriangle, RefreshCw, Loader2, Download, Save, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton } from './_shared';

export const QuickAddZapis = ({ open, onClose }) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [kontrahent, setKontrahent] = useState('');
  const [notes, setNotes] = useState('');
  const [netto, setNetto] = useState('');
  const [kodId, setKodId] = useState('');
  const [budowaId, setBudowaId] = useState('');
  const [kody, setKody] = useState([]);
  const [budowy, setBudowy] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get('/finance/kody').catch(() => ({ data: [] })),
      api.get('/finance/budowy').catch(() => ({ data: [] })),
    ]).then(([k, b]) => {
      setKody(k.data?.rows || []);
      setBudowy(b.data?.rows || []);
    });
    // Reset przy ponownym otwarciu
    setDate(todayIso);
    setKontrahent('');
    setNotes('');
    setNetto('');
    setKodId('');
    setBudowaId('');
  }, [open, todayIso]);

  const handleSave = async () => {
    if (!date) return toast.error('Podaj datę');
    if (!netto || isNaN(parseFloat(netto))) return toast.error('Podaj kwotę netto');
    if (!kodId) return toast.error('Wybierz kod kosztu');
    setSaving(true);
    try {
      const d = new Date(date);
      await api.post('/finance/zapisy', {
        date,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        kontrahent: kontrahent || '',
        kod_id: kodId,
        budowa_id: budowaId || null,
        netto: parseFloat(netto),
        brutto: parseFloat(netto),
        notes: notes || '',
        source: 'manual',
      });
      toast.success('Zapis dodany');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37]">Dodaj zapis (koszt bez faktury)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-[#CBD5E1] text-xs">Data</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="quickadd-date" />
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Kontrahent (opcjonalnie)</label>
            <Input value={kontrahent} onChange={(e) => setKontrahent(e.target.value)}
              placeholder="np. Bricomat sp. z o.o."
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="quickadd-kontrahent" />
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Kod kosztu *</label>
            <select value={kodId} onChange={(e) => setKodId(e.target.value)}
              className="w-full bg-[#152033] border border-[#3D5378] text-white rounded h-10 px-3"
              data-testid="quickadd-kod">
              <option value="">— wybierz —</option>
              {kody.filter((k) => k.cat !== 'PZS' && k.cat !== 'PZSV').map((k) => (
                <option key={k.id} value={k.id}>{k.cat} – {k.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Budowa (opcjonalnie)</label>
            <select value={budowaId} onChange={(e) => setBudowaId(e.target.value)}
              className="w-full bg-[#152033] border border-[#3D5378] text-white rounded h-10 px-3"
              data-testid="quickadd-budowa">
              <option value="">— nieprzypisane —</option>
              {budowy.filter((b) => !b.is_archived).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Netto (PLN) *</label>
            <Input type="number" step="0.01" value={netto} onChange={(e) => setNetto(e.target.value)}
              placeholder="0,00"
              className="bg-[#152033] border-[#3D5378] text-white text-lg font-mono tabular-nums"
              data-testid="quickadd-netto" />
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Opis / uwagi (opcjonalnie)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="np. paliwo do koparki"
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="quickadd-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#3D5378] text-[#F1F5F9] bg-transparent hover:bg-[#243049]" data-testid="quickadd-cancel">Anuluj</Button>
          <ActionButton onAction={handleSave} disabled={saving}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="quickadd-save">{saving ? 'Zapisywanie...' : 'Zapisz'}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

