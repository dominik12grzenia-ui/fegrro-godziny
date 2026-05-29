// iter95be: HistoryModal wyciągnięty z EquipmentForeman.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { X } from 'lucide-react';

const ACTION_LABELS = {
  return_to_warehouse: 'Zwrot do magazynu',
  defect_report: 'Zgłoszenie usterki',
  receive_from_warehouse: 'Wydanie z magazynu',
};

export const HistoryModal = ({ open, historyData, t, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#243049] border-[#3D5378] w-full max-w-2xl max-h-[80vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#F1F5F9]">{t('eq.history_title')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="overflow-y-auto space-y-3">
          <div>
            <h4 className="text-[#4F6343] font-bold text-sm mb-2">{t('eq.transfers')}</h4>
            {historyData.transfers.length === 0 ? (
              <p className="text-[#CBD5E1] text-xs">{t('eq.no_transfers')}</p>
            ) : (
              <div className="space-y-1" data-testid="my-history-transfers">
                {historyData.transfers.map((tr) => {
                  const isOutgoing = tr.from_foreman_name === historyData.foreman_name;
                  return (
                    <div key={tr.id} className="text-xs p-2 bg-[#1E2A44] rounded border border-[#3D5378]">
                      <span className={isOutgoing ? 'text-[#DC4A3A]' : 'text-[#4F6343]'}>
                        {isOutgoing ? '-> Wyslane do' : '<- Otrzymane od'}
                      </span>{' '}
                      <span className="text-[#F1F5F9] font-semibold">
                        {isOutgoing ? tr.to_foreman_name : tr.from_foreman_name}
                      </span>{' '}
                      <span className="text-[#CBD5E1]">·</span>{' '}
                      <span className="text-[#F1F5F9]">{tr.equipment_name} x {tr.quantity}</span>{' '}
                      <span className="text-[#CBD5E1]">·</span>{' '}
                      <span className={tr.status === 'accepted' ? 'text-[#4F6343]' :
                                        tr.status === 'rejected' ? 'text-[#DC4A3A]' : 'text-[#FCA5A5]'}>
                        {tr.status === 'pending' ? 'Oczekuje' : tr.status === 'accepted' ? 'Zaakceptowane' : 'Odrzucone'}
                      </span>{' '}
                      <span className="text-[#94A3B8]">· {new Date(tr.created_at).toLocaleString('pl-PL')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {historyData.events.length > 0 && (
            <div>
              <h4 className="text-[#4F6343] font-bold text-sm mb-2 mt-3">{t('eq.returns_defects')}</h4>
              <div className="space-y-1">
                {historyData.events.map((e) => (
                  <div key={e.id} className="text-xs p-2 bg-[#1E2A44] rounded border border-[#3D5378]">
                    <span className="text-[#4F6343] font-semibold">{ACTION_LABELS[e.action] || e.action}</span>{' '}
                    <span className="text-[#F1F5F9]">{e.details?.equipment_name || ''} x {e.details?.quantity || '?'}</span>
                    {e.details?.description && <span className="text-[#CBD5E1]"> · "{e.details.description}"</span>}{' '}
                    <span className="text-[#94A3B8]">· {new Date(e.created_at).toLocaleString('pl-PL')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
