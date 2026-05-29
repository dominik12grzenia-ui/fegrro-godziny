// iter95be: EmployeeLinksModal wyciągnięty z HoursTable.js (refaktor split)
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Link2, Copy } from 'lucide-react';
import { toast } from 'sonner';

export const EmployeeLinksModal = ({ open, employeeLinks, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="bg-[#243049] border-[#3D5378] w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
            <Link2 className="h-5 w-5 text-[#4F6343]" />
            Linki z godzinami dla pracownikow
          </CardTitle>
          <p className="text-xs text-[#CBD5E1]">Skopiuj link i wyslij pracownikowi przez Viber/WhatsApp</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {employeeLinks.map(link => {
            const fullUrl = `${window.location.origin}/hours/${link.token}`;
            return (
              <div key={link.employee_id} className="p-3 bg-[#1E2A44] rounded-lg border border-[#3D5378]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#F1F5F9] font-semibold">{link.full_name}</span>
                  <span className="text-[#94A3B8] text-xs">{link.phone_number || 'brak tel.'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={fullUrl}
                    className="flex-1 bg-[#152033] text-[#CBD5E1] text-xs rounded px-2 py-1.5 border border-[#3D5378]"
                    data-testid={`link-${link.employee_id}`}
                  />
                  <Button
                    onClick={() => { navigator.clipboard.writeText(fullUrl); toast.success(`Link skopiowany: ${link.full_name}`); }}
                    size="sm"
                    className="bg-[#4F6343] hover:bg-[#3F5235] text-white shrink-0"
                    data-testid={`copy-link-${link.employee_id}`}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button onClick={onClose} className="w-full bg-[#3D5378] text-[#F1F5F9] hover:bg-[#3D4F63]">
            Zamknij
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
