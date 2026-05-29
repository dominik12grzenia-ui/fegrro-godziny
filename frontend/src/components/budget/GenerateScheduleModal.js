// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton } from './_shared';

export const GenerateScheduleModal = ({ budowaId, onClose, onSaved }) => {
  const [form, setForm] = useState({
    start_date: new Date().toISOString().slice(0, 10),
    days_per_position: 30,
    parallel_stages: false,
  });
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/budget/${budowaId}/tasks/generate`, {
        start_date: form.start_date,
        days_per_position: parseInt(form.days_per_position, 10) || 30,
        parallel_stages: !!form.parallel_stages,
      });
      const { created, skipped, total_positions } = r.data;
      toast.success(`Utworzono ${created} zadań (pominięto ${skipped} - już połączone). Łącznie pozycji: ${total_positions}`);
      onSaved();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="generate-schedule-modal">
        <DialogHeader>
          <DialogTitle>Generuj harmonogram z budżetu</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-[#CBD5E1] bg-[#0B1120]/60 border border-[#2A3B59] rounded p-2">
            Tworzy zadanie dla każdej pozycji budżetu (Etap → Pozycja). Każde zadanie zostanie automatycznie powiązane z pozycją, więc <b className="text-[#9DBC85]">% wykonania będzie aktualizowane z protokołu</b>. Pozycje które już mają task — pomijane.
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Data startu pierwszego zadania</label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" data-testid="gen-start-date" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Czas trwania pozycji (dni)</label>
            <Input type="number" min="1" max="365" value={form.days_per_position}
              onChange={(e) => setForm({ ...form, days_per_position: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" data-testid="gen-days" />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
            <input type="checkbox" checked={form.parallel_stages}
              onChange={(e) => setForm({ ...form, parallel_stages: e.target.checked })}
              data-testid="gen-parallel-stages" />
            Etapy równolegle (wszystkie zaczynają się od daty startu)
          </label>
          <div className="text-[10px] text-[#64748B]">
            Domyślnie: etapy sekwencyjne (każdy etap zaczyna się gdy poprzedni kończy). Po wygenerowaniu możesz ręcznie edytować daty i czas trwania każdego zadania.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <ActionButton onAction={generate} disabled={saving}
            className="bg-[#5F7552] hover:bg-[#3F5235] text-white"
            data-testid="gen-confirm">{saving ? 'Generuję...' : 'Generuj zadania'}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

