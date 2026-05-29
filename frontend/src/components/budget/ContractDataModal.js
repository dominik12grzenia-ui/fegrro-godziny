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
import { BudgetNipLookup } from './BudgetNipLookup';

export const ContractDataModal = ({ budowaId, initial, onClose, onSaved }) => {
  const [form, setForm] = useState({
    umowa_nr: initial?.umowa_nr || '',
    umowa_data: initial?.umowa_data || '',
    zamawiajacy: initial?.zamawiajacy || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.umowa_nr.trim()) { toast.error('Podaj numer umowy'); return; }
    if (!form.zamawiajacy.trim()) { toast.error('Podaj dane zamawiającego'); return; }
    setSaving(true);
    try {
      await api.patch(`/budget/${budowaId}/contract`, form);
      toast.success('Zapisane');
      onSaved();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-lg" data-testid="contract-data-modal">
        <DialogHeader>
          <DialogTitle>Uzupełnij dane do umowy</DialogTitle>
          <p className="text-xs text-[#CBD5E1] mt-1">
            Te dane pojawią się w nagłówku każdego protokołu tej budowy. Uzupełnij je raz — później będą używane automatycznie.
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#CBD5E1] block mb-1">Numer umowy *</label>
            <Input value={form.umowa_nr} onChange={(e) => setForm({...form, umowa_nr: e.target.value})}
              placeholder="np. UMOWA 051/FEGRRO/PLICHTA MG LETNICA/26"
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="contract-umowa-nr" />
          </div>
          <div>
            <label className="text-xs text-[#CBD5E1] block mb-1">Data umowy</label>
            <Input value={form.umowa_data} onChange={(e) => setForm({...form, umowa_data: e.target.value})}
              placeholder="np. 15.09.2025 + ANEKS NR 1"
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="contract-umowa-data" />
          </div>
          <div>
            <label className="text-xs text-[#CBD5E1] block mb-1">Zamawiający (nazwa, adres, NIP) *</label>
            <BudgetNipLookup onResult={(text) => setForm({...form, zamawiajacy: text})} />
            <textarea value={form.zamawiajacy} onChange={(e) => setForm({...form, zamawiajacy: e.target.value})}
              rows={3}
              placeholder="np. ALLCON BUDOWNICTWO Sp. z o.o., al. marsz. Piłsudskiego 11/2.1, 81-400 Gdynia, NIP 5862181834"
              className="w-full bg-[#152033] border border-[#3D5378] text-white rounded px-2 py-1.5 text-sm"
              data-testid="contract-zamawiajacy" />
          </div>
          <div className="bg-[#152033] border border-[#4F6343]/40 rounded p-2 text-xs">
            <div className="text-[#CBD5E1] mb-1">Wykonawca (stały):</div>
            <div className="text-[#5F7552] font-semibold">FEGRRO SP. Z O.O.</div>
            <div className="text-[#F1F5F9]">NIP: 589-206-61-74</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#3D5378] text-[#CBD5E1]">Anuluj</Button>
          <ActionButton onAction={save} disabled={saving} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="contract-save">{saving ? 'Zapisuję...' : 'Zapisz i pobierz protokół'}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

