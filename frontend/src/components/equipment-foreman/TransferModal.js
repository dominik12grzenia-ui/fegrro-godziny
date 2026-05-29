// iter95be: TransferModal wyciągnięty z EquipmentForeman.js (refaktor split, props-driven)
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';
import { X } from 'lucide-react';

export const TransferModal = ({
  modal, transferTo, setTransferTo, transferQty, setTransferQty,
  foremen, t, onClose, onConfirm,
}) => {
  if (!modal) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1]">Przekaz: {modal.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#94A3B8]">
            Posiadasz: <span className="text-[#CBD5E1] font-semibold">{modal.quantity} szt.</span>
          </p>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.foreman_required')}</label>
            <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
              className="w-full bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              data-testid="transfer-to-select">
              <option value="">-- wybierz --</option>
              {foremen.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.qty_required')}</label>
            <Input type="number" min="1" max={modal.quantity} value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
              data-testid="transfer-qty-input" />
          </div>
          <p className="text-xs text-[#94A3B8]">Drugi brygadzista musi zaakceptowac przekazanie.</p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <ActionButton onAction={onConfirm} loadingText="Wysyłam..." successText="✓ Wysłano"
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="confirm-transfer-btn">
              Wyslij
            </ActionButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
