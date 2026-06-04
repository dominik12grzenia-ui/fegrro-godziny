// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase, AlertCircle, AlertTriangle, RefreshCw, Loader2, Download, Save, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton, emitFinanceRefresh } from './_shared';

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
  // iter95dp: koszt cykliczny
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState(12);

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
    setIsRecurring(false);
    setRecurringMonths(12);
  }, [open, todayIso]);

  const handleSave = async () => {
    if (!date) return toast.error('Podaj datę');
    if (!netto || isNaN(parseFloat(netto))) return toast.error('Podaj kwotę netto');
    if (!kodId) return toast.error('Wybierz kod kosztu');
    setSaving(true);
    try {
      const payload = {
        date,
        kontrahent: kontrahent || '',
        kod_id: kodId,
        budowa_id: budowaId || null,
        netto: parseFloat(netto),
        notes: notes || '',
      };
      if (isRecurring) {
        const n = Math.max(1, Math.min(120, parseInt(recurringMonths, 10) || 1));
        const r = await api.post('/finance/zapisy/recurring', { ...payload, months: n });
        const c = r.data?.created_count ?? n;
        const s = r.data?.skipped_count ?? 0;
        toast.success(`Dodano koszt cykliczny: ${c} mc${s > 0 ? ` (pominięto ${s} zamknięt${s === 1 ? 'y' : 'ych'} okres${s === 1 ? '' : 'ów'})` : ''}`);
      } else {
        const d = new Date(date);
        await api.post('/finance/zapisy', {
          ...payload,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          brutto: parseFloat(netto),
          source: 'manual',
        });
        toast.success('Zapis dodany');
      }
      emitFinanceRefresh('quickadd-finance');
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
                <option key={k.id} value={k.id}>{`${k.cat} – ${k.name}`}</option>
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
          {/* iter95dp: koszt cykliczny */}
          <div className="border border-[#3D5378] rounded p-3 bg-[#243049]/40">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="accent-[#4F6343] h-4 w-4"
                data-testid="quickadd-recurring-toggle"
              />
              <span className="text-sm text-[#F1F5F9] font-medium">Koszt cykliczny — powtarzaj co miesiąc</span>
            </label>
            {isRecurring && (
              <div className="mt-3 flex items-end gap-3">
                <div className="w-32">
                  <label className="text-[#CBD5E1] text-[10px] uppercase block mb-1">Liczba mc</label>
                  <Input
                    type="number" min="1" max="120" step="1"
                    value={recurringMonths}
                    onChange={(e) => setRecurringMonths(e.target.value)}
                    className="no-spinner bg-[#152033] border-[#3D5378] text-white"
                    data-testid="quickadd-recurring-months"
                  />
                </div>
                <div className="text-xs text-[#94A3B8] leading-snug flex-1">
                  Powstanie <strong className="text-[#D4AF37]">{Math.max(1, parseInt(recurringMonths, 10) || 0)}</strong> zapisów po <strong className="text-[#D4AF37]">{Number(netto || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł</strong>, jeden na każdy miesiąc od {date}.
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#3D5378] text-[#F1F5F9] bg-transparent hover:bg-[#243049]" data-testid="quickadd-cancel">Anuluj</Button>
          <ActionButton onAction={handleSave} disabled={saving}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="quickadd-save">{saving ? 'Zapisywanie...' : (isRecurring ? `Zapisz ${Math.max(1, parseInt(recurringMonths, 10) || 0)} mc` : 'Zapisz')}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

