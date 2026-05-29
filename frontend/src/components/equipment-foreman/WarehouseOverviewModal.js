// iter95be: WarehouseOverviewModal wyciągnięty z EquipmentForeman.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Warehouse, Wrench, X } from 'lucide-react';

export const WarehouseOverviewModal = ({
  open, allEquipment, allAssignments, allForemen, t, onClose, onPhotoPreview,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#243049] border-[#3D5378] w-full max-w-5xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-[#4F6343]" /> Caly magazyn — przeglad
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="close-warehouse-modal">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          {allEquipment.length === 0 ? (
            <p className="text-[#CBD5E1] text-sm">{t('eq.no_eq')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" data-testid="warehouse-overview-table">
                <thead className="sticky top-0 z-10 bg-[#243049]">
                  <tr className="bg-[#1E2A44]">
                    <th className="border border-[#3D5378] p-2 text-left text-[#F1F5F9]">Nazwa</th>
                    <th className="border border-[#3D5378] p-2 text-left text-[#F1F5F9]">Marka</th>
                    <th className="border border-[#3D5378] p-2 text-center text-[#F1F5F9]">Razem</th>
                    <th className="border border-[#3D5378] p-2 text-center text-[#DC4A3A]">{t('eq.in_repair')}</th>
                    <th className="border border-[#3D5378] p-2 text-center text-[#4F6343]">Magazyn</th>
                    <th className="border border-[#3D5378] p-2 text-left text-[#F1F5F9]">{t('eq.who_has')}</th>
                  </tr>
                </thead>
                <tbody>
                  {allEquipment.map((eq) => {
                    const holders = allAssignments
                      .filter((a) => a.equipment_id === eq.id && a.quantity > 0)
                      .map((a) => {
                        const f = allForemen.find((x) => x.id === a.foreman_id);
                        return f ? `${f.full_name} (${a.quantity})` : null;
                      })
                      .filter(Boolean);
                    return (
                      <tr key={eq.id}>
                        <td className="border border-[#3D5378] p-2">
                          <div className="flex items-center gap-2">
                            {eq.photo ? (
                              <img src={eq.photo} alt={eq.name} className="w-12 h-12 object-contain rounded shrink-0 bg-[#152033] cursor-zoom-in" onClick={() => onPhotoPreview(eq.photo)} />
                            ) : (
                              <div className="w-12 h-12 rounded bg-[#1E2A44] flex items-center justify-center shrink-0">
                                <Wrench className="h-4 w-4 text-[#3D5378]" />
                              </div>
                            )}
                            <span className="text-[#F1F5F9] font-semibold">{eq.name}</span>
                          </div>
                        </td>
                        <td className="border border-[#3D5378] p-2 text-[#CBD5E1]">{eq.brand || '-'}</td>
                        <td className="border border-[#3D5378] p-2 text-center text-[#F1F5F9] font-bold">{eq.total_quantity}</td>
                        <td className="border border-[#3D5378] p-2 text-center text-[#DC4A3A] font-bold">{eq.broken_quantity || 0}</td>
                        <td className={`border border-[#3D5378] p-2 text-center font-bold ${eq.available_quantity > 0 ? 'text-[#4F6343]' : 'text-[#DC4A3A]'}`}>
                          {eq.available_quantity}
                        </td>
                        <td className="border border-[#3D5378] p-2 text-[#CBD5E1]">
                          {holders.length === 0 ? <span className="text-[#94A3B8]">nikt</span> : holders.join(', ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-[#CBD5E1] mt-3">
            Magazynier widzi cale stany sprzętu i kto co posiada. Aby zarzadzac przypisaniami zwroc sie do administratora.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
