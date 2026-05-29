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

export const CategoryStageManager = ({ mode, budowaId, items, onClose, onChanged }) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const isStages = mode === 'stages';
  const label = isStages ? 'Etapy budowy' : 'Kategorie kosztowe';

  const add = async () => {
    if (!name.trim()) { toast.error('Podaj nazwę'); return; }
    setBusy(true);
    try {
      const url = isStages ? '/budget/stages' : '/budget/categories';
      const payload = { budowa_id: budowaId, name: name.trim() };
      if (isStages) {
        payload.start_date = startDate || null;
        payload.end_date = endDate || null;
      }
      await api.post(url, payload);
      toast.success('Dodano');
      setName(''); setStartDate(''); setEndDate('');
      onChanged();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm(`Usunąć ${isStages ? 'etap' : 'kategorię'}? Pozycje pozostaną, ale stracą przypisanie.`)) return;
    try {
      const url = isStages ? `/budget/stages/${id}` : `/budget/categories/${id}`;
      await api.delete(url);
      toast.success('Usunięto');
      onChanged();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-md" data-testid={`manager-${mode}-modal`}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <p className="text-xs text-[#CBD5E1] mt-1">
            {isStages
              ? 'Etapy grupują wizualnie pozycje budżetu (np. „Stan zerowy", „Konstrukcja", „Wykończenia").'
              : 'Kategorie kosztowe to predefiniowane grupy używane w pozycjach budżetu (np. „Beton", „Stal", „Robocizna").'}
          </p>
        </DialogHeader>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-xs text-[#CBD5E1] py-2 text-center">Brak — dodaj pierwszy poniżej</div>
          ) : items.map((it) => (
            <div key={it.id} className="flex items-center justify-between bg-[#152033] rounded px-3 py-1.5 text-sm" data-testid={`manager-item-${it.id}`}>
              <div>
                <span className="text-white">{it.name}</span>
                {isStages && (it.start_date || it.end_date) && (
                  <span className="text-[#CBD5E1] text-xs ml-2">({it.start_date || '?'} → {it.end_date || '?'})</span>
                )}
                {it.lines_count !== undefined && (
                  <span className="text-[#CBD5E1] text-xs ml-2">[{it.lines_count} poz.]</span>
                )}
              </div>
              <button onClick={() => remove(it.id)} className="text-[#FCA5A5] hover:text-[#F87171]" data-testid={`manager-del-${it.id}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-[#3D5378] pt-3 space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={isStages ? 'Nazwa etapu, np. Stan surowy' : 'Nazwa kategorii, np. Beton'}
            className="bg-[#152033] border-[#3D5378]" data-testid={`manager-new-name-${mode}`} />
          {isStages && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                placeholder="Start" className="bg-[#152033] border-[#3D5378]" data-testid="manager-stage-start" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                placeholder="Koniec" className="bg-[#152033] border-[#3D5378]" data-testid="manager-stage-end" />
            </div>
          )}
          <ActionButton onAction={add} disabled={busy} className="w-full bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid={`manager-add-${mode}`}><Plus className="h-4 w-4 mr-1" /> Dodaj</ActionButton>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#3D5378] text-[#CBD5E1]">Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

