// iter95bf: AuditHistoryModal wyciągnięty z PayrollAdmin.js
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';

export const AuditHistoryModal = ({ auditFor, auditEntries, setAuditFor, fieldLabels, fmtVal }) => (
  <Dialog open={!!auditFor} onOpenChange={(o) => !o && setAuditFor(null)}>
    <DialogContent className="bg-[#243049] border-[#3D5378] text-[#F1F5F9] max-w-2xl" data-testid="payroll-audit-modal">
      <DialogHeader>
        <DialogTitle className="text-white">Historia zmian - {auditFor?.name}</DialogTitle>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto">
        {auditEntries.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-4 text-center">Brak zmian w tym miesiącu.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#1E2A44] sticky top-0">
              <tr>
                <th className="p-2 text-left text-[#CBD5E1]">Data</th>
                <th className="p-2 text-left text-[#CBD5E1]">Pole</th>
                <th className="p-2 text-right text-[#CBD5E1]">Stara</th>
                <th className="p-2 text-right text-[#CBD5E1]">Nowa</th>
                <th className="p-2 text-left text-[#CBD5E1]">Kto</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((e) => (
                <tr key={e.id} className="border-t border-[#3D5378]">
                  <td className="p-2 text-[#F1F5F9] whitespace-nowrap">{e.changed_at.replace('T', ' ').slice(0, 16)}</td>
                  <td className="p-2 text-[#F1F5F9]">{fieldLabels[e.field] || e.field}</td>
                  <td className="p-2 text-right text-[#CBD5E1] line-through">{fmtVal(e.field, e.old_value)}</td>
                  <td className="p-2 text-right text-[#4F6343] font-bold">{fmtVal(e.field, e.new_value)}</td>
                  <td className="p-2 text-[#CBD5E1]">{e.changed_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setAuditFor(null)} className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378] hover:text-white">
          Zamknij
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
