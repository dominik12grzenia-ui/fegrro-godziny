import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, Plus, Trash2, Edit, History, AlertTriangle, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const EquipmentAdmin = () => {
  const [equipment, setEquipment] = useState([]);
  const [foremen, setForemen] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [history, setHistory] = useState([]);
  const [defects, setDefects] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEq, setEditingEq] = useState(null);
  const [showHistoryFor, setShowHistoryFor] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [form, setForm] = useState({ name: '', brand: '', total_quantity: '', photo: null });

  const fetchAll = useCallback(async () => {
    try {
      const [eqRes, forRes, asgRes, hisRes, defRes, trRes] = await Promise.all([
        api.get('/equipment'),
        api.get('/foremen'),
        api.get('/equipment/assignments/all'),
        api.get('/equipment/history'),
        api.get('/equipment/defects'),
        api.get('/equipment/transfers/all'),
      ]);
      setEquipment(eqRes.data);
      setForemen((forRes.data || []).filter((f) => f.status === 'active'));
      setAssignments(asgRes.data);
      setHistory(hisRes.data);
      setDefects(defRes.data);
      setTransfers(trRes.data);
    } catch (e) {
      toast.error('Blad pobierania danych sprzetu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const getAssigned = (eqId, foremanId) =>
    assignments.find((a) => a.equipment_id === eqId && a.foreman_id === foremanId)?.quantity || 0;

  const handleAssignChange = async (eqId, foremanId, value) => {
    const qty = parseInt(value, 10);
    if (Number.isNaN(qty) || qty < 0) {
      toast.error('Ilosc musi byc liczba >= 0');
      return;
    }
    try {
      await api.post(`/equipment/assign?equipment_id=${eqId}`, {
        foreman_id: foremanId,
        quantity: qty,
      });
      toast.success('Zaktualizowano przypisanie');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad zapisu');
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim() || form.total_quantity === '') {
      toast.error('Podaj nazwe i ilosc');
      return;
    }
    try {
      await api.post('/equipment', {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        total_quantity: parseInt(form.total_quantity, 10),
        photo: form.photo,
      });
      toast.success('Sprzet dodany');
      setShowAddModal(false);
      setForm({ name: '', brand: '', total_quantity: '', photo: null });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad dodawania');
    }
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/equipment/${editingEq.id}`, {
        name: editingEq.name,
        brand: editingEq.brand,
        total_quantity: parseInt(editingEq.total_quantity, 10),
        status: editingEq.status,
        photo: editingEq.photo,
      });
      toast.success('Zaktualizowano');
      setEditingEq(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad zapisu');
    }
  };

  const handleDelete = async (eqId) => {
    if (!window.confirm('Usunac sprzet wraz ze wszystkimi przypisaniami?')) return;
    try {
      await api.delete(`/equipment/${eqId}`);
      toast.success('Usunieto');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad usuwania');
    }
  };

  const handlePhotoUpload = async (e, target) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Maks 2MB');
      return;
    }
    const b64 = await fileToBase64(file);
    if (target === 'add') {
      setForm({ ...form, photo: b64 });
    } else if (target === 'edit') {
      setEditingEq({ ...editingEq, photo: b64 });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-[#94A3B8]" data-testid="equipment-loading">
        Wczytywanie sprzetu...
      </div>
    );
  }

  const filteredHistory = showHistoryFor
    ? history.filter((h) => h.equipment_id === showHistoryFor)
    : history;

  const pendingTransfers = transfers.filter((t) => t.status === 'pending');

  return (
    <div className="space-y-4" data-testid="equipment-admin">
      {/* Header + Add button */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#5F7151]" />
            Lista sprzetu
          </CardTitle>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
            data-testid="add-equipment-btn"
          >
            <Plus className="h-4 w-4 mr-2" /> Dodaj sprzet
          </Button>
        </CardHeader>
        <CardContent>
          {equipment.length === 0 ? (
            <p className="text-[#94A3B8] text-center py-6">Brak sprzetu. Kliknij "Dodaj sprzet".</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {equipment.map((eq) => (
                <Card key={eq.id} className="bg-[#1E293B] border-[#334155]" data-testid={`equipment-card-${eq.id}`}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3 flex-1">
                        {eq.photo ? (
                          <img src={eq.photo} alt={eq.name} className="w-16 h-16 object-cover rounded" />
                        ) : (
                          <div className="w-16 h-16 rounded bg-[#0F172A] flex items-center justify-center">
                            <Wrench className="h-7 w-7 text-[#475569]" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="font-bold text-[#CBD5E1]">{eq.name}</h3>
                          {eq.brand && <p className="text-xs text-[#94A3B8]">{eq.brand}</p>}
                          <p className="text-xs mt-1">
                            <span className="text-[#94A3B8]">Razem: </span>
                            <span className="text-[#CBD5E1] font-semibold">{eq.total_quantity}</span>
                            <span className="text-[#94A3B8]"> · Wolne: </span>
                            <span className={eq.available_quantity > 0 ? 'text-[#5F7151] font-semibold' : 'text-[#E8836A] font-semibold'}>
                              {eq.available_quantity}
                            </span>
                          </p>
                          {eq.status && eq.status !== 'working' && (
                            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-[#7F2D2D] text-[#FCA5A5]">
                              {eq.status === 'broken' ? 'Zepsuty' : eq.status === 'maintenance' ? 'Naprawa' : eq.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingEq({ ...eq, total_quantity: String(eq.total_quantity) })}
                        className="text-[#94A3B8] hover:bg-[#334155] text-xs"
                        data-testid={`edit-equipment-${eq.id}`}
                      >
                        <Edit className="h-3 w-3 mr-1" /> Edytuj
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowHistoryFor(showHistoryFor === eq.id ? null : eq.id)}
                        className="text-[#94A3B8] hover:bg-[#334155] text-xs"
                        data-testid={`history-equipment-${eq.id}`}
                      >
                        <History className="h-3 w-3 mr-1" /> Historia
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(eq.id)}
                        className="text-[#E8836A] hover:bg-[#334155] text-xs"
                        data-testid={`delete-equipment-${eq.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignment matrix */}
      {equipment.length > 0 && foremen.length > 0 && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1]">Przypisanie do brygadzistow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="equipment-assignment-table">
                <thead>
                  <tr className="border-b border-[#334155] text-left">
                    <th className="p-2 text-[#CBD5E1]">Brygadzista</th>
                    {equipment.map((eq) => (
                      <th key={eq.id} className="p-2 text-[#CBD5E1] text-center min-w-[100px]">
                        <div>{eq.name}</div>
                        <div className="text-xs text-[#94A3B8] font-normal">
                          {eq.assigned_quantity}/{eq.total_quantity}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {foremen.map((f) => (
                    <tr key={f.id} className="border-b border-[#334155]">
                      <td className="p-2 text-[#CBD5E1]">{f.full_name}</td>
                      {equipment.map((eq) => (
                        <td key={eq.id} className="p-1 text-center">
                          <input
                            key={`${eq.id}-${f.id}-${getAssigned(eq.id, f.id)}`}
                            type="number"
                            min="0"
                            defaultValue={getAssigned(eq.id, f.id)}
                            onBlur={(e) => {
                              const newVal = parseInt(e.target.value || '0', 10);
                              if (newVal !== getAssigned(eq.id, f.id)) {
                                handleAssignChange(eq.id, f.id, newVal);
                              }
                            }}
                            className="w-16 bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-2 py-1 text-center"
                            data-testid={`assign-input-${eq.id}-${f.id}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#94A3B8] mt-3">
              Suma przypisanych nie moze przekroczyc ilosci dostepnej. Zmiany zapisuja sie po wyjsciu z pola.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending transfers */}
      {pendingTransfers.length > 0 && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1]">Oczekujace przekazania</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingTransfers.map((t) => (
                <div key={t.id} className="text-sm p-2 bg-[#1E293B] rounded border border-[#334155]" data-testid={`pending-transfer-${t.id}`}>
                  <span className="text-[#CBD5E1]">{t.from_foreman_name}</span>
                  <span className="text-[#94A3B8]"> -&gt; </span>
                  <span className="text-[#CBD5E1]">{t.to_foreman_name}</span>
                  <span className="text-[#94A3B8]">: </span>
                  <span className="text-[#5F7151] font-semibold">{t.equipment_name}</span>
                  <span className="text-[#94A3B8]"> x {t.quantity} szt. </span>
                  <span className="text-[#64748B] text-xs">
                    {new Date(t.created_at).toLocaleString('pl-PL')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Defects */}
      {defects.length > 0 && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#E8836A]" /> Zgloszone usterki
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {defects.slice(0, 20).map((d) => (
                <div key={d.id} className="text-sm p-2 bg-[#1E293B] rounded border border-[#334155]" data-testid={`defect-${d.id}`}>
                  <div className="flex justify-between">
                    <span>
                      <span className="text-[#E8836A] font-semibold">{d.equipment_name}</span>
                      <span className="text-[#94A3B8]"> x {d.quantity}</span>
                      <span className="text-[#94A3B8]"> · </span>
                      <span className="text-[#CBD5E1]">{d.foreman_name}</span>
                    </span>
                    <span className="text-[#64748B] text-xs">
                      {new Date(d.created_at).toLocaleString('pl-PL')}
                    </span>
                  </div>
                  {d.description && <p className="text-xs text-[#94A3B8] mt-1">{d.description}</p>}
                  {d.photo && (
                    <img src={d.photo} alt="usterka" className="mt-2 max-h-32 rounded" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <History className="h-5 w-5 text-[#5F7151]" />
            Historia
            {showHistoryFor && (
              <Button size="sm" variant="ghost" onClick={() => setShowHistoryFor(null)} className="ml-2 text-xs text-[#94A3B8]">
                Pokaz wszystko <X className="h-3 w-3 ml-1" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredHistory.length === 0 ? (
            <p className="text-[#94A3B8] text-sm">Brak wpisow.</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto" data-testid="equipment-history">
              {filteredHistory.slice(0, 100).map((h) => {
                const eqName = equipment.find((e) => e.id === h.equipment_id)?.name || h.details?.name || '?';
                let label = h.action;
                if (h.action === 'created') label = 'Utworzono';
                if (h.action === 'updated') label = 'Edytowano';
                if (h.action === 'deleted') label = 'Usunieto';
                if (h.action === 'assigned') label = 'Przypisano';
                if (h.action === 'transfer_requested') label = 'Zlozono przekazanie';
                if (h.action === 'transfer_accepted') label = 'Zaakceptowano przekazanie';
                if (h.action === 'transfer_rejected') label = 'Odrzucono przekazanie';
                if (h.action === 'defect_reported') label = 'Zgloszono usterke';
                return (
                  <div key={h.id} className="text-xs p-2 bg-[#1E293B] rounded border border-[#334155] flex flex-wrap gap-2">
                    <span className="text-[#5F7151] font-semibold">{label}</span>
                    <span className="text-[#CBD5E1]">{eqName}</span>
                    {h.details?.foreman_name && (
                      <span className="text-[#94A3B8]">-&gt; {h.details.foreman_name} ({h.details.quantity ?? '?'})</span>
                    )}
                    {h.details?.to_foreman_name && (
                      <span className="text-[#94A3B8]">-&gt; {h.details.to_foreman_name} ({h.details.quantity ?? '?'})</span>
                    )}
                    {h.details?.description && (
                      <span className="text-[#94A3B8]">"{h.details.description}"</span>
                    )}
                    <span className="text-[#64748B] ml-auto">
                      przez {h.actor_name} · {new Date(h.created_at).toLocaleString('pl-PL')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">Dodaj sprzet</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)} data-testid="close-add-modal">
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
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilosc szt. *</label>
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
                <label className="text-xs text-[#94A3B8] mb-1 block">Zdjecie (opcjonalne, max 2MB)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoUpload(e, 'add')}
                  className="text-xs text-[#CBD5E1]"
                  data-testid="equipment-photo-input"
                />
                {form.photo && (
                  <img src={form.photo} alt="podglad" className="mt-2 max-h-24 rounded" />
                )}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setShowAddModal(false)}>
                  Anuluj
                </Button>
                <Button
                  onClick={handleAdd}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="save-equipment-btn"
                >
                  Zapisz
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {editingEq && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">Edytuj sprzet</CardTitle>
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
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilosc szt.</label>
                <Input
                  type="number"
                  min="0"
                  value={editingEq.total_quantity}
                  onChange={(e) => setEditingEq({ ...editingEq, total_quantity: e.target.value })}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Status</label>
                <select
                  value={editingEq.status || 'working'}
                  onChange={(e) => setEditingEq({ ...editingEq, status: e.target.value })}
                  className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                >
                  <option value="working">Sprawny</option>
                  <option value="broken">Zepsuty</option>
                  <option value="maintenance">W naprawie</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Zdjecie</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoUpload(e, 'edit')}
                  className="text-xs text-[#CBD5E1]"
                />
                {editingEq.photo && (
                  <img src={editingEq.photo} alt="podglad" className="mt-2 max-h-24 rounded" />
                )}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setEditingEq(null)}>
                  Anuluj
                </Button>
                <Button
                  onClick={handleUpdate}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="update-equipment-btn"
                >
                  Zapisz
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
