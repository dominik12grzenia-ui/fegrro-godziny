import React from 'react';
import { api } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

const ACTION_LABELS = {
  created: 'Utworzono',
  updated: 'Edytowano',
  deleted: 'Usunieto',
  assigned: 'Przypisano',
  transfer_requested: 'Przekazanie zlozone',
  transfer_accepted: 'Przekazanie zaakceptowane',
  transfer_rejected: 'Przekazanie odrzucone',
  defect_reported: 'Zgloszono usterke',
  defect_resolved: 'Usterka naprawiona',
  defect_scrapped: 'Sprzęt na zlomie',
  returned_to_warehouse: 'Zwrot do magazynu',
  return_acknowledged: 'Potwierdzono zwrot',
};

export const AddEquipmentModal = ({ open, onClose, form, setForm, onPhotoUpload, onSave }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1]">Dodaj sprzęt</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="close-add-modal">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Nazwa *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
              data-testid="equipment-name-input"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Marka</label>
            <Input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
              data-testid="equipment-brand-input"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Ilość dostepnych sztuk *</label>
            <Input
              type="number"
              min="0"
              value={form.total_quantity}
              onChange={(e) => setForm({ ...form, total_quantity: e.target.value })}
              className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
              data-testid="equipment-quantity-input"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">
              Warianty / rozmiary (opcjonalne, oddziel przecinkami)
            </label>
            <Input
              value={form.variants}
              onChange={(e) => setForm({ ...form, variants: e.target.value })}
              placeholder="np. 5mm, 8mm, 10mm  lub  125mm, 180mm, 230mm"
              className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
              data-testid="equipment-variants-input"
            />
            <p className="text-[10px] text-[#64748B] mt-1">
              Brygadzista będzie musial wybrac jeden z wariantow przy zamawianiu.
            </p>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Zdjecie (opcjonalne, max 2MB)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPhotoUpload(e, 'add')}
              className="text-xs text-[#CBD5E1]"
              data-testid="equipment-photo-input"
            />
            {form.photo && <img src={form.photo} alt="podglad" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0F172A]" />}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={onSave} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="save-equipment-btn">
              Zapisz
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const EditEquipmentModal = ({ editingEq, setEditingEq, onPhotoUpload, onUpdate, onDelete }) => {
  if (!editingEq) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1]">Edytuj sprzęt</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setEditingEq(null)}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Nazwa</label>
            <Input
              value={editingEq.name || ''}
              onChange={(e) => setEditingEq({ ...editingEq, name: e.target.value })}
              className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
              data-testid="edit-equipment-name"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Marka</label>
            <Input
              value={editingEq.brand || ''}
              onChange={(e) => setEditingEq({ ...editingEq, brand: e.target.value })}
              className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">
              Warianty / rozmiary (oddziel przecinkami)
            </label>
            <Input
              value={editingEq.variants_edit || ''}
              onChange={(e) => setEditingEq({ ...editingEq, variants_edit: e.target.value })}
              placeholder="np. 5mm, 8mm, 10mm"
              className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
              data-testid="edit-variants-input"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] mb-1 block">Zdjecie</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPhotoUpload(e, 'edit')}
              className="text-xs text-[#CBD5E1]"
            />
            {editingEq.photo && <img src={editingEq.photo} alt="podglad" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0F172A]" />}
          </div>
          <div className="flex gap-2 justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                onDelete(editingEq.id);
                setEditingEq(null);
              }}
              className="text-[#E8836A] hover:bg-[#7F2D2D]/30"
              data-testid="delete-from-edit-btn"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Usuń
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditingEq(null)}>Anuluj</Button>
              <Button onClick={onUpdate} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="update-equipment-btn">
                Zapisz
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const HistoryModal = ({ historyModalEq, setHistoryModalEq, historyForModal }) => {
  if (!historyModalEq) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#2A384C] border-[#334155] w-full max-w-2xl max-h-[80vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1]">Historia: {historyModalEq.name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setHistoryModalEq(null)} data-testid="close-history-modal">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          {historyForModal.length === 0 ? (
            <p className="text-[#94A3B8] text-sm">Brak wpisow.</p>
          ) : (
            <div className="space-y-1" data-testid="history-modal-list">
              {historyForModal.map((h) => (
                <div
                  key={h.id}
                  className="text-xs p-2 bg-[#1E293B] rounded border border-[#334155] flex flex-wrap gap-2"
                >
                  <span className="text-[#5F7151] font-semibold">{ACTION_LABELS[h.action] || h.action}</span>
                  {h.details?.foreman_name && (
                    <span className="text-[#94A3B8]">
                      -&gt; {h.details.foreman_name} ({h.details.quantity ?? '?'})
                    </span>
                  )}
                  {h.details?.to_foreman_name && (
                    <span className="text-[#94A3B8]">
                      -&gt; {h.details.to_foreman_name} ({h.details.quantity ?? '?'})
                    </span>
                  )}
                  {h.details?.description && (
                    <span className="text-[#94A3B8]">"{h.details.description}"</span>
                  )}
                  <span className="text-[#64748B] ml-auto">
                    przez {h.actor_name} · {new Date(h.created_at).toLocaleString('pl-PL')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const ResolveDefectModal = ({
  resolveModal, setResolveModal, resolveDest, setResolveDest,
  resolveForemanId, setResolveForemanId, foremen, fetchAll,
}) => {
  if (!resolveModal) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1]">
            Naprawione: {resolveModal.equipment_name} ({resolveModal.quantity} szt.)
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setResolveModal(null)} data-testid="close-resolve-modal">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#94A3B8]">Gdzie przekazac naprawiony sprzęt?</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
              <input
                type="radio"
                name="resolve-dest"
                checked={resolveDest === 'warehouse'}
                onChange={() => setResolveDest('warehouse')}
                data-testid="resolve-dest-warehouse"
              />
              Do magazynu (dostępny w magazynie)
            </label>
            <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
              <input
                type="radio"
                name="resolve-dest"
                checked={resolveDest === 'foreman'}
                onChange={() => setResolveDest('foreman')}
                data-testid="resolve-dest-foreman"
              />
              Przekaz brygadziscie:
            </label>
            {resolveDest === 'foreman' && (
              <select
                value={resolveForemanId}
                onChange={(e) => setResolveForemanId(e.target.value)}
                className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                data-testid="resolve-foreman-select"
              >
                <option value="">-- Wybierz brygadziste --</option>
                {foremen.map((f) => (
                  <option key={f.id} value={f.id}>{f.full_name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={async () => {
                if (resolveDest === 'foreman' && !resolveForemanId) {
                  toast.error('Wybierz brygadziste');
                  return;
                }
                try {
                  await api.post(`/equipment/defects/${resolveModal.id}/resolve`, {
                    disposition: 'repaired',
                    destination: resolveDest,
                    foreman_id: resolveDest === 'foreman' ? resolveForemanId : null,
                  });
                  toast.success('Oznaczono jako naprawione');
                  setResolveModal(null);
                  fetchAll();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Błąd');
                }
              }}
              className="flex-1 bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              data-testid="confirm-resolve-btn"
            >
              Zatwierdz
            </Button>
            <Button
              onClick={() => setResolveModal(null)}
              variant="outline"
              className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
            >
              Anuluj
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
