// iter95be: AdvanceModal (Zaliczki) wyciągnięty z HoursTable.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';
import { Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const fmtZl = (v) =>
  Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ');

export const AdvanceModal = ({
  employee, selectedMonth, advanceList,
  newAdvanceAmount, setNewAdvanceAmount, newAdvanceNote, setNewAdvanceNote,
  carryForwardId, setCarryForwardId, carryAmount, setCarryAmount,
  onAdd, onDelete, onCarryForward, onClose,
}) => {
  if (!employee) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader className="pb-3">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[#DC4A3A]" />
            Zaliczki: {employee.full_name}
          </CardTitle>
          <p className="text-xs text-[#94A3B8]">{format(selectedMonth, 'LLLL yyyy', { locale: pl })}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-[#131C2F] rounded-lg border border-[#2A3B59] flex items-center justify-between">
            <span className="text-[#94A3B8] text-sm">Suma zaliczek:</span>
            <span className="text-[#DC4A3A] font-bold text-xl" data-testid="advance-total">
              {fmtZl(advanceList.reduce((s, a) => s + a.amount, 0))} zł
            </span>
          </div>
          {advanceList.length > 0 ? (
            <div className="space-y-2">
              {advanceList.map(adv => (
                <div key={adv.id} className="p-3 bg-[#131C2F] rounded-lg border border-[#2A3B59]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#CBD5E1] font-bold text-lg">{fmtZl(adv.amount)} zł</span>
                    <span className="text-[#64748B] text-[10px]">{adv.created_at ? new Date(adv.created_at).toLocaleString('pl-PL') : ''}</span>
                  </div>
                  {adv.note && <p className="text-[#94A3B8] text-xs mb-2">{adv.note}</p>}
                  {adv.carried_from_month && (
                    <p className="text-[#5F7552] text-[10px] mb-2">Przeniesione z {adv.carried_from_month}/{adv.carried_from_year}</p>
                  )}
                  <div className="flex gap-2">
                    {carryForwardId === adv.id ? (
                      <div className="flex gap-1 flex-1">
                        <Input type="number" min="0" max={adv.amount} value={carryAmount}
                          onChange={e => setCarryAmount(e.target.value)} placeholder="Kwota"
                          className="bg-[#0B1120] text-white border-[#2A3B59] text-xs h-7 flex-1"
                          data-testid="carry-amount-input" />
                        <Button onClick={() => onCarryForward(adv.id)} size="sm"
                          className="bg-[#4F6343] hover:bg-[#3F5235] text-white h-7 text-xs px-2"
                          data-testid="carry-confirm-btn">OK</Button>
                        <Button onClick={() => { setCarryForwardId(null); setCarryAmount(''); }} size="sm"
                          variant="outline" className="border-[#2A3B59] text-[#94A3B8] h-7 text-xs px-2">X</Button>
                      </div>
                    ) : (
                      <>
                        <Button onClick={() => { setCarryForwardId(adv.id); setCarryAmount(String(adv.amount)); }}
                          size="sm" variant="outline"
                          className="border-[#2A3B59] text-[#94A3B8] hover:text-[#CBD5E1] h-7 text-[10px] px-2"
                          data-testid={`carry-btn-${adv.id}`}>Przenies</Button>
                        <Button onClick={() => onDelete(adv.id)} size="sm" variant="outline"
                          className="border-[#6B4444] text-[#DC4A3A] hover:bg-[#6B4444] h-7 text-[10px] px-2"
                          data-testid={`delete-advance-${adv.id}`}>Usuń</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[#64748B] text-sm text-center py-4">Brak zaliczek w tym miesiącu</p>
          )}
          <div className="p-3 bg-[#0B1120] rounded-lg border border-[#4F6343]/30">
            <p className="text-[#CBD5E1] text-xs font-semibold mb-2">Dodaj nowa zaliczke</p>
            <div className="flex gap-2 mb-2">
              <Input type="number" min="0" value={newAdvanceAmount} onChange={e => setNewAdvanceAmount(e.target.value)}
                placeholder="Kwota (zł)" className="bg-[#131C2F] text-white border-[#2A3B59] text-sm flex-1"
                data-testid="new-advance-amount" />
            </div>
            <div className="flex gap-2">
              <Input value={newAdvanceNote} onChange={e => setNewAdvanceNote(e.target.value)}
                placeholder="Notatka (opcjonalnie)" className="bg-[#131C2F] text-white border-[#2A3B59] text-sm flex-1"
                data-testid="new-advance-note" />
              <ActionButton onAction={onAdd} className="bg-[#4F6343] hover:bg-[#3F5235] text-white shrink-0"
                data-testid="add-advance-btn">Dodaj</ActionButton>
            </div>
          </div>
          <Button onClick={onClose} className="w-full bg-[#2A3B59] text-[#CBD5E1] hover:bg-[#3D4F63]">Zamknij</Button>
        </CardContent>
      </Card>
    </div>
  );
};
