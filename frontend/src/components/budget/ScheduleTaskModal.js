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

export const ScheduleTaskModal = ({ budowaId, editTask, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: editTask?.name || '',
    start_date: editTask?.start_date || new Date().toISOString().slice(0, 10),
    end_date: editTask?.end_date || new Date().toISOString().slice(0, 10),
    progress_pct: editTask?.progress_pct || 0,
    color: editTask?.color || '#D4AF37',
    notes: editTask?.notes || '',
    position_id: editTask?.position_id || '',
    actual_end_date: editTask?.actual_end_date || '',
  });
  const [saving, setSaving] = useState(false);
  const [positions, setPositions] = useState([]);

  // iter95i: pobierz pozycje budzetu do dropdown
  useEffect(() => {
    if (!budowaId) return;
    api.get(`/budget/${budowaId}/template`).then((r) => {
      const allPos = [];
      (r.data?.stages || []).forEach((s) => {
        (s.positions || []).forEach((p) => allPos.push({ id: p.id, name: `${s.name} → ${p.name}` }));
      });
      setPositions(allPos);
    }).catch(() => setPositions([]));
  }, [budowaId]);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę'); return; }
    if (form.end_date < form.start_date) { toast.error('Data końca musi być po dacie startu'); return; }
    // iter95i: walidacja actual_end_date - musi byc <= end_date (data szybszego wykonania)
    if (form.actual_end_date && form.actual_end_date > form.end_date) {
      toast.error('Data faktycznego zakończenia musi być wcześniejsza lub równa planowanej dacie końca');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, budowa_id: budowaId, progress_pct: parseFloat(form.progress_pct) || 0 };
      // Puste stringi -> null/clear flags
      if (!payload.position_id) {
        delete payload.position_id;
        if (editTask?.position_id) payload.clear_position_id = true;
      }
      if (!payload.actual_end_date) {
        delete payload.actual_end_date;
        if (editTask?.actual_end_date) payload.clear_actual_end_date = true;
      }
      if (editTask) {
        delete payload.budowa_id;
        await api.patch(`/budget/tasks/${editTask.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/budget/tasks', payload);
        toast.success('Dodano zadanie');
      }
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setSaving(false); }
  };

  const isAutoProgress = !!form.position_id;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{editTask ? 'Edytuj zadanie' : 'Nowe zadanie'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs text-[#94A3B8]">Nazwa zadania *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-name" />
          </div>
          {/* iter95i: link do pozycji budzetu - auto-progres z protokolu */}
          <div>
            <label className="text-xs text-[#94A3B8] flex items-center gap-1">
              Powiąż z pozycją budżetu <span className="text-[10px] text-[#64748B]">(opcjonalnie - auto-progres z protokołu)</span>
            </label>
            <select
              value={form.position_id}
              onChange={(e) => setForm({ ...form, position_id: e.target.value })}
              className="w-full bg-[#0B1120] border border-[#2A3B59] rounded text-white text-sm p-2"
              data-testid="task-position-id"
            >
              <option value="">— brak (% wpisywane ręcznie) —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Start *</label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-start" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Planowany koniec *</label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" data-testid="task-end" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8] flex items-center gap-1">
                % wykonania
                {isAutoProgress && <span className="text-[10px] text-[#9DBC85]">(auto z protokołu)</span>}
              </label>
              <Input type="number" min="0" max="100"
                disabled={isAutoProgress}
                value={isAutoProgress ? (editTask?.progress_pct || 0) : form.progress_pct}
                onChange={(e) => setForm({ ...form, progress_pct: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59] disabled:opacity-60"
                data-testid="task-progress" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Kolor</label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="bg-[#0B1120] border-[#2A3B59] h-9" data-testid="task-color" />
            </div>
          </div>
          {/* iter95i: data szybszego wykonania - admin only (caly Budget i tak jest admin-only) */}
          <div className="rounded p-2 border border-[#2A3B59] bg-[#0B1120]/50">
            <label className="text-xs text-[#94A3B8] flex items-center gap-1">
              🔐 Data faktycznego zakończenia <span className="text-[10px] text-[#64748B]">(tylko admin - gdy zadanie ukończono wcześniej)</span>
            </label>
            <Input type="date" value={form.actual_end_date} onChange={(e) => setForm({ ...form, actual_end_date: e.target.value })}
              max={form.end_date}
              className="bg-[#0B1120] border-[#2A3B59] mt-1"
              data-testid="task-actual-end" />
            {form.actual_end_date && form.end_date && form.actual_end_date < form.end_date && (
              <div className="text-[10px] text-[#9DBC85] mt-1">
                ✓ Wykonane szybciej o {Math.ceil((new Date(form.end_date) - new Date(form.actual_end_date)) / (1000 * 60 * 60 * 24))} dni
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-[#0B1120] border-[#2A3B59]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <ActionButton onAction={save} disabled={saving} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="task-save">{saving ? 'Zapisuję...' : 'Zapisz'}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

