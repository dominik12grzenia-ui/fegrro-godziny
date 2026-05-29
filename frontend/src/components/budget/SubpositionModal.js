// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton, BUDGET_TYPES } from './_shared';

export const SubpositionModal = ({ budowaId, position, stageId, existingLines = [], onClose, onSaved }) => {
  const [form, setForm] = useState({
    type: 'labor', // labor | materials | equipment
    name: position?.name || '',
    unit: '',
    quantity: '',
    unit_price_netto: '',
    kaucja_gir_pct: '',
    kaucja_dw_pct: '',
  });
  const [busy, setBusy] = useState(false);

  // iter86: znajdz istniejacy slot tego typu dla tej pozycji (sa "kontenery" - parent_id=null)
  const existingSlot = (existingLines || []).find(
    (l) => l.position_id === position?.id && !l.parent_id && (l.type || 'materials') === form.type,
  );

  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę podpozycji'); return; }
    setBusy(true);
    try {
      const payload = {
        budowa_id: budowaId,
        category: BUDGET_TYPES[form.type]?.label || 'Podpozycja',
        name: form.name.trim(),
        type: form.type,
        unit: form.unit || null,
        quantity: parseFloat(form.quantity) || 0,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0,
        position_id: position.id,
        stage_id: stageId || position.stage_id,
        kaucja_gir_pct: form.kaucja_gir_pct === '' ? null : parseFloat(form.kaucja_gir_pct),
        kaucja_dw_pct: form.kaucja_dw_pct === '' ? null : parseFloat(form.kaucja_dw_pct),
      };
      // iter86: jezeli slot tego typu juz istnieje, dodaj jako skladowa (child)
      if (existingSlot) {
        payload.parent_id = existingSlot.id;
      }
      await api.post('/budget/lines', payload);
      toast.success(
        existingSlot
          ? `Dodano składową do: ${BUDGET_TYPES[form.type].label}`
          : `Dodano podpozycję: ${BUDGET_TYPES[form.type].label}`,
      );
      onSaved && onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-md" data-testid="subposition-modal">
        <DialogHeader>
          <DialogTitle>Dodaj podpozycję do: {position?.name}</DialogTitle>
          <p className="text-xs text-[#CBD5E1] mt-1">Wybierz kategorię kosztu i wprowadź wartości.</p>
        </DialogHeader>
        {existingSlot && (
          <div className="rounded p-2 border border-[#5F7552]/60 bg-[#5F7552]/15 text-[#A7D29E] text-xs mb-2" data-testid="subposition-existing-slot-hint">
            ℹ <b>{BUDGET_TYPES[form.type].label}</b> już istnieje (<span className="font-mono">{existingSlot.name}</span>). Nowy wpis zostanie dodany jako <b>kolejna składowa</b> do tego samego rodzaju.
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Kategoria *</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'labor', label: 'Robocizna' },
                { v: 'materials', label: 'Materiał' },
                { v: 'equipment', label: 'Sprzęt' },
              ].map((opt) => {
                const cfg = BUDGET_TYPES[opt.v];
                const selected = form.type === opt.v;
                return (
                  <button key={opt.v} type="button"
                    onClick={() => setForm({ ...form, type: opt.v })}
                    className={`px-3 py-2 rounded border text-xs font-semibold transition ${selected ? 'ring-2 ring-[#D4AF37]' : ''}`}
                    style={{ backgroundColor: selected ? cfg.bg : `${cfg.color}15`, color: selected ? cfg.textOnBg : cfg.color, borderColor: cfg.color }}
                    data-testid={`subposition-type-${opt.v}`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Nazwa podpozycji *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="np. Beton C8/10 chudziak"
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="subposition-name-input" autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-[#CBD5E1] mb-1 block">Jedn.</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="m³, mb, szt"
                className="bg-[#152033] border-[#3D5378] text-white" data-testid="subposition-unit-input" />
            </div>
            <div>
              <label className="text-xs text-[#CBD5E1] mb-1 block">Ilość</label>
              <Input type="number" min="0" step="0.01" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="bg-[#152033] border-[#3D5378] text-white" data-testid="subposition-quantity-input" />
            </div>
            <div>
              <label className="text-xs text-[#CBD5E1] mb-1 block">Cena netto</label>
              <Input type="number" min="0" step="0.01" value={form.unit_price_netto}
                onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })}
                className="bg-[#152033] border-[#3D5378] text-white" data-testid="subposition-price-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#CBD5E1] mb-1 block">Kaucja GIR % (opcjonalne)</label>
              <Input type="number" min="0" step="0.1" value={form.kaucja_gir_pct}
                onChange={(e) => setForm({ ...form, kaucja_gir_pct: e.target.value })}
                placeholder="dziedziczy z budowy" className="bg-[#152033] border-[#3D5378] text-white" data-testid="subposition-gir-input" />
            </div>
            <div>
              <label className="text-xs text-[#CBD5E1] mb-1 block">Kaucja DW % (opcjonalne)</label>
              <Input type="number" min="0" step="0.1" value={form.kaucja_dw_pct}
                onChange={(e) => setForm({ ...form, kaucja_dw_pct: e.target.value })}
                placeholder="dziedziczy z budowy" className="bg-[#152033] border-[#3D5378] text-white" data-testid="subposition-dw-input" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose} data-testid="subposition-cancel-btn">Anuluj</Button>
          <ActionButton onAction={save} disabled={busy || !form.name.trim()}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033]"
            data-testid="subposition-save-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj podpozycję
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};

