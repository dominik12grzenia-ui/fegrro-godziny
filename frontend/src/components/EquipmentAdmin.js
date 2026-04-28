import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, Plus, Trash2, Edit, History, AlertTriangle, X, Undo2, UserCog } from 'lucide-react';
import { toast } from 'sonner';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const ACTION_LABELS = {
  created: 'Utworzono',
  updated: 'Edytowano',
  deleted: 'Usunieto',
  assigned: 'Przypisano',
  transfer_requested: 'Przekazanie zlozone',
  transfer_accepted: 'Przekazanie zaakceptowane',
  transfer_rejected: 'Przekazanie odrzucone',
  defect_reported: 'Zgloszono usterke',
  returned_to_warehouse: 'Zwrot do magazynu',
  return_acknowledged: 'Potwierdzono zwrot',
};

export const EquipmentAdmin = ({ category = 'electronics', title = 'Elektronarzedzia' }) => {
  const [equipment, setEquipment] = useState([]);
  const [foremen, setForemen] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [history, setHistory] = useState([]);
  const [defects, setDefects] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEq, setEditingEq] = useState(null);
  const [historyModalEq, setHistoryModalEq] = useState(null);
  const [warehouseKeeper, setWarehouseKeeper] = useState({ foreman_id: null, foreman_name: null });
  const [pendingReturns, setPendingReturns] = useState([]);
  const [filterForemanId, setFilterForemanId] = useState('');
  const [form, setForm] = useState({ name: '', brand: '', total_quantity: '', photo: null });
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [eqRes, forRes, asgRes, hisRes, defRes, trRes, wkRes, retRes] = await Promise.all([
        api.get(`/equipment?category=${encodeURIComponent(category)}`),
        api.get('/foremen'),
        api.get('/equipment/assignments/all'),
        api.get('/equipment/history'),
        api.get('/equipment/defects'),
        api.get('/equipment/transfers/all'),
        api.get('/settings/warehouse-keeper').catch(() => ({ data: { foreman_id: null, foreman_name: null } })),
        api.get('/equipment/returns/pending').catch(() => ({ data: [] })),
      ]);
      setEquipment(eqRes.data);
      setForemen((forRes.data || []).filter((f) => f.status === 'active'));
      setAssignments(asgRes.data);
      setHistory(hisRes.data);
      setDefects(defRes.data);
      setTransfers(trRes.data);
      setWarehouseKeeper(wkRes.data);
      setPendingReturns(retRes.data);
    } catch (e) {
      toast.error('Blad pobierania danych sprzetu');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const getAssigned = (eqId, foremanId) =>
    assignments.find((a) => a.equipment_id === eqId && a.foreman_id === foremanId)?.quantity || 0;

  // Sum of qty assigned per foreman across all equipment
  const foremanTotal = (foremanId) =>
    assignments.filter((a) => a.foreman_id === foremanId).reduce((s, a) => s + (a.quantity || 0), 0);

  // For a given equipment+foreman, what's the max we can assign?
  // = total - broken - sum(other foremen)
  const maxAssignableFor = (eq, foremanId) => {
    const sumOthers = assignments
      .filter((a) => a.equipment_id === eq.id && a.foreman_id !== foremanId)
      .reduce((s, a) => s + (a.quantity || 0), 0);
    return Math.max(0, eq.total_quantity - (eq.broken_quantity || 0) - sumOthers);
  };

  const maxBrokenFor = (eq) => {
    const totalAssigned = assignments
      .filter((a) => a.equipment_id === eq.id)
      .reduce((s, a) => s + (a.quantity || 0), 0);
    return Math.max(0, eq.total_quantity - totalAssigned);
  };

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
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad zapisu');
      fetchAll();
    }
  };

  const handleBrokenChange = async (eqId, value) => {
    const qty = parseInt(value, 10);
    if (Number.isNaN(qty) || qty < 0) {
      toast.error('Ilosc musi byc >= 0');
      return;
    }
    try {
      await api.put(`/equipment/${eqId}`, { broken_quantity: qty });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad zapisu');
      fetchAll();
    }
  };

  const handleTotalChange = async (eqId, value) => {
    const qty = parseInt(value, 10);
    if (Number.isNaN(qty) || qty < 0) {
      toast.error('Ilosc musi byc >= 0');
      return;
    }
    try {
      await api.put(`/equipment/${eqId}`, { total_quantity: qty });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad zapisu');
      fetchAll();
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
        category,
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
    if (target === 'add') setForm({ ...form, photo: b64 });
    else if (target === 'edit') setEditingEq({ ...editingEq, photo: b64 });
  };

  const handleSetWarehouseKeeper = async (foremanId) => {
    try {
      await api.put('/settings/warehouse-keeper', { foreman_id: foremanId || null });
      toast.success(foremanId ? 'Magazynier ustawiony' : 'Magazynier wyczyszczony');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const handleAcknowledgeReturn = async (notifId) => {
    try {
      await api.post(`/equipment/returns/${notifId}/acknowledge`);
      toast.success('Zwrot potwierdzony');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-[#94A3B8]" data-testid="equipment-loading">
        Wczytywanie sprzetu...
      </div>
    );
  }

  const historyForModal = historyModalEq
    ? history.filter((h) => h.equipment_id === historyModalEq.id)
    : [];
  const pendingTransfers = transfers.filter((t) => t.status === 'pending');

  // Filter: when foreman selected, show only that column + rows where they have qty > 0
  const visibleForemen = filterForemanId
    ? foremen.filter((f) => f.id === filterForemanId)
    : foremen;
  const visibleEquipment = filterForemanId
    ? equipment.filter((eq) => getAssigned(eq.id, filterForemanId) > 0)
    : equipment;

  return (
    <div className="space-y-4" data-testid="equipment-admin">
      {/* Main table */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#5F7151]" />
            {title} - przypisania
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterForemanId}
              onChange={(e) => setFilterForemanId(e.target.value)}
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
              data-testid="foreman-filter-select"
            >
              <option value="">-- pokaz wszystkich --</option>
              {foremen.map((f) => (
                <option key={f.id} value={f.id}>{f.full_name}</option>
              ))}
            </select>
            {filterForemanId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFilterForemanId('')}
                className="text-[#94A3B8] hover:bg-[#334155] text-xs"
                data-testid="clear-filter-btn"
              >
                <X className="h-3 w-3 mr-1" /> Wyczysc
              </Button>
            )}
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              data-testid="add-equipment-btn"
            >
              <Plus className="h-4 w-4 mr-2" /> Dodaj sprzet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {equipment.length === 0 ? (
            <p className="text-[#94A3B8] text-center py-6">Brak sprzetu. Kliknij "Dodaj sprzet".</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm" data-testid="equipment-main-table">
                <thead className="sticky top-0 z-30 bg-[#2A384C]">
                  {/* Top totals row: per-foreman totals */}
                  <tr>
                    <th className="border border-[#334155] p-2 bg-[#1E293B]" colSpan={6}></th>
                    {visibleForemen.map((f) => (
                      <th
                        key={`tot-${f.id}`}
                        className="border border-[#334155] p-1 bg-[#1E293B] text-center text-[#5F7151] font-bold"
                        data-testid={`foreman-total-${f.id}`}
                      >
                        {foremanTotal(f.id)}
                      </th>
                    ))}
                  </tr>
                  {/* Headers row */}
                  <tr className="bg-[#1E293B]">
                    <th className="border border-[#334155] p-2 text-left text-[#CBD5E1] min-w-[120px]">
                      Historia przekazania
                    </th>
                    <th className="border border-[#334155] p-2 text-left text-[#CBD5E1] min-w-[160px]">
                      Nazwa sprzetu
                    </th>
                    <th className="border border-[#334155] p-2 text-left text-[#CBD5E1] min-w-[120px]">
                      Marka
                    </th>
                    <th className="border border-[#334155] p-2 text-center text-[#CBD5E1] min-w-[100px]">
                      Ilosc dostepnych sztuk
                    </th>
                    <th className="border border-[#334155] p-2 text-center text-[#CBD5E1] min-w-[120px]">
                      Zdane do magazynu do naprawy
                    </th>
                    <th className="border border-[#334155] p-2 text-center text-[#CBD5E1] min-w-[100px]">
                      Dostepne w magazynie
                    </th>
                    {visibleForemen.map((f) => (
                      <th
                        key={f.id}
                        className="border border-[#334155] p-1 text-center text-[#CBD5E1] align-bottom"
                        style={{ height: '90px', minWidth: '50px', maxWidth: '50px' }}
                      >
                        <div
                          className="whitespace-nowrap"
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            margin: '0 auto',
                            fontSize: '9px',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                          }}
                          title={f.full_name}
                        >
                          {f.full_name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleEquipment.map((eq) => (
                    <tr key={eq.id} data-testid={`equipment-row-${eq.id}`}>
                      <td className="border border-[#334155] p-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryModalEq(eq)}
                          className="text-[#5F7151] hover:bg-[#334155] text-xs h-7"
                          data-testid={`history-btn-${eq.id}`}
                        >
                          <History className="h-3 w-3 mr-1" /> Historia
                        </Button>
                      </td>
                      <td className="border border-[#334155] p-2">
                        <div className="flex items-center gap-2">
                          {eq.photo ? (
                            <img
                              src={eq.photo}
                              alt={eq.name}
                              className="w-12 h-12 object-contain rounded border border-[#334155] shrink-0 bg-[#0F172A] cursor-zoom-in"
                              data-testid={`equipment-thumb-${eq.id}`}
                              onClick={() => setPreviewPhoto(eq.photo)}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-[#1E293B] border border-[#334155] flex items-center justify-center shrink-0">
                              <Wrench className="h-5 w-5 text-[#475569]" />
                            </div>
                          )}
                          <button
                            onClick={() => setEditingEq({ ...eq })}
                            className="text-[#CBD5E1] font-semibold hover:text-[#5F7151] text-left"
                            data-testid={`equipment-name-${eq.id}`}
                          >
                            {eq.name}
                          </button>
                        </div>
                      </td>
                      <td className="border border-[#334155] p-2 text-[#94A3B8]">{eq.brand || '-'}</td>
                      <td className="border border-[#334155] p-1 text-center">
                        <input
                          key={`tot-${eq.id}-${eq.total_quantity}`}
                          type="number"
                          min="0"
                          defaultValue={eq.total_quantity}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value || '0', 10);
                            if (v !== eq.total_quantity) handleTotalChange(eq.id, v);
                          }}
                          className="w-16 bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-2 py-1 text-center"
                          data-testid={`total-input-${eq.id}`}
                        />
                      </td>
                      <td className="border border-[#334155] p-1 text-center">
                        <input
                          key={`brk-${eq.id}-${eq.broken_quantity}`}
                          type="number"
                          min="0"
                          max={maxBrokenFor(eq) + (eq.broken_quantity || 0)}
                          defaultValue={eq.broken_quantity || 0}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value || '0', 10);
                            if (v !== (eq.broken_quantity || 0)) handleBrokenChange(eq.id, v);
                          }}
                          className="w-16 bg-[#1E293B] border border-[#334155] text-[#E8836A] rounded px-2 py-1 text-center"
                          data-testid={`broken-input-${eq.id}`}
                        />
                      </td>
                      <td className="border border-[#334155] p-2 text-center">
                        <span
                          className={
                            eq.available_quantity > 0
                              ? 'text-[#5F7151] font-bold text-base'
                              : 'text-[#E8836A] font-bold text-base'
                          }
                          data-testid={`available-${eq.id}`}
                        >
                          {eq.available_quantity}
                        </span>
                      </td>
                      {visibleForemen.map((f) => {
                        const current = getAssigned(eq.id, f.id);
                        const maxVal = maxAssignableFor(eq, f.id);
                        return (
                          <td key={f.id} className="border border-[#334155] p-1 text-center">
                            <input
                              key={`asg-${eq.id}-${f.id}-${current}-${maxVal}`}
                              type="number"
                              min="0"
                              max={maxVal}
                              defaultValue={current}
                              onBlur={(e) => {
                                let v = parseInt(e.target.value || '0', 10);
                                if (Number.isNaN(v) || v < 0) v = 0;
                                if (v > maxVal) {
                                  toast.error(`Max dla tego sprzetu: ${maxVal}`);
                                  v = maxVal;
                                  e.target.value = String(maxVal);
                                }
                                if (v !== current) handleAssignChange(eq.id, f.id, v);
                              }}
                              onChange={(e) => {
                                const v = parseInt(e.target.value || '0', 10);
                                if (v > maxVal) {
                                  e.target.value = String(maxVal);
                                }
                              }}
                              className="w-12 bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-1 py-1 text-center text-xs"
                              data-testid={`assign-input-${eq.id}-${f.id}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-[#94A3B8] mt-3">
            Klikaj w nazwe sprzetu, aby edytowac. Wpisz ilosc - inputy maja ograniczenie do dostepnej liczby. Liczby na samej gorze = suma sprzetu u danego brygadzisty.
          </p>
        </CardContent>
      </Card>

      {/* Warehouse keeper setting */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
            <UserCog className="h-5 w-5 text-[#5F7151]" />
            Magazynier (otrzymuje powiadomienia o zwrotach)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={warehouseKeeper.foreman_id || ''}
              onChange={(e) => handleSetWarehouseKeeper(e.target.value)}
              className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
              data-testid="warehouse-keeper-select"
            >
              <option value="">-- tylko admin --</option>
              {foremen.map((f) => (
                <option key={f.id} value={f.id}>{f.full_name}</option>
              ))}
            </select>
            <span className="text-xs text-[#94A3B8]">
              {warehouseKeeper.foreman_id
                ? `Aktualnie: ${warehouseKeeper.foreman_name}`
                : 'Powiadomienia trafiaja tylko do admina'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pending returns */}
      {pendingReturns.length > 0 && (
        <Card className="bg-[#2A384C] border-[#5F7151]">
          <CardHeader>
            <CardTitle className="text-[#5F7151] flex items-center gap-2">
              <Undo2 className="h-5 w-5" /> Oczekujace zwroty do magazynu ({pendingReturns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingReturns.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#1E293B] rounded border border-[#334155]"
                  data-testid={`pending-return-${r.id}`}
                >
                  <div className="text-sm">
                    <span className="text-[#CBD5E1] font-semibold">{r.from_foreman_name}</span>
                    <span className="text-[#94A3B8]"> zwraca </span>
                    <span className="text-[#5F7151] font-bold">{r.equipment_name}</span>
                    <span className="text-[#94A3B8]"> x </span>
                    <span className="text-white font-bold">{r.quantity}</span>
                    <span className="text-[#64748B] text-xs ml-2">
                      ({new Date(r.created_at).toLocaleString('pl-PL')})
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAcknowledgeReturn(r.id)}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                    data-testid={`acknowledge-return-${r.id}`}
                  >
                    Potwierdz przyjecie
                  </Button>
                </div>
              ))}
            </div>
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
                <div
                  key={t.id}
                  className="text-sm p-2 bg-[#1E293B] rounded border border-[#334155]"
                  data-testid={`pending-transfer-${t.id}`}
                >
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
                <div
                  key={d.id}
                  className="text-sm p-2 bg-[#1E293B] rounded border border-[#334155]"
                  data-testid={`defect-${d.id}`}
                >
                  <div className="flex justify-between flex-wrap gap-2">
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
                  {d.photo && <img src={d.photo} alt="usterka" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0F172A] cursor-zoom-in" onClick={() => setPreviewPhoto(d.photo)} />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilosc dostepnych sztuk *</label>
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
                {form.photo && <img src={form.photo} alt="podglad" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0F172A]" />}
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
                <label className="text-xs text-[#94A3B8] mb-1 block">Zdjecie</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoUpload(e, 'edit')}
                  className="text-xs text-[#CBD5E1]"
                />
                {editingEq.photo && <img src={editingEq.photo} alt="podglad" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0F172A]" />}
              </div>
              <div className="flex gap-2 justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    handleDelete(editingEq.id);
                    setEditingEq(null);
                  }}
                  className="text-[#E8836A] hover:bg-[#7F2D2D]/30"
                  data-testid="delete-from-edit-btn"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Usun
                </Button>
                <div className="flex gap-2">
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
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History Modal (per equipment) */}
      {historyModalEq && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-2xl max-h-[80vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">
                Historia: {historyModalEq.name}
              </CardTitle>
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
                      <span className="text-[#5F7151] font-semibold">
                        {ACTION_LABELS[h.action] || h.action}
                      </span>
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
      )}

      {/* Photo lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setPreviewPhoto(null)}
          data-testid="photo-lightbox"
        >
          <img src={previewPhoto} alt="Podglad" className="max-w-[95vw] max-h-[95vh] object-contain rounded" />
        </div>
      )}
    </div>
  );
};
