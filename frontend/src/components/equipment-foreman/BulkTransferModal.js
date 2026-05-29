// iter95bd: BulkTransferModal wyciągnięty z EquipmentForeman.js (refaktor split)
// Props-driven: parent zarządza state (bulkItems, bulkTo, bulkSending), modal tylko renderuje + woła callbacki.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { X, Send } from 'lucide-react';

export const BulkTransferModal = ({
  open,
  bulkItems,
  setBulkItems,
  bulkTo,
  setBulkTo,
  bulkSending,
  foremen,
  onClose,
  onConfirm,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#243049] border-[#3D5378] w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#F1F5F9]">
            Przekaż {bulkItems.length} {bulkItems.length === 1 ? 'sprzęt' : 'sprzętów'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="bulk-close-btn">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-[#CBD5E1] mb-1 block">Brygadzista odbierający *</label>
            <select
              value={bulkTo}
              onChange={(e) => setBulkTo(e.target.value)}
              className="w-full bg-[#1E2A44] border border-[#3D5378] text-[#F1F5F9] rounded px-3 py-2 text-sm"
              data-testid="bulk-transfer-to-select"
            >
              <option value="">-- wybierz --</option>
              {foremen.map((f) => (
                <option key={f.id} value={f.id}>{f.full_name}</option>
              ))}
            </select>
          </div>
          <div className="border border-[#3D5378] rounded">
            <table className="w-full text-xs">
              <thead className="bg-[#1E2A44]">
                <tr className="text-[#CBD5E1] uppercase text-[10px]">
                  <th className="text-left px-2 py-1.5">Sprzęt</th>
                  <th className="text-center px-2 py-1.5 w-20">Masz</th>
                  <th className="text-center px-2 py-1.5 w-32">Przekaż</th>
                  <th className="text-center px-2 py-1.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {bulkItems.map((it, idx) => (
                  <tr key={it.id} className="border-t border-[#3D5378]" data-testid={`bulk-item-${it.id}`}>
                    <td className="px-2 py-1.5 text-[#F1F5F9]">{it.name}</td>
                    <td className="px-2 py-1.5 text-center text-[#CBD5E1] tabular-nums">{it.max}</td>
                    <td className="px-2 py-1.5 text-center">
                      <Input
                        type="number"
                        min="1"
                        max={it.max}
                        value={it.qty}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setBulkItems((prev) => prev.map((x, i) => i === idx
                            ? { ...x, qty: Number.isNaN(v) ? '' : Math.max(1, Math.min(it.max, v)) }
                            : x));
                        }}
                        className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9] h-7 text-center tabular-nums"
                        data-testid={`bulk-qty-${it.id}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => setBulkItems((prev) => prev.filter((x) => x.id !== it.id))}
                        className="text-[#CBD5E1] hover:text-[#FCA5A5]"
                        title="Usuń z przekazu"
                        data-testid={`bulk-remove-${it.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#CBD5E1]">
            Drugi brygadzista musi zaakceptować <b className="text-[#F1F5F9]">każdą</b> pozycję osobno.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose} data-testid="bulk-cancel-btn">Anuluj</Button>
            <Button
              onClick={onConfirm}
              disabled={bulkSending || !bulkTo || bulkItems.length === 0}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white disabled:opacity-40"
              data-testid="bulk-confirm-btn"
            >
              <Send className="h-4 w-4 mr-1" />
              {bulkSending ? 'Wysyłam…' : `Wyślij (${bulkItems.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
