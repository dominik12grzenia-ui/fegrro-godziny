// iter95be: PenaltyModal (Kary) wyciągnięty z HoursTable.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const fmtZl = (v) =>
  Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ');

export const PenaltyModal = ({
  employee, selectedMonth, penaltyList,
  newPenaltyAmount, setNewPenaltyAmount, newPenaltyDesc, setNewPenaltyDesc,
  newPenaltyImage, onImageUpload, viewPenaltyImage, setViewPenaltyImage,
  onAdd, onDelete, onClose,
}) => {
  if (!employee) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <Card className="bg-[#243049] border-[#3D5378] w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <CardHeader className="pb-3">
            <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#9B2C2C]" />
              Kary: {employee.full_name}
            </CardTitle>
            <p className="text-xs text-[#CBD5E1]">{format(selectedMonth, 'LLLL yyyy', { locale: pl })}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 bg-[#1E2A44] rounded-lg border border-[#3D5378] flex items-center justify-between">
              <span className="text-[#CBD5E1] text-sm">Suma kar:</span>
              <span className="text-[#9B2C2C] font-bold text-xl" data-testid="penalty-total">
                {fmtZl(penaltyList.reduce((s, p) => s + p.amount, 0))} zł
              </span>
            </div>
            {penaltyList.length > 0 ? (
              <div className="space-y-2">
                {penaltyList.map(pen => (
                  <div key={pen.id} className="p-3 bg-[#1E2A44] rounded-lg border border-[#3D5378]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#9B2C2C] font-bold text-lg">{fmtZl(pen.amount)} zł</span>
                      <span className="text-[#94A3B8] text-[10px]">{pen.created_at ? new Date(pen.created_at).toLocaleString('pl-PL') : ''}</span>
                    </div>
                    {pen.description && <p className="text-[#CBD5E1] text-xs mb-2">{pen.description}</p>}
                    {pen.image_data && (
                      <img src={pen.image_data} alt="Zdjecie kary"
                        className="w-full max-h-40 object-cover rounded cursor-pointer mb-2 border border-[#3D5378]"
                        onClick={() => setViewPenaltyImage(pen.image_data)}
                        data-testid={`penalty-image-${pen.id}`} />
                    )}
                    <Button onClick={() => onDelete(pen.id)} size="sm" variant="outline"
                      className="border-[#6B4444] text-[#9B2C2C] hover:bg-[#6B4444] h-7 text-[10px] px-2"
                      data-testid={`delete-penalty-${pen.id}`}>Usuń</Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[#94A3B8] text-sm text-center py-4">Brak kar w tym miesiącu</p>
            )}
            <div className="p-3 bg-[#152033] rounded-lg border border-[#9B2C2C]/20">
              <p className="text-[#F1F5F9] text-xs font-semibold mb-2">Dodaj nowa kare</p>
              <div className="flex gap-2 mb-2">
                <Input type="number" min="0" value={newPenaltyAmount} onChange={e => setNewPenaltyAmount(e.target.value)}
                  placeholder="Kwota (zł)" className="bg-[#1E2A44] text-white border-[#3D5378] text-sm flex-1"
                  data-testid="new-penalty-amount" />
              </div>
              <Input value={newPenaltyDesc} onChange={e => setNewPenaltyDesc(e.target.value)}
                placeholder="Opis kary" className="bg-[#1E2A44] text-white border-[#3D5378] text-sm mb-2"
                data-testid="new-penalty-desc" />
              <div className="flex gap-2 items-center mb-2">
                <label className="flex items-center gap-2 cursor-pointer text-[#CBD5E1] text-xs bg-[#1E2A44] border border-[#3D5378] rounded px-3 py-2 hover:bg-[#3D5378]">
                  <input type="file" accept="image/*" onChange={onImageUpload} className="hidden" data-testid="penalty-image-upload" />
                  {newPenaltyImage ? 'Zdjecie dodane' : 'Dodaj zdjecie'}
                </label>
                {newPenaltyImage && <img src={newPenaltyImage} alt="Preview" className="h-10 w-10 rounded object-cover border border-[#3D5378]" />}
              </div>
              <ActionButton onAction={onAdd} className="w-full bg-[#9B2C2C] hover:bg-[#B91C1C] text-white"
                data-testid="add-penalty-btn">Dodaj kare</ActionButton>
            </div>
            <Button onClick={onClose} className="w-full bg-[#3D5378] text-[#F1F5F9] hover:bg-[#3D4F63]">Zamknij</Button>
          </CardContent>
        </Card>
      </div>
      {viewPenaltyImage && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setViewPenaltyImage(null)}>
          <img src={viewPenaltyImage} alt="Kara" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </>
  );
};
