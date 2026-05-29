// iter95be: ReturnModal wyciągnięty z EquipmentForeman.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';
import { X } from 'lucide-react';

export const ReturnModal = ({ modal, returnQty, setReturnQty, t, onClose, onConfirm }) => {
  if (!modal) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1]">Zwrot do magazynu: {modal.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#94A3B8]">
            Posiadasz: <span className="text-[#CBD5E1] font-semibold">{modal.quantity} szt.</span>
          </p>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.qty_to_return')}</label>
            <Input type="number" min="1" max={modal.quantity} value={returnQty}
              onChange={(e) => setReturnQty(e.target.value)}
              className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
              data-testid="return-qty-input" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <ActionButton onAction={onConfirm} loadingText="Zwracam..." successText="✓ Zwrócono"
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="confirm-return-btn">
              Zwroc do magazynu
            </ActionButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
