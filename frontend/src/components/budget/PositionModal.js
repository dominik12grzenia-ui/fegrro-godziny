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

export const PositionModal = ({ budowaId, editPosition, stages, onClose, onSaved }) => {
  const [name, setName] = useState(editPosition?.name || '');
  const [stageId, setStageId] = useState(editPosition?.stage_id || (stages[0]?.id || ''));
  const [notes, setNotes] = useState(editPosition?.notes || '');
  const [includeInProtocol, setIncludeInProtocol] = useState(
    editPosition ? (editPosition.include_in_protocol !== false) : true
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error('Podaj nazwę pozycji'); return; }
    if (!stageId) { toast.error('Wybierz etap'); return; }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        stage_id: stageId,
        notes,
        include_in_protocol: includeInProtocol,
      };
      if (editPosition) {
        await api.patch(`/budget/positions/${editPosition.id}`, payload);
        toast.success('Pozycja zaktualizowana');
      } else {
        await api.post('/budget/positions', { budowa_id: budowaId, ...payload });
        toast.success('Pozycja utworzona. Kliknij + przy nazwie aby dodać podpozycje.');
      }
      onSaved && onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-md" data-testid="position-modal">
        <DialogHeader>
          <DialogTitle>{editPosition ? 'Edytuj pozycję kosztorysową' : 'Nowa pozycja kosztorysowa'}</DialogTitle>
          {!editPosition && (
            <p className="text-xs text-[#CBD5E1] mt-1">
              Po utworzeniu pozycji kliknij <b className="text-[#D4AF37]">+</b> przy nazwie aby dodać podpozycje (Robocizna / Materiał / Sprzęt).
            </p>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Etap budowy *</label>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)}
              className="w-full bg-[#152033] border border-[#3D5378] text-white rounded px-2 py-1.5 text-sm"
              data-testid="position-stage-select">
              {stages.length === 0 ? <option value="">-- najpierw utwórz etap --</option> :
                stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Nazwa pozycji *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="np. Wykonanie chodnika"
              className="bg-[#152033] border-[#3D5378] text-white"
              data-testid="position-name-input"
              autoFocus />
          </div>
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Notatki (opcjonalnie)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="bg-[#152033] border-[#3D5378] text-white"
              data-testid="position-notes-input" />
          </div>
          {/* Checkbox: zaciagac do protokolu */}
          <label className="flex items-start gap-2 cursor-pointer p-2 rounded bg-[#152033] border border-[#3D5378] hover:border-[#D4AF37]/60 transition">
            <input type="checkbox" checked={includeInProtocol}
              onChange={(e) => setIncludeInProtocol(e.target.checked)}
              className="mt-0.5 accent-[#D4AF37]"
              data-testid="position-include-in-protocol" />
            <div className="flex-1 text-xs">
              <div className="text-white font-semibold">Zaciągaj do protokołu zaawansowania</div>
              <div className="text-[#CBD5E1] mt-0.5">Gdy ZAZNACZONE, pozycja pojawi się w protokole z możliwością wpisania % wykonania. Odznacz dla pozycji pomocniczych (np. „ZUS", „Wynajem biura").</div>
            </div>
          </label>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose} data-testid="position-cancel-btn">Anuluj</Button>
          <ActionButton onAction={save} disabled={busy || !name.trim() || !stageId}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033]"
            data-testid="position-save-btn">
            <Plus className="h-4 w-4 mr-1" /> {editPosition ? 'Zapisz' : 'Utwórz pozycję'}
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};

