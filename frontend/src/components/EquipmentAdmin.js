import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { prefetch, invalidateCachePrefix } from '../context/apiCache';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, Plus, Trash2, Edit, History, AlertTriangle, X, Undo2, UserCog, Check, ClipboardCheck, Send, Hammer } from 'lucide-react';
import { toast } from 'sonner';
import { EquipmentOrdersAdmin } from './EquipmentOrdersAdmin';
import { AddEquipmentModal, EditEquipmentModal, HistoryModal, ResolveDefectModal } from './equipment/EquipmentModals';
import { SkeletonBox, SkeletonTable } from './ui/skeletons';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const EquipmentAdmin = ({ category = 'electronics', title = 'Elektronarzędzia' }) => {
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
  // Transfer-from-warehouse modal state
  const [transferModal, setTransferModal] = useState(null); // { equipment, prefilledForemanId? }
  const [transferForemanId, setTransferForemanId] = useState('');
  const [transferQty, setTransferQty] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      // PRIMARY fetches via apiCache: returns cached data instantly if <60s old
      // (background refresh) — makes tab switch sub-second on every visit
      // after the first one.
      const [eqData, forData, asgData] = await Promise.all([
        prefetch(`/equipment?category=${encodeURIComponent(category)}`),
        prefetch('/foremen'),
        prefetch('/equipment/assignments/all'),
      ]);
      if (eqData) setEquipment(eqData);
      if (forData) setForemen((forData || []).filter((f) => f.status === 'active'));
      if (asgData) setAssignments(asgData);
      setLoading(false);

      // SECONDARY fetches - same cache-first strategy
      const [hisData, defData, trData, wkData, retData, scrData, invData, shData] = await Promise.all([
        prefetch('/equipment/history'),
        prefetch('/equipment/defects'),
        prefetch('/equipment/transfers/all'),
        prefetch('/settings/warehouse-keeper'),
        prefetch('/equipment/returns/pending'),
        prefetch(`/equipment/scrapped?category=${encodeURIComponent(category)}`),
        prefetch('/equipment/inventory/list'),
        prefetch('/equipment/inventory/shortages?status=open'),
      ]);
      if (hisData) setHistory(hisData);
      if (defData) setDefects(defData);
      if (trData) setTransfers(trData);
      if (wkData) setWarehouseKeeper(wkData);
      if (retData) setPendingReturns(retData);
      if (scrData) setScrapped(scrData);
      if (invData) setActiveInventory((invData || []).filter((c) => c.category === category && c.status === 'active'));
      if (shData) setShortages((shData || []).filter((s) => s.category === category));
    } catch (e) {
      toast.error('Błąd pobierania danych sprzętu');
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Used after mutations: blow away the equipment cache then refetch.
  // Without this, prefetch() would return stale data from before the mutation.
  const refreshAll = useCallback(() => {
    invalidateCachePrefix('/equipment');
    invalidateCachePrefix('/settings/warehouse-keeper');
    fetchAll();
  }, [fetchAll]);

  const getAssigned = (eqId, foremanId) =>
    assignments.find((a) => a.equipment_id === eqId && a.foreman_id === foremanId)?.quantity || 0;

  // Sum of qty assigned per foreman across all equipment
  const foremanTotal = (foremanId) =>
    assignments.filter((a) => a.foreman_id === foremanId).reduce((s, a) => s + (a.quantity || 0), 0);

  // For a given equipment+foreman, what's the max we can assign?
  // = total - broken - sum(other foremen)
  // (Kept for potential future use; transfers now use available_quantity from the
  // equipment payload directly.)

  const handleAdd = async () => {
    if (!form.name.trim() || form.total_quantity === '') {
      toast.error('Podaj nazwe i ilość');
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
      toast.success('Sprzęt dodany');
      setShowAddModal(false);
      setForm({ name: '', brand: '', total_quantity: '', photo: null, variants: '' });
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd dodawania');
    }
  };

  const handleUpdate = async () => {
    try {
      const variantsArr = (editingEq.variants_edit || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const totalQty = editingEq.total_quantity;
      const payload = {
        name: editingEq.name,
        brand: editingEq.brand,
        photo: editingEq.photo,
        variants: variantsArr.length > 0 ? variantsArr : [],
      };
      if (totalQty !== '' && totalQty !== null && totalQty !== undefined && !Number.isNaN(parseInt(totalQty, 10))) {
        payload.total_quantity = parseInt(totalQty, 10);
      }
      await api.put(`/equipment/${editingEq.id}`, payload);
      toast.success('Zaktualizowano');
      setEditingEq(null);
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd zapisu');
    }
  };

  const handleDelete = async (eqId) => {
    if (!window.confirm('Usunac sprzęt wraz ze wszystkimi przypisaniami?')) return;
    try {
      await api.delete(`/equipment/${eqId}`);
      toast.success('Usunieto');
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd usuwania');
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
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const handleAcknowledgeReturn = async (notifId) => {
    // Optymistycznie ukryj z listy
    const backup = pendingReturns;
    setPendingReturns((prev) => (prev || []).filter((r) => r.id !== notifId));
    try {
      await api.post(`/equipment/returns/${notifId}/acknowledge`);
      toast.success('Zwrot potwierdzony');
      refreshAll();
    } catch (err) {
      setPendingReturns(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const handleRejectReturn = async (notifId, eqName, fromName) => {
    if (!window.confirm(`Odrzucić zwrot „${eqName}" od ${fromName}?\n\nSprzęt wróci do brygadzisty.`)) {
      throw new Error('cancelled');
    }
    const backup = pendingReturns;
    setPendingReturns((prev) => (prev || []).filter((r) => r.id !== notifId));
    try {
      const r = await api.post(`/equipment/returns/${notifId}/reject`);
      toast.success(`Sprzęt wrócił do ${r.data.returned_to}`);
      refreshAll();
    } catch (err) {
      setPendingReturns(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const handleRouteToRepair = async (notifId, eqName, qty) => {
    if (!window.confirm(`Przekierować zwrot „${eqName}" x${qty} DO NAPRAWY?\n\nSprzęt zostanie oznaczony jako w naprawie (broken_quantity), zamiast wrócić do magazynu dostępnego.`)) {
      throw new Error('cancelled');
    }
    const backup = pendingReturns;
    setPendingReturns((prev) => (prev || []).filter((r) => r.id !== notifId));
    try {
      await api.post(`/equipment/returns/${notifId}/to-repair`);
      toast.success(`„${eqName}" przekierowano do naprawy`);
      refreshAll();
    } catch (err) {
      setPendingReturns(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const openTransferModal = (eq, prefilledForemanId = '') => {
    if (!eq) return;
    const available = eq.available_quantity || 0;
    if (available <= 0) {
      toast.error('Brak dostępnych sztuk w magazynie. Sprzęt w naprawie/przypisany.');
      return;
    }
    setTransferModal(eq);
    setTransferForemanId(prefilledForemanId);
    setTransferQty('1');
  };

  const closeTransferModal = () => {
    setTransferModal(null);
    setTransferForemanId('');
    setTransferQty('');
  };

  const handleTransferSubmit = async () => {
    if (!transferModal) return;
    if (!transferForemanId) {
      toast.error('Wybierz brygadzistę');
      throw new Error('no_foreman');
    }
    const qty = parseInt(transferQty || '0', 10);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error('Ilość musi być dodatnia');
      throw new Error('bad_qty');
    }
    const available = transferModal.available_quantity || 0;
    if (qty > available) {
      toast.error(`Maks. dostępne: ${available}`);
      throw new Error('over');
    }
    try {
      await api.post('/equipment/transfer-from-warehouse', {
        equipment_id: transferModal.id,
        to_foreman_id: transferForemanId,
        quantity: qty,
      });
      const foremanName = foremen.find((f) => f.id === transferForemanId)?.full_name || 'brygadzistę';
      toast.success(`Przekazano ${qty} szt. „${transferModal.name}" do ${foremanName}. Czeka na akceptację.`);
      closeTransferModal();
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd przekazania');
      throw err;
    }
  };

  const handleStartInventory = async () => {
    if (!window.confirm(
      `Rozpoczac inwentaryzacje dla "${title}"?\n\nWszyscy brygadziści posiadajacy sprzęt w tej kategorii zostana zablokowani na ekranie godzin do momentu potwierdzenia kazdej pozycji.`
    )) return;
    setStartingInventory(true);
    try {
      const r = await api.post('/equipment/inventory/start', { category });
      const required = (r.data?.required_foremen || []).length;
      if (required === 0) {
        toast.warning('Zaden brygadzista nie ma przypisanego sprzętu w tej kategorii');
      } else {
        toast.success(`Inwentaryzacja rozpoczeta. Wymagane potwierdzenia: ${required}`);
      }
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd rozpoczecia inwentaryzacji');
    } finally {
      setStartingInventory(false);
    }
  };

  const handleFinishInventory = async (checkId) => {
    if (!window.confirm('Recznie zakonczyc te inwentaryzacje? Brygadziści zostana odblokowani bez potwierdzenia.')) return;
    try {
      await api.post(`/equipment/inventory/${checkId}/finish`);
      toast.success('Inwentaryzacja zakonczona');
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const handleResolveShortage = async (shortageId) => {
    if (!window.confirm('Oznaczyc zgloszenie jako rozpatrzone? (sprzęt sie znalazl - bez zmian na stanie)')) return;
    const backup = shortages;
    setShortages((prev) => prev.filter((s) => s.id !== shortageId));
    try {
      await api.post(`/equipment/inventory/shortages/${shortageId}/resolve`);
      toast.success('Zgloszenie rozpatrzone');
      refreshAll();
    } catch (err) {
      setShortages(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  // Open edit modal: show thumb immediately, then fetch full-res photo in background
  const handleOpenEdit = async (eq) => {
    setEditingEq({ ...eq, variants_edit: ((eq.variants || []).join(', ')) });
    try {
      const full = await api.get(`/equipment/single/${eq.id}`);
      setEditingEq((prev) => (prev && prev.id === eq.id
        ? { ...prev, photo: full.data?.photo || prev.photo }
        : prev));
    } catch {
      // ignore - keep thumb
    }
  };

  const handleMarkLost = async (shortage) => {
    const missing = shortage.missing_quantity || 0;
    if (missing <= 0) {
      toast.error('Brak ilości do oznaczenia jako zaginione');
      throw new Error('no_missing');
    }
    if (!window.confirm(
      `Oznaczyc ${missing} szt. "${shortage.equipment_name}" jako ZAGINIONE?\n\n` +
      `Ilość zostanie odjeta od stanu brygadzisty ${shortage.foreman_name} i dodana do kolumny "Zaginione".\n\n` +
      `Operacja NIEODWRACALNA.`
    )) {
      throw new Error('cancelled');
    }
    const backup = shortages;
    setShortages((prev) => prev.filter((s) => s.id !== shortage.id));
    try {
      await api.post(`/equipment/inventory/shortages/${shortage.id}/mark-lost`);
      toast.success('Oznaczono jako zaginione');
      refreshAll();
    } catch (err) {
      setShortages(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" data-testid="equipment-loading">
        <SkeletonBox style={{ height: 56 }} />
        <SkeletonTable rows={6} cols={8} />
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
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#4F6343]" />
            {title} - przypisania
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterForemanId}
              onChange={(e) => setFilterForemanId(e.target.value)}
              className="bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm"
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
                className="text-[#94A3B8] hover:bg-[#2A3B59] text-xs"
                data-testid="clear-filter-btn"
              >
                <X className="h-3 w-3 mr-1" /> Wyczysc
              </Button>
            )}
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
              data-testid="add-equipment-btn"
            >
              <Plus className="h-4 w-4 mr-2" /> Dodaj sprzęt
            </Button>
            <ActionButton
              onAction={handleStartInventory}
              disabled={startingInventory || activeInventory.length >0}
              className="bg-[#D4AF37] hover:bg-[#D4A055] text-[#131C2F] font-semibold disabled:opacity-50"
              data-testid="start-inventory-btn"
              title={activeInventory.length > 0 ? 'Inwentaryzacja juz aktywna' : 'Wymuś inwentaryzacje u brygadzistow'}
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {startingInventory ? 'Uruchamianie...' : 'Inwentaryzacja'}</ActionButton>
          </div>
        </CardHeader>
        <CardContent>
          {equipment.length === 0 ? (
            <p className="text-[#94A3B8] text-center py-6">Brak sprzętu. Kliknij "Dodaj sprzęt".</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm" data-testid="equipment-main-table">
                <thead className="sticky top-0 z-30 bg-[#19243C]">
                  {/* Top totals row: per-foreman totals */}
                  <tr>
                    <th className="border border-[#2A3B59] p-2 bg-[#131C2F]" colSpan={8}></th>
                    {visibleForemen.map((f) => (
                      <th
                        key={`tot-${f.id}`}
                        className="border border-[#2A3B59] p-1 bg-[#131C2F] text-center text-[#4F6343] font-bold"
                        data-testid={`foreman-total-${f.id}`}
                      >
                        {foremanTotal(f.id)}
                      </th>
                    ))}
                  </tr>
                  {/* Headers row */}
                  <tr className="bg-[#131C2F]">
                    <th className="border border-[#2A3B59] p-2 text-left text-[#CBD5E1] min-w-[120px]">
                      Historia przekazania
                    </th>
                    <th className="border border-[#2A3B59] p-2 text-center text-[#CBD5E1] min-w-[110px]">
                      Przekaż
                    </th>
                    <th className="border border-[#2A3B59] p-2 text-left text-[#CBD5E1] min-w-[160px]">
                      Nazwa sprzętu
                    </th>
                    <th className="border border-[#2A3B59] p-2 text-left text-[#CBD5E1] min-w-[120px]">
                      Marka
                    </th>
                    <th className="border border-[#2A3B59] p-2 text-center text-[#CBD5E1] min-w-[100px]">
                      Ilość dostępnych sztuk
                    </th>
                    <th className="border border-[#2A3B59] p-2 text-center text-[#CBD5E1] min-w-[120px]">
                      Zdane do magazynu do naprawy
                    </th>
                    <th className="border border-[#2A3B59] p-2 text-center text-[#CBD5E1] min-w-[90px]">
                      Zaginione
                    </th>
                    <th className="border border-[#2A3B59] p-2 text-center text-[#CBD5E1] min-w-[100px]">
                      Dostępne w magazynie
                    </th>
                    {visibleForemen.map((f) => (
                      <th
                        key={f.id}
                        className="border border-[#2A3B59] p-1 text-center text-[#CBD5E1] align-bottom"
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
                    <tr key={eq.id} data-testid={`equipment-row-${eq.id}`} className={idx % 2 === 0 ? 'bg-[#131C2F]/40' : 'bg-[#19243C]'}>
                      <td className="border border-[#2A3B59] p-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryModalEq(eq)}
                          className="text-[#4F6343] hover:bg-[#2A3B59] text-xs h-7"
                          data-testid={`history-btn-${eq.id}`}
                        >
                          <History className="h-3 w-3 mr-1" /> Historia
                        </Button>
                      </td>
                      <td className="border border-[#2A3B59] p-1 text-center">
                        <Button
                          size="sm"
                          onClick={() => openTransferModal(eq)}
                          disabled={(eq.available_quantity || 0) <= 0}
                          className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs h-7 disabled:opacity-40"
                          data-testid={`transfer-btn-${eq.id}`}
                          title={(eq.available_quantity || 0) <= 0 ? 'Brak dostępnych sztuk (przypisane / w naprawie)' : 'Przekaż sprzęt brygadziście'}
                        >
                          <Send className="h-3 w-3 mr-1" /> Przekaż
                        </Button>
                      </td>
                      <td className="border border-[#2A3B59] p-2">
                        <div className="flex items-center gap-2">
                          {eq.photo ? (
                            <img
                              src={eq.photo}
                              alt={eq.name}
                              className="w-12 h-12 object-contain rounded border border-[#2A3B59] shrink-0 bg-[#0B1120] cursor-zoom-in"
                              data-testid={`equipment-thumb-${eq.id}`}
                              onClick={() => setPreviewPhoto(eq.photo)}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-[#131C2F] border border-[#2A3B59] flex items-center justify-center shrink-0">
                              <Wrench className="h-5 w-5 text-[#2A3B59]" />
                            </div>
                          )}
                          <button
                            onClick={() => handleOpenEdit(eq)}
                            className="text-[#CBD5E1] font-semibold hover:text-[#4F6343] text-left"
                            data-testid={`equipment-name-${eq.id}`}
                          >
                            {eq.name}
                          </button>
                        </div>
                      </td>
                      <td className="border border-[#2A3B59] p-2 text-[#94A3B8]">{eq.brand || '-'}</td>
                      <td className="border border-[#2A3B59] p-1 text-center">
                        <span
                          className="text-[#CBD5E1] font-semibold"
                          data-testid={`total-display-${eq.id}`}
                          title="Aby zmienić - kliknij w nazwę sprzętu"
                        >
                          {eq.total_quantity}
                        </span>
                      </td>
                      <td className="border border-[#2A3B59] p-1 text-center">
                        <span
                          className={`font-semibold ${(eq.broken_quantity || 0) > 0 ? 'text-[#DC4A3A]' : 'text-[#64748B]'}`}
                          data-testid={`broken-display-${eq.id}`}
                          title="Wartość zmienia się przez zgłoszenie usterki lub przekierowanie zwrotu do naprawy"
                        >
                          {eq.broken_quantity || 0}
                        </span>
                      </td>
                      <td className="border border-[#2A3B59] p-2 text-center">
                        <span
                          className={(eq.lost_quantity || 0) > 0 ? 'text-[#DC4A3A] font-bold' : 'text-[#64748B]'}
                          data-testid={`lost-${eq.id}`}
                        >
                          {eq.lost_quantity || 0}
                        </span>
                      </td>
                      <td className="border border-[#2A3B59] p-2 text-center">
                        <span
                          className={
                            eq.available_quantity > 0
                              ? 'text-[#4F6343] font-bold text-base'
                              : 'text-[#DC4A3A] font-bold text-base'
                          }
                          data-testid={`available-${eq.id}`}
                        >
                          {eq.available_quantity}
                        </span>
                      </td>
                      {visibleForemen.map((f) => {
                        const current = getAssigned(eq.id, f.id);
                        const initials = (f.full_name || '')
                          .split(/\s+/).filter(Boolean).slice(0, 2)
                          .map((p) => p[0]).join('').toUpperCase();
                        const canTransfer = (eq.available_quantity || 0) > 0;
                        return (
                          <td key={f.id} className="border border-[#2A3B59] p-1 text-center">
                            <div className="text-[8px] text-[#94A3B8] leading-none mb-0.5 font-semibold">{initials}</div>
                            <button
                              type="button"
                              onClick={() => openTransferModal(eq, f.id)}
                              disabled={!canTransfer}
                              className={`w-12 rounded px-1 py-1 text-center text-xs font-semibold ${current > 0 ? 'bg-[#3F5235]/40 text-[#9DBC85] border border-[#5F7552]' : 'bg-[#131C2F] text-[#64748B] border border-[#2A3B59]'} ${canTransfer ? 'hover:bg-[#4F6343]/30 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                              data-testid={`assign-cell-${eq.id}-${f.id}`}
                              title={canTransfer ? `Kliknij aby przekazać ${f.full_name}` : 'Brak dostępnych sztuk'}
                            >
                              {current}
                            </button>
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
            Klikaj w nazwę sprzętu, aby edytować (w tym ilość całkowitą). Kliknij <b className="text-[#9DBC85]">„Przekaż"</b> lub komórkę brygadzisty, aby utworzyć przekazanie - brygadzista musi je zaakceptować. Liczby na samej górze = suma sprzętu przypisanego u danego brygadzisty.
          </p>
        </CardContent>
      </Card>

      {/* Active inventory check banner */}
      {activeInventory.length > 0 && (
        <Card className="bg-[#19243C] border-[#D4AF37]" data-testid="active-inventory-card">
          <CardHeader>
            <CardTitle className="text-[#D4AF37] flex items-center gap-2">
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
                    className="p-3 bg-[#131C2F] rounded border border-[#2A3B59]"
                    data-testid={`inventory-status-${c.id}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div className="text-sm text-[#CBD5E1]">
                        Rozpoczeto: {new Date(c.started_at).toLocaleString('pl-PL')}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm">
                          <span className="text-[#4F6343] font-bold">{confirmed}</span>
                          <span className="text-[#94A3B8]"> / </span>
                          <span className="text-white font-bold">{required}</span>
                          <span className="text-[#94A3B8] ml-1">potwierdzonych</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleFinishInventory(c.id)}
                          className="bg-[#2A3B59] hover:bg-[#2A3B59] text-white"
                          data-testid={`finish-inventory-${c.id}`}
                        >
                          Zakoncz recznie
                        </Button>
                      </div>
                    </div>
                    {pendingNames.length > 0 && (
                      <div className="text-xs text-[#94A3B8]">
                        <span className="text-[#D4AF37]">Oczekuje: </span>
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
        <Card className="bg-[#19243C] border-[#D4AF37]" data-testid="shortages-card">
          <CardHeader>
            <CardTitle className="text-[#D4AF37] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Zgloszone niezgodnosci sprzętu ({shortages.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {shortages.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3 bg-[#131C2F] rounded border border-[#2A3B59]"
                  data-testid={`shortage-row-${s.id}`}
                >
                  <div className="flex-1 min-w-[200px] text-sm">
                    <div>
                      <span className="text-[#CBD5E1] font-semibold">{s.foreman_name}</span>
                      <span className="text-[#94A3B8]"> - </span>
                      <span className="text-[#4F6343] font-bold">{s.equipment_name}</span>
                      {s.equipment_brand && (
                        <span className="text-[#94A3B8]"> ({s.equipment_brand})</span>
                      )}
                    </div>
                    <div className="text-[#94A3B8] mt-1">
                      Posiada <span className="text-white font-bold">{s.reported_quantity}</span>
                      <span> / </span>
                      <span className="text-white">{s.expected_quantity}</span> szt.
                      <span className="text-[#D4AF37] ml-2">
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
                        className="h-16 w-16 rounded object-cover border border-[#2A3B59] cursor-zoom-in"
                      />
                    </a>
                  )}
                  <div className="flex flex-col gap-2 items-stretch">
                    <ActionButton
                      size="sm"
                      onAction={() => handleMarkLost(s)}
                      loadingText="Zapisuję..."
                      successText="✓ Oznaczone"
                      className="bg-[#9b3a2a] hover:bg-[#7a2d20] text-white"
                      data-testid={`mark-lost-${s.id}`}
                      title="Odejmij brakujace szt. od brygadzisty i zapisz jako zaginione"
                    >
                      <X className="h-4 w-4 mr-1" /> Oznacz zaginione
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="outline"
                      onAction={() => handleResolveShortage(s.id)}
                      loadingText="Rozpatruję..."
                      successText="✓ Rozpatrzone"
                      className="border-[#4F6343] text-[#4F6343] hover:bg-[#2A3B59] hover:text-[#4F6343]"
                      data-testid={`resolve-shortage-${s.id}`}
                      title="Sprzęt sie znalazl - bez zmian na stanie"
                    >
                      <Check className="h-4 w-4 mr-1" /> Znalezione
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warehouse keeper setting */}
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
            <UserCog className="h-5 w-5 text-[#4F6343]" />
            Magazynier (otrzymuje powiadomienia o zwrotach)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={warehouseKeeper.foreman_id || ''}
              onChange={(e) => handleSetWarehouseKeeper(e.target.value)}
              className="bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
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
        <Card className="bg-[#19243C] border-[#4F6343]">
          <CardHeader>
            <CardTitle className="text-[#4F6343] flex items-center gap-2">
              <Undo2 className="h-5 w-5" /> Oczekujace zwroty do magazynu ({pendingReturns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingReturns.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#131C2F] rounded border border-[#2A3B59]"
                  data-testid={`pending-return-${r.id}`}
                >
                  <div className="text-sm">
                    <span className="text-[#CBD5E1] font-semibold">{r.from_foreman_name}</span>
                    <span className="text-[#94A3B8]"> zwraca </span>
                    <span className="text-[#4F6343] font-bold">{r.equipment_name}</span>
                    <span className="text-[#94A3B8]"> x </span>
                    <span className="text-white font-bold">{r.quantity}</span>
                    <span className="text-[#64748B] text-xs ml-2">
                      ({new Date(r.created_at).toLocaleString('pl-PL')})
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <ActionButton
                      size="sm"
                      onAction={() => handleRejectReturn(r.id, r.equipment_name, r.from_foreman_name)}
                      loadingText="Odrzucam..."
                      successText="✓ Odrzucono"
                      variant="outline"
                      className="border-[#9B2C2C] text-[#FCA5A5] hover:bg-[#9B2C2C]/20"
                      data-testid={`reject-return-${r.id}`}
                    >
                      Odrzuć
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      onAction={() => handleRouteToRepair(r.id, r.equipment_name, r.quantity)}
                      loadingText="Kieruję..."
                      successText="✓ Do naprawy"
                      className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#131C2F] font-semibold"
                      data-testid={`route-to-repair-${r.id}`}
                      title="Sprzęt trafi do naprawy zamiast do magazynu dostępnego"
                    >
                      <Hammer className="h-3 w-3 mr-1" /> Przekieruj do naprawy
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      onAction={() => handleAcknowledgeReturn(r.id)}
                      loadingText="Przyjmuję..."
                      successText={`✓ Przyjęto x${r.quantity}`}
                      className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                      data-testid={`acknowledge-return-${r.id}`}
                    >
                      Potwierdź przyjecie
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending transfers */}
      {pendingTransfers.length > 0 && (
        <Card className="bg-[#19243C] border-[#2A3B59]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1]">Oczekujace przekazania</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingTransfers.map((t) => (
                <div
                  key={t.id}
                  className="text-sm p-2 bg-[#131C2F] rounded border border-[#2A3B59]"
                  data-testid={`pending-transfer-${t.id}`}
                >
                  <span className="text-[#CBD5E1]">{t.from_foreman_name}</span>
                  <span className="text-[#94A3B8]"> -&gt; </span>
                  <span className="text-[#CBD5E1]">{t.to_foreman_name}</span>
                  <span className="text-[#94A3B8]">: </span>
                  <span className="text-[#4F6343] font-semibold">{t.equipment_name}</span>
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
        <Card className="bg-[#19243C] border-[#2A3B59]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#DC4A3A]" /> Zgloszone usterki
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {defects.slice(0, 20).map((d) => {
                const resolved = d.status === 'resolved';
                return (
                <div
                  key={d.id}
                  className={`text-sm p-2 rounded border ${resolved ? 'bg-[#131C2F] border-[#4F6343]/40 opacity-70' : 'bg-[#131C2F] border-[#2A3B59]'}`}
                  data-testid={`defect-${d.id}`}
                >
                  <div className="flex justify-between flex-wrap gap-2">
                    <span>
                      <span className={`font-semibold ${resolved ? 'text-[#4F6343] line-through' : 'text-[#DC4A3A]'}`}>{d.equipment_name}</span>
                      <span className="text-[#94A3B8]"> x {d.quantity}</span>
                      <span className="text-[#94A3B8]"> · </span>
                      <span className="text-[#CBD5E1]">{d.foreman_name}</span>
                      {resolved && (
                        <span className="ml-2 text-[10px] bg-[#4F6343]/30 text-[#5F7552] px-2 py-0.5 rounded font-semibold uppercase">Naprawione</span>
                      )}
                    </span>
                    <span className="text-[#64748B] text-xs">
                      {new Date(d.created_at).toLocaleString('pl-PL')}
                    </span>
                  </div>
                  {d.description && <p className="text-xs text-[#94A3B8] mt-1">{d.description}</p>}
                  {d.photo && <img src={d.photo} alt="usterka" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0B1120] cursor-zoom-in" onClick={() => setPreviewPhoto(d.photo)} />}
                  {resolved && d.resolved_by_name && (
                    <p className="text-[11px] text-[#64748B] mt-1">
                      Naprawione przez {d.resolved_by_name} · {d.resolved_at ? new Date(d.resolved_at).toLocaleString('pl-PL') : ''}
                      {d.destination === 'foreman' && d.destination_foreman_name && (
                        <span> → przekazano do <span className="text-[#5F7552] font-semibold">{d.destination_foreman_name}</span></span>
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
                          className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs h-7"
                          data-testid={`resolve-defect-${d.id}`}
                        >
                          <Check className="h-3 w-3 mr-1" /> Naprawione
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!window.confirm(`Przeniesc "${d.equipment_name}" (${d.quantity} szt.) na zlom? Operacja zmniejszy ilość calkowita.`)) return;
                            try {
                              await api.post(`/equipment/defects/${d.id}/resolve`, { disposition: 'scrapped' });
                              toast.success('Przeniesiono na zlom');
                              refreshAll();
                            } catch (err) {
                              toast.error(err.response?.data?.detail || 'Błąd');
                            }
                          }}
                          className="bg-[#9B2C2C] hover:bg-[#5C1F1F] text-white text-xs h-7"
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
                        if (!window.confirm('Usunac to zgloszenie usterki na stałe?')) return;
                        try {
                          await api.delete(`/equipment/defects/${d.id}`);
                          toast.success('Zgloszenie usuniete');
                          refreshAll();
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Błąd');
                        }
                      }}
                      className="text-[#DC4A3A] hover:bg-[#9B2C2C]/30 text-xs h-7"
                      data-testid={`delete-defect-${d.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Usuń
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
        <Card className="bg-[#19243C] border-[#2A3B59]">
          <CardHeader className="cursor-pointer" onClick={() => setShowScrapped((v) => !v)}>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-[#DC4A3A]" /> Zlom i zaginiecia ({scrapped.length})
              </span>
              <span className="text-xs text-[#94A3B8]">{showScrapped ? 'Ukryj' : 'Pokaż'}</span>
            </CardTitle>
          </CardHeader>
          {showScrapped && (
            <CardContent>
              <div className="space-y-2">
                {scrapped.map((d) => (
                  <div
                    key={d.id}
                    className="text-sm p-2 rounded border bg-[#131C2F] border-[#9B2C2C]/40"
                    data-testid={`scrap-${d.id}`}
                  >
                    <div className="flex justify-between flex-wrap gap-2">
                      <span>
                        <span className="text-[#DC4A3A] font-semibold line-through">{d.equipment_name}</span>
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
        fetchAll={refreshAll}
      />

      {/* Transfer from warehouse modal */}
      {transferModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          data-testid="transfer-from-warehouse-modal"
        >
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <Send className="h-5 w-5 text-[#4F6343]" />
                Przekaż sprzęt z magazynu
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={closeTransferModal} data-testid="close-transfer-modal">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-2 bg-[#131C2F] rounded border border-[#2A3B59] text-sm">
                <div className="text-[#CBD5E1] font-semibold">{transferModal.name}</div>
                {transferModal.brand && (
                  <div className="text-[#94A3B8] text-xs">{transferModal.brand}</div>
                )}
                <div className="text-xs text-[#94A3B8] mt-1">
                  Dostępne w magazynie: <span className="text-[#9DBC85] font-bold">{transferModal.available_quantity || 0}</span> szt.
                  {(transferModal.broken_quantity || 0) > 0 && (
                    <span className="ml-2 text-[#DC4A3A]">(w naprawie: {transferModal.broken_quantity})</span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Brygadzista</label>
                <select
                  value={transferForemanId}
                  onChange={(e) => setTransferForemanId(e.target.value)}
                  className="w-full bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                  data-testid="transfer-foreman-select"
                >
                  <option value="">-- wybierz --</option>
                  {foremen.map((f) => (
                    <option key={f.id} value={f.id}>{f.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilość</label>
                <Input
                  type="number"
                  min="1"
                  max={transferModal.available_quantity || 1}
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                  data-testid="transfer-qty-input"
                />
              </div>
              <p className="text-[11px] text-[#94A3B8] bg-[#0B1120] p-2 rounded border border-[#2A3B59]">
                Brygadzista musi zaakceptować przekazanie. Stan magazynu zmieni się dopiero po akceptacji.
              </p>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" onClick={closeTransferModal} data-testid="transfer-cancel-btn">
                  Anuluj
                </Button>
                <ActionButton
                  onAction={handleTransferSubmit}
                  loadingText="Wysyłam..."
                  successText="✓ Wysłano"
                  className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="transfer-submit-btn"
                >
                  <Send className="h-4 w-4 mr-1" /> Wyślij przekazanie
                </ActionButton>
              </div>
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
