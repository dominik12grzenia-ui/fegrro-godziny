import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, Plus, Trash2, Edit, History, AlertTriangle, X, Undo2, UserCog, Check, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { EquipmentOrdersAdmin } from './EquipmentOrdersAdmin';
import { AddEquipmentModal, EditEquipmentModal, HistoryModal, ResolveDefectModal } from './equipment/EquipmentModals';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

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
  const [form, setForm] = useState({ name: '', brand: '', total_quantity: '', photo: null, variants: '' });
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [resolveModal, setResolveModal] = useState(null); // defect being resolved
  const [resolveDest, setResolveDest] = useState('warehouse'); // 'warehouse' | 'foreman'
  const [resolveForemanId, setResolveForemanId] = useState('');
  const [scrapped, setScrapped] = useState([]);
  const [showScrapped, setShowScrapped] = useState(false);
  const [activeInventory, setActiveInventory] = useState([]); // active checks for THIS category
  const [startingInventory, setStartingInventory] = useState(false);
  const [shortages, setShortages] = useState([]); // open shortages

  const fetchAll = useCallback(async () => {
    try {
      // PRIMARY fetches - render table as soon as these arrive
      const [eqRes, forRes, asgRes] = await Promise.all([
        api.get(`/equipment?category=${encodeURIComponent(category)}`),
        api.get('/foremen'),
        api.get('/equipment/assignments/all'),
      ]);
      setEquipment(eqRes.data);
      setForemen((forRes.data || []).filter((f) => f.status === 'active'));
      setAssignments(asgRes.data);
      setLoading(false);

      // SECONDARY fetches - fill in lists below the table without blocking
      const [hisRes, defRes, trRes, wkRes, retRes, scrRes, invRes, shRes] = await Promise.all([
        api.get('/equipment/history'),
        api.get('/equipment/defects'),
        api.get('/equipment/transfers/all'),
        api.get('/settings/warehouse-keeper').catch(() => ({ data: { foreman_id: null, foreman_name: null } })),
        api.get('/equipment/returns/pending').catch(() => ({ data: [] })),
        api.get(`/equipment/scrapped?category=${encodeURIComponent(category)}`).catch(() => ({ data: [] })),
        api.get('/equipment/inventory/list').catch(() => ({ data: [] })),
        api.get('/equipment/inventory/shortages?status=open').catch(() => ({ data: [] })),
      ]);
      setHistory(hisRes.data);
      setDefects(defRes.data);
      setTransfers(trRes.data);
      setWarehouseKeeper(wkRes.data);
      setPendingReturns(retRes.data);
      setScrapped(scrRes.data);
      setActiveInventory((invRes.data || []).filter((c) => c.category === category && c.status === 'active'));
      setShortages((shRes.data || []).filter((s) => s.category === category));
    } catch (e) {
      toast.error('Blad pobierania danych sprzetu');
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
      const variantsArr = (form.variants || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await api.post('/equipment', {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        total_quantity: parseInt(form.total_quantity, 10),
        photo: form.photo,
        category,
        variants: variantsArr.length > 0 ? variantsArr : null,
      });
      toast.success('Sprzet dodany');
      setShowAddModal(false);
      setForm({ name: '', brand: '', total_quantity: '', photo: null, variants: '' });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad dodawania');
    }
  };

  const handleUpdate = async () => {
    try {
      const variantsArr = (editingEq.variants_edit || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await api.put(`/equipment/${editingEq.id}`, {
        name: editingEq.name,
        brand: editingEq.brand,
        photo: editingEq.photo,
        variants: variantsArr.length > 0 ? variantsArr : [],
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

  const handleStartInventory = async () => {
    if (!window.confirm(
      `Rozpoczac inwentaryzacje dla "${title}"?\n\nWszyscy brygadzisci posiadajacy sprzet w tej kategorii zostana zablokowani na ekranie godzin do momentu potwierdzenia kazdej pozycji.`
    )) return;
    setStartingInventory(true);
    try {
      const r = await api.post('/equipment/inventory/start', { category });
      const required = (r.data?.required_foremen || []).length;
      if (required === 0) {
        toast.warning('Zaden brygadzista nie ma przypisanego sprzetu w tej kategorii');
      } else {
        toast.success(`Inwentaryzacja rozpoczeta. Wymagane potwierdzenia: ${required}`);
      }
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad rozpoczecia inwentaryzacji');
    } finally {
      setStartingInventory(false);
    }
  };

  const handleFinishInventory = async (checkId) => {
    if (!window.confirm('Recznie zakonczyc te inwentaryzacje? Brygadzisci zostana odblokowani bez potwierdzenia.')) return;
    try {
      await api.post(`/equipment/inventory/${checkId}/finish`);
      toast.success('Inwentaryzacja zakonczona');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const handleResolveShortage = async (shortageId) => {
    try {
      await api.post(`/equipment/inventory/shortages/${shortageId}/resolve`);
      toast.success('Zgloszenie rozpatrzone');
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
            <Button
              onClick={handleStartInventory}
              disabled={startingInventory || activeInventory.length > 0}
              className="bg-[#E8B76A] hover:bg-[#D4A055] text-[#1E293B] font-semibold disabled:opacity-50"
              data-testid="start-inventory-btn"
              title={activeInventory.length > 0 ? 'Inwentaryzacja juz aktywna' : 'Wymus inwentaryzacje u brygadzistow'}
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {startingInventory ? 'Uruchamianie...' : 'Inwentaryzacja'}
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
                  {visibleEquipment.map((eq, idx) => (
                    <tr key={eq.id} data-testid={`equipment-row-${eq.id}`} className={idx % 2 === 0 ? 'bg-[#1E293B]/40' : 'bg-[#2A384C]'}>
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
                            onClick={() => setEditingEq({ ...eq, variants_edit: ((eq.variants || []).join(', ')) })}
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
                        const initials = (f.full_name || '')
                          .split(/\s+/).filter(Boolean).slice(0, 2)
                          .map((p) => p[0]).join('').toUpperCase();
                        return (
                          <td key={f.id} className="border border-[#334155] p-1 text-center">
                            <div className="text-[8px] text-[#94A3B8] leading-none mb-0.5 font-semibold">{initials}</div>
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

      {/* Active inventory check banner */}
      {activeInventory.length > 0 && (
        <Card className="bg-[#2A384C] border-[#E8B76A]" data-testid="active-inventory-card">
          <CardHeader>
            <CardTitle className="text-[#E8B76A] flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Aktywna inwentaryzacja - {title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeInventory.map((c) => {
                const required = (c.required_foremen || []).length;
                const confirmed = (c.confirmed_foremen || []).length;
                const pendingIds = (c.required_foremen || []).filter(
                  (fid) => !(c.confirmed_foremen || []).includes(fid)
                );
                const pendingNames = pendingIds.map(
                  (fid) => foremen.find((f) => f.id === fid)?.full_name || '?'
                );
                return (
                  <div
                    key={c.id}
                    className="p-3 bg-[#1E293B] rounded border border-[#334155]"
                    data-testid={`inventory-status-${c.id}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div className="text-sm text-[#CBD5E1]">
                        Rozpoczeto: {new Date(c.started_at).toLocaleString('pl-PL')}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm">
                          <span className="text-[#5F7151] font-bold">{confirmed}</span>
                          <span className="text-[#94A3B8]"> / </span>
                          <span className="text-white font-bold">{required}</span>
                          <span className="text-[#94A3B8] ml-1">potwierdzonych</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleFinishInventory(c.id)}
                          className="bg-[#334155] hover:bg-[#475569] text-white"
                          data-testid={`finish-inventory-${c.id}`}
                        >
                          Zakoncz recznie
                        </Button>
                      </div>
                    </div>
                    {pendingNames.length > 0 && (
                      <div className="text-xs text-[#94A3B8]">
                        <span className="text-[#E8B76A]">Oczekuje: </span>
                        {pendingNames.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equipment orders from foremen (awaiting admin action) */}
      <EquipmentOrdersAdmin category={category} />

      {/* Inventory shortage reports */}
      {shortages.length > 0 && (
        <Card className="bg-[#2A384C] border-[#E8B76A]" data-testid="shortages-card">
          <CardHeader>
            <CardTitle className="text-[#E8B76A] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Zgloszone niezgodnosci sprzetu ({shortages.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {shortages.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3 bg-[#1E293B] rounded border border-[#334155]"
                  data-testid={`shortage-row-${s.id}`}
                >
                  <div className="flex-1 min-w-[200px] text-sm">
                    <div>
                      <span className="text-[#CBD5E1] font-semibold">{s.foreman_name}</span>
                      <span className="text-[#94A3B8]"> - </span>
                      <span className="text-[#5F7151] font-bold">{s.equipment_name}</span>
                      {s.equipment_brand && (
                        <span className="text-[#94A3B8]"> ({s.equipment_brand})</span>
                      )}
                    </div>
                    <div className="text-[#94A3B8] mt-1">
                      Posiada <span className="text-white font-bold">{s.reported_quantity}</span>
                      <span> / </span>
                      <span className="text-white">{s.expected_quantity}</span> szt.
                      <span className="text-[#E8B76A] ml-2">
                        (brak: <b>{s.missing_quantity}</b> szt.)
                      </span>
                    </div>
                    {s.description && (
                      <div className="text-[#CBD5E1] mt-1 italic">"{s.description}"</div>
                    )}
                    <div className="text-xs text-[#64748B] mt-1">
                      {new Date(s.created_at).toLocaleString('pl-PL')}
                    </div>
                  </div>
                  {s.photo && (
                    <a href={s.photo} target="_blank" rel="noopener noreferrer">
                      <img
                        src={s.photo}
                        alt="dowod"
                        className="h-16 w-16 rounded object-cover border border-[#334155] cursor-zoom-in"
                      />
                    </a>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleResolveShortage(s.id)}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                    data-testid={`resolve-shortage-${s.id}`}
                  >
                    <Check className="h-4 w-4 mr-1" /> Rozpatrzono
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              {defects.slice(0, 20).map((d) => {
                const resolved = d.status === 'resolved';
                return (
                <div
                  key={d.id}
                  className={`text-sm p-2 rounded border ${resolved ? 'bg-[#1E293B] border-[#5F7151]/40 opacity-70' : 'bg-[#1E293B] border-[#334155]'}`}
                  data-testid={`defect-${d.id}`}
                >
                  <div className="flex justify-between flex-wrap gap-2">
                    <span>
                      <span className={`font-semibold ${resolved ? 'text-[#5F7151] line-through' : 'text-[#E8836A]'}`}>{d.equipment_name}</span>
                      <span className="text-[#94A3B8]"> x {d.quantity}</span>
                      <span className="text-[#94A3B8]"> · </span>
                      <span className="text-[#CBD5E1]">{d.foreman_name}</span>
                      {resolved && (
                        <span className="ml-2 text-[10px] bg-[#5F7151]/30 text-[#6B8E4E] px-2 py-0.5 rounded font-semibold uppercase">Naprawione</span>
                      )}
                    </span>
                    <span className="text-[#64748B] text-xs">
                      {new Date(d.created_at).toLocaleString('pl-PL')}
                    </span>
                  </div>
                  {d.description && <p className="text-xs text-[#94A3B8] mt-1">{d.description}</p>}
                  {d.photo && <img src={d.photo} alt="usterka" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0F172A] cursor-zoom-in" onClick={() => setPreviewPhoto(d.photo)} />}
                  {resolved && d.resolved_by_name && (
                    <p className="text-[11px] text-[#64748B] mt-1">
                      Naprawione przez {d.resolved_by_name} · {d.resolved_at ? new Date(d.resolved_at).toLocaleString('pl-PL') : ''}
                      {d.destination === 'foreman' && d.destination_foreman_name && (
                        <span> → przekazano do <span className="text-[#6B8E4E] font-semibold">{d.destination_foreman_name}</span></span>
                      )}
                      {d.destination === 'warehouse' && (
                        <span> → wrocil do magazynu</span>
                      )}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {!resolved && d.status !== 'scrapped' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setResolveModal(d);
                            setResolveDest('warehouse');
                            setResolveForemanId('');
                          }}
                          className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs h-7"
                          data-testid={`resolve-defect-${d.id}`}
                        >
                          <Check className="h-3 w-3 mr-1" /> Naprawione
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!window.confirm(`Przeniesc "${d.equipment_name}" (${d.quantity} szt.) na zlom? Operacja zmniejszy ilosc calkowita.`)) return;
                            try {
                              await api.post(`/equipment/defects/${d.id}/resolve`, { disposition: 'scrapped' });
                              toast.success('Przeniesiono na zlom');
                              fetchAll();
                            } catch (err) {
                              toast.error(err.response?.data?.detail || 'Blad');
                            }
                          }}
                          className="bg-[#7F2D2D] hover:bg-[#5C1F1F] text-white text-xs h-7"
                          data-testid={`scrap-defect-${d.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Zlom
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!window.confirm('Usunac to zgloszenie usterki na stale?')) return;
                        try {
                          await api.delete(`/equipment/defects/${d.id}`);
                          toast.success('Zgloszenie usuniete');
                          fetchAll();
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Blad');
                        }
                      }}
                      className="text-[#E8836A] hover:bg-[#7F2D2D]/30 text-xs h-7"
                      data-testid={`delete-defect-${d.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Usun
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <AddEquipmentModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        form={form}
        setForm={setForm}
        onPhotoUpload={handlePhotoUpload}
        onSave={handleAdd}
      />

      <EditEquipmentModal
        editingEq={editingEq}
        setEditingEq={setEditingEq}
        onPhotoUpload={handlePhotoUpload}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      <HistoryModal
        historyModalEq={historyModalEq}
        setHistoryModalEq={setHistoryModalEq}
        historyForModal={historyForModal}
      />

      {/* Scrapped equipment list */}
      {scrapped.length > 0 && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader className="cursor-pointer" onClick={() => setShowScrapped((v) => !v)}>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-[#E8836A]" /> Zlom i zaginiecia ({scrapped.length})
              </span>
              <span className="text-xs text-[#94A3B8]">{showScrapped ? 'Ukryj' : 'Pokaz'}</span>
            </CardTitle>
          </CardHeader>
          {showScrapped && (
            <CardContent>
              <div className="space-y-2">
                {scrapped.map((d) => (
                  <div
                    key={d.id}
                    className="text-sm p-2 rounded border bg-[#1E293B] border-[#7F2D2D]/40"
                    data-testid={`scrap-${d.id}`}
                  >
                    <div className="flex justify-between flex-wrap gap-2">
                      <span>
                        <span className="text-[#E8836A] font-semibold line-through">{d.equipment_name}</span>
                        <span className="text-[#94A3B8]"> x {d.quantity}</span>
                        <span className="text-[#94A3B8]"> · zglosil </span>
                        <span className="text-[#CBD5E1]">{d.foreman_name}</span>
                      </span>
                      <span className="text-[#64748B] text-xs">
                        {d.resolved_at ? new Date(d.resolved_at).toLocaleString('pl-PL') : new Date(d.created_at).toLocaleString('pl-PL')}
                      </span>
                    </div>
                    {d.description && <p className="text-xs text-[#94A3B8] mt-1">{d.description}</p>}
                    {d.resolved_by_name && (
                      <p className="text-[11px] text-[#64748B] mt-1">Zezlomowal {d.resolved_by_name}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <ResolveDefectModal
        resolveModal={resolveModal}
        setResolveModal={setResolveModal}
        resolveDest={resolveDest}
        setResolveDest={setResolveDest}
        resolveForemanId={resolveForemanId}
        setResolveForemanId={setResolveForemanId}
        foremen={foremen}
        fetchAll={fetchAll}
      />

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
