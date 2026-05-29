// iter95bf: DiagnosticsModal (weryfikacja godzin) wyciągnięty z PayrollAdmin.js
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { ActionButton } from '../ui/action-button';

const PL_MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];

export const DiagnosticsModal = ({
  diagnostics, setDiagnostics, month, year,
  diagLoading, fixDuplicates, deleteOrphans,
}) => (
  <Dialog open={!!diagnostics} onOpenChange={(o) => !o && setDiagnostics(null)}>
    <DialogContent className="bg-[#19243C] border-[#2A3B59] text-[#CBD5E1] max-w-3xl max-h-[85vh] overflow-auto" data-testid="payroll-diagnostics-modal">
      <DialogHeader>
        <DialogTitle className="text-white">Weryfikacja godzin {PL_MONTHS[month-1]} {year}</DialogTitle>
      </DialogHeader>
      {diagnostics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="bg-[#131C2F] rounded p-2">
              <div className="text-[#94A3B8] text-xs">Wpisy ogolem</div>
              <div className="text-white font-bold">{diagnostics.total_entries_in_month}</div>
            </div>
            <div className="bg-[#131C2F] rounded p-2">
              <div className="text-[#94A3B8] text-xs">Suma godz. (agregacja)</div>
              <div className="text-white font-bold">{diagnostics.total_hours_aggregated}h</div>
            </div>
            <div className="bg-[#131C2F] rounded p-2">
              <div className="text-[#94A3B8] text-xs">Suma godz. (grupowane)</div>
              <div className="text-white font-bold">{diagnostics.total_hours_grouped}h</div>
            </div>
            <div className="bg-[#131C2F] rounded p-2">
              <div className="text-[#94A3B8] text-xs">Bledy typu / sieroty</div>
              <div className="text-white font-bold">{diagnostics.type_issues} / {diagnostics.orphan_employee_entries}</div>
            </div>
          </div>

          {diagnostics.mismatches.length === 0 ? (
            <div className="bg-[#4F6343]/20 border border-[#4F6343] rounded p-3 text-[#A7C09A] text-sm" data-testid="diagnostics-ok">
              Wszystko sie zgadza - sumy godzin w zakladce <strong>Godziny</strong> sa identyczne jak w <strong>Wyplatach</strong>.
            </div>
          ) : (
            <>
              <div className="bg-[#DC4A3A]/15 border border-[#DC4A3A] rounded p-3 text-[#FCD34D] text-sm">
                Znaleziono <strong>{diagnostics.mismatches.length}</strong> rozbieżności. Po naprawie godziny będą identyczne w obu zakladkach.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#131C2F] text-[#94A3B8]">
                    <tr>
                      <th className="p-2 text-left">Pracownik</th>
                      <th className="p-2 text-right">Agreg.</th>
                      <th className="p-2 text-right">Grupow.</th>
                      <th className="p-2 text-right">Różnica</th>
                      <th className="p-2 text-left">Duplikaty (daty)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.mismatches.map((m) => (
                      <tr key={m.employee_id} className="border-t border-[#2A3B59]" data-testid={`diagnostics-row-${m.employee_id}`}>
                        <td className="p-2 text-white">
                          {m.full_name}
                          {m.is_orphan && <span className="ml-1 text-[#DC4A3A]">(sierota)</span>}
                        </td>
                        <td className="p-2 text-right">{m.agg_hours}</td>
                        <td className="p-2 text-right">{m.grouped_hours}</td>
                        <td className={`p-2 text-right font-bold ${Math.abs(m.diff) >= 0.01 ? 'text-[#DC4A3A]' : 'text-[#94A3B8]'}`}>
                          {m.diff > 0 ? '+' : ''}{m.diff}
                        </td>
                        <td className="p-2 text-[#94A3B8]">
                          {m.duplicate_dates.length > 0 ? m.duplicate_dates.join(', ') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
      <DialogFooter className="flex justify-between flex-wrap gap-2">
        {diagnostics && diagnostics.mismatches.some(m => m.duplicate_dates.length > 0) && (
          <Button onClick={fixDuplicates} disabled={diagLoading}
            className="bg-[#DC4A3A] hover:bg-[#D9744F] text-white"
            data-testid="diagnostics-fix-duplicates">
            Napraw duplikaty
          </Button>
        )}
        {diagnostics && diagnostics.mismatches.some(m => m.is_orphan) && (
          <ActionButton onAction={deleteOrphans} disabled={diagLoading}
            className="bg-[#9B2C2C] hover:bg-[#B91C1C] text-white"
            data-testid="diagnostics-delete-orphans">Usuń wpisy osieroconych</ActionButton>
        )}
        <Button variant="outline" onClick={() => setDiagnostics(null)}
          className="border-[#2A3B59] text-[#CBD5E1] hover:bg-[#2A3B59] hover:text-white"
          data-testid="diagnostics-close">
          Zamknij
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
