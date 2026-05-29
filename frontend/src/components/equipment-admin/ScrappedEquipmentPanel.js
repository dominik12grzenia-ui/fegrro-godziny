// iter95bf: ScrappedEquipmentPanel wyciągnięty z EquipmentAdmin.js
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Trash2 } from 'lucide-react';

export const ScrappedEquipmentPanel = ({ scrapped, showScrapped, setShowScrapped }) => {
  if (!scrapped || scrapped.length === 0) return null;
  return (
    <Card className="bg-[#243049] border-[#3D5378]">
      <CardHeader className="cursor-pointer" onClick={() => setShowScrapped((v) => !v)}>
        <CardTitle className="text-[#F1F5F9] flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-[#DC4A3A]" /> Zlom i zaginiecia ({scrapped.length})
          </span>
          <span className="text-xs text-[#CBD5E1]">{showScrapped ? 'Ukryj' : 'Pokaż'}</span>
        </CardTitle>
      </CardHeader>
      {showScrapped && (
        <CardContent>
          <div className="space-y-2">
            {scrapped.map((d) => (
              <div
                key={d.id}
                className="text-sm p-2 rounded border bg-[#1E2A44] border-[#9B2C2C]/40"
                data-testid={`scrap-${d.id}`}
              >
                <div className="flex justify-between flex-wrap gap-2">
                  <span>
                    <span className="text-[#DC4A3A] font-semibold line-through">{d.equipment_name}</span>
                    <span className="text-[#CBD5E1]"> x {d.quantity}</span>
                    <span className="text-[#CBD5E1]"> · zglosil </span>
                    <span className="text-[#F1F5F9]">{d.foreman_name}</span>
                  </span>
                  <span className="text-[#94A3B8] text-xs">
                    {d.resolved_at ? new Date(d.resolved_at).toLocaleString('pl-PL') : new Date(d.created_at).toLocaleString('pl-PL')}
                  </span>
                </div>
                {d.description && <p className="text-xs text-[#CBD5E1] mt-1">{d.description}</p>}
                {d.resolved_by_name && (
                  <p className="text-[11px] text-[#94A3B8] mt-1">Zezlomowal {d.resolved_by_name}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
