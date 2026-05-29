// iter95bf: TransferFromWarehouseModal wyciągnięty z EquipmentAdmin.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';
import { Input } from '../ui/input';
import { Send, X } from 'lucide-react';

export const TransferFromWarehouseModal = ({
  transferModal, transferForemanId, setTransferForemanId,
  transferQty, setTransferQty, foremen,
  onClose, onSubmit,
}) => {
  if (!transferModal) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" data-testid="transfer-from-warehouse-modal">
      <Card className="bg-[#243049] border-[#3D5378] w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
            <Send className="h-5 w-5 text-[#4F6343]" />
            Przekaż sprzęt z magazynu
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="close-transfer-modal">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-2 bg-[#1E2A44] rounded border border-[#3D5378] text-sm">
            <div className="text-[#F1F5F9] font-semibold">{transferModal.name}</div>
            {transferModal.brand && (
              <div className="text-[#CBD5E1] text-xs">{transferModal.brand}</div>
            )}
            <div className="text-xs text-[#CBD5E1] mt-1">
              Dostępne w magazynie: <span className="text-[#9DBC85] font-bold">{transferModal.available_quantity || 0}</span> szt.
              {(transferModal.broken_quantity || 0) > 0 && (
                <span className="ml-2 text-[#DC4A3A]">(w naprawie: {transferModal.broken_quantity})</span>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Brygadzista</label>
            <select
              value={transferForemanId}
              onChange={(e) => setTransferForemanId(e.target.value)}
              className="w-full bg-[#1E2A44] border border-[#3D5378] text-[#F1F5F9] rounded px-3 py-2 text-sm"
              data-testid="transfer-foreman-select"
            >
              <option value="">-- wybierz --</option>
              {foremen.map((f) => (
                <option key={f.id} value={f.id}>{f.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Ilość</label>
            <Input
              type="number"
              min="1"
              max={transferModal.available_quantity || 1}
              value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]"
              data-testid="transfer-qty-input"
            />
          </div>
          <p className="text-[11px] text-[#CBD5E1] bg-[#152033] p-2 rounded border border-[#3D5378]">
            Brygadzista musi zaakceptować przekazanie. Stan magazynu zmieni się dopiero po akceptacji.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={onClose} data-testid="transfer-cancel-btn">
              Anuluj
            </Button>
            <ActionButton
              onAction={onSubmit}
              loadingText="Wysyłam..."
              successText="✓ Wysłano"
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
              data-testid="transfer-submit-btn"
            >
              <Send className="h-4 w-4 mr-1" /> Wyślij przekazanie
            </ActionButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
