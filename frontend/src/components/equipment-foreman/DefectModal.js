// iter95be: DefectModal wyciągnięty z EquipmentForeman.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';
import { X } from 'lucide-react';

export const DefectModal = ({
  modal, defectQty, setDefectQty, defectDesc, setDefectDesc, defectPhoto,
  onPhotoUpload, t, onClose, onConfirm,
}) => {
  if (!modal) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1]">Usterka: {modal.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.qty_pcs')}</label>
            <Input type="number" min="1" max={modal.quantity} value={defectQty}
              onChange={(e) => setDefectQty(e.target.value)}
              className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
              data-testid="defect-qty-input" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.defect_description')}</label>
            <textarea value={defectDesc} onChange={(e) => setDefectDesc(e.target.value)} rows="3"
              className="w-full bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              data-testid="defect-desc-input" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.photo_2mb')}</label>
            <input type="file" accept="image/*" capture="environment"
              onChange={onPhotoUpload}
              className="text-xs text-[#CBD5E1]"
              data-testid="defect-photo-input" />
            {defectPhoto && <img src={defectPhoto} alt="podglad" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0B1120]" />}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <ActionButton onAction={onConfirm} loadingText="Zgłaszam..." successText="✓ Zgłoszono"
              className="bg-[#DC4A3A] hover:bg-[#C56A52] text-white" data-testid="confirm-defect-btn">
              Zglos
            </ActionButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
