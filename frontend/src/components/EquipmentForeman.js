import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useCachedApi } from '../context/apiCache';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, Send, AlertTriangle, Bell, Check, X, Undo2, History as HistoryIcon, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';
import { EquipmentCatalog } from './EquipmentCatalog';

// iter95bd: BulkTransferModal wydzielony do ./equipment-foreman/BulkTransferModal.js (refaktor)
import { BulkTransferModal } from './equipment-foreman/BulkTransferModal';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const ACTION_LABELS = {
  returned_to_warehouse: 'Zwrot do magazynu',
  return_acknowledged: 'Potwierdzono zwrot',
  defect_reported: 'Zgloszono usterke',
};

export const EquipmentForeman = ({ category = 'electronics', title = 'Moje elektronarzędzia' }) => {
  const { t } = useLanguage();
  const [myEquipment, setMyEquipment] = useState([]);
  const [foremen, setForemen] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transferModal, setTransferModal] = useState(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [defectModal, setDefectModal] = useState(null);
  const [defectQty, setDefectQty] = useState('');
  const [defectDesc, setDefectDesc] = useState('');
  const [defectPhoto, setDefectPhoto] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [returnQty, setReturnQty] = useState('');
  const [historyModal, setHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState({ transfers: [], events: [] });
  const [pendingReturns, setPendingReturns] = useState([]);
  const [isWarehouseKeeper, setIsWarehouseKeeper] = useState(false);
  const [allEquipment, setAllEquipment] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [allForemen, setAllForemen] = useState([]);
  const [warehouseModal, setWarehouseModal] = useState(false);
  // iter89: Equipment confirmation (potwierdz odbior sprzetu / kontestuj)
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  const [contestModal, setContestModal] = useState(null);  // { id, equipment_name, quantity }
  const [contestReason, setContestReason] = useState('');
  // iter95ay: multi-select sprzętu do bulk-transferu
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(false);          // open flag
  const [bulkTo, setBulkTo] = useState('');                   // wybrany odbiorca
  const [bulkItems, setBulkItems] = useState([]);             // [{id, name, max, qty}]
  const [bulkSending, setBulkSending] = useState(false);

  // Stale-while-revalidate cached data — instant render on tab re-mount (60s)
  const cachedMy = useCachedApi(`/equipment/my?category=${encodeURIComponent(category)}`, 60000);
  const cachedForemen = useCachedApi('/foremen', 60000);

  // Sync cache to local state for instant display
  useEffect(() => {
    if (cachedMy) {
      setMyEquipment(cachedMy);
      setLoading(false);
    }
  }, [cachedMy]);
  useEffect(() => {
    if (cachedForemen) {
      setAllForemen(cachedForemen);
      // iter95ay: BUG FIX — natychmiastowy fallback gdy cached lista jest dostępna
      setForemen(cachedForemen);
    }
  }, [cachedForemen]);

  const fetchAll = useCallback(async () => {
    try {
      // PRIMARY - minimum needed for "Moj sprzet" table to render
      const [myRes, forRes] = await Promise.all([
        api.get(`/equipment/my?category=${encodeURIComponent(category)}`),
        api.get('/foremen'),
      ]);
      setMyEquipment(myRes.data);
      const allF = forRes.data || [];
      setAllForemen(allF);
      // iter95ay: BUG FIX — ustaw listę brygadzistów OD RAZU (bez czekania na SECONDARY).
      // Wcześniej setForemen czekało na cały Promise.all SECONDARY; jeśli którykolwiek
      // (np. /equipment/transfers/pending) odrzucał, lista pozostawała pusta i user
      // widział pusty select w dialogu przekazania.
      setForemen(allF);
      setLoading(false);

      // SECONDARY - transfers banner, keeper status, pending returns etc.
      // Każdy ma własny .catch — żaden błąd nie blokuje renderowania listy.
      const [ptRes, meRes, retRes, wkRes, confRes] = await Promise.all([
        api.get('/equipment/transfers/pending').catch(() => ({ data: [] })),
        api.get('/foreman/me').catch(() => ({ data: null })),
        api.get('/equipment/returns/pending').catch(() => ({ data: [] })),
        api.get('/settings/warehouse-keeper').catch(() => ({ data: { foreman_id: null } })),
        api.get('/equipment/confirmations/pending').catch(() => ({ data: { rows: [] } })),
      ]);
      const me = meRes.data;
      // Po pobraniu „me" doszczegóławiamy listę — wykluczamy samego siebie
      if (me) {
        setForemen(allF.filter((f) => f.id !== me.id));
      }
      setPendingTransfers(ptRes.data || []);
      setPendingReturns(retRes.data || []);
      setPendingConfirmations(confRes.data?.rows || []);
      const keeperFlag = me && wkRes.data?.foreman_id === me.id;
      setIsWarehouseKeeper(keeperFlag);
      if (keeperFlag) {
        const [eqAll, asgAll] = await Promise.all([
          api.get(`/equipment?category=${encodeURIComponent(category)}`).catch(() => ({ data: [] })),
          api.get('/equipment/assignments/all').catch(() => ({ data: [] })),
        ]);
        setAllEquipment(eqAll.data || []);
        setAllAssignments(asgAll.data || []);
      }
    } catch (e) {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    // Only refetch if cache empty - avoids duplicate request on every tab switch
    if (!cachedMy) {
      fetchAll();
    }
    // Background fetch for SECONDARY data (banners, keeper status) - do it once per mount
    api.get('/equipment/transfers/pending').then((r) => setPendingTransfers(r.data)).catch(() => {});
    api.get('/foreman/me').then((r) => {
      const me = r.data;
      api.get('/settings/warehouse-keeper').then((wk) => {
        if (me && wk.data?.foreman_id === me.id) setIsWarehouseKeeper(true);
      }).catch(() => {});
    }).catch(() => {});
    // Poll for new pending transfers + confirmations every 30s
    const id = setInterval(() => {
      api.get('/equipment/transfers/pending').then((r) => setPendingTransfers(r.data)).catch(() => {});
      api.get('/equipment/confirmations/pending').then((r) => setPendingConfirmations(r.data?.rows || [])).catch(() => {});
    }, 30000);
    // initial fetch confirmations (background)
    api.get('/equipment/confirmations/pending').then((r) => setPendingConfirmations(r.data?.rows || [])).catch(() => {});
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAll]);

  const openHistory = async () => {
    try {
      const r = await api.get('/equipment/my-history');
      setHistoryData(r.data);
      setHistoryModal(true);
    } catch (err) {
      toast.error(t('eq.fetch_history_error'));
    }
  };

  const handleTransfer = async () => {
    const qty = parseInt(transferQty, 10);
    if (!transferTo) {
      toast.error('Wybierz brygadziste');
      throw new Error('no_target');
    }
    if (Number.isNaN(qty) || qty <= 0 || qty > transferModal.quantity) {
      toast.error(t('eq.qty_range_x').replace('{n}', transferModal.quantity));
      throw new Error('bad_qty');
    }
    // Optymistycznie: zamknij modal + ZMNIEJSZ ilość na liście brygadzisty natychmiast
    const snapshot = { ...transferModal };
    const targetId = transferTo;
    const backup = myEquipment;
    setMyEquipment((prev) => prev.map((e) =>
      e.id === snapshot.id ? { ...e, quantity: Math.max(0, (e.quantity || 0) - qty) } : e
    ).filter((e) => e.quantity > 0 || e.id !== snapshot.id || (snapshot.quantity - qty) > 0));
    setTransferModal(null);
    setTransferTo('');
    setTransferQty('');
    try {
      await api.post('/equipment/transfer', {
        equipment_id: snapshot.id,
        to_foreman_id: targetId,
        quantity: qty,
      });
      toast.success(`Przekazanie ${qty} szt. ${snapshot.name} wysłane`);
      fetchAll();
    } catch (err) {
      // Przywroc lokalny stan + re-otworz modal
      setMyEquipment(backup);
      setTransferModal(snapshot);
      setTransferTo(targetId);
      setTransferQty(String(qty));
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const handleAccept = async (transferId) => {
    // Optimistic: natychmiast usun z listy
    const backup = pendingTransfers;
    setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
    try {
      await api.post(`/equipment/transfers/${transferId}/accept`);
      toast.success('Zaakceptowano przekazanie');
      // Background refresh bez blokowania UI
      fetchAll();
    } catch (err) {
      setPendingTransfers(backup); // przywroc
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  // iter95ay: otwarcie bulk-modal — przygotuj listę z zaznaczonych pozycji
  const openBulkTransfer = () => {
    const items = myEquipment
      .filter((e) => selectedIds.has(e.id) && (e.quantity || 0) > 0)
      .map((e) => ({ id: e.id, name: e.name, max: e.quantity, qty: e.quantity }));
    if (items.length === 0) {
      toast.error('Zaznacz co najmniej jeden sprzęt');
      return;
    }
    setBulkItems(items);
    setBulkTo('');
    setBulkModal(true);
  };

  const handleBulkTransfer = async () => {
    if (!bulkTo) { toast.error('Wybierz brygadzistę'); return; }
    const validItems = bulkItems.filter((it) => it.qty > 0 && it.qty <= it.max);
    if (validItems.length === 0) { toast.error('Wpisz ilość > 0 dla przynajmniej jednej pozycji'); return; }
    setBulkSending(true);
    // Optymistyczny lokalny update — zmniejsz ilości w tabeli
    const backup = myEquipment;
    setMyEquipment((prev) => prev.map((e) => {
      const it = validItems.find((x) => x.id === e.id);
      return it ? { ...e, quantity: Math.max(0, (e.quantity || 0) - it.qty) } : e;
    }));
    setBulkModal(false);
    setSelectedIds(new Set());
    try {
      const results = await Promise.allSettled(validItems.map((it) =>
        api.post('/equipment/transfer', {
          equipment_id: it.id,
          to_foreman_id: bulkTo,
          quantity: it.qty,
        })
      ));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (failed === 0) {
        toast.success(`Przekazano ${ok} pozycji sprzętu`);
      } else {
        toast.error(`Wysłano ${ok}/${results.length} — ${failed} nie poszło`);
      }
      fetchAll();
    } catch (err) {
      setMyEquipment(backup);
      toast.error('Błąd: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBulkSending(false);
    }
  };

  const handleReject = async (transferId) => {
    const backup = pendingTransfers;
    setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
    try {
      await api.post(`/equipment/transfers/${transferId}/reject`);
      toast.success('Odrzucono przekazanie');
      fetchAll();
    } catch (err) {
      setPendingTransfers(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  // iter89: potwierdzanie odbioru
  const handleConfirmReceipt = async (cid) => {
    const backup = pendingConfirmations;
    setPendingConfirmations((prev) => prev.filter((c) => c.id !== cid));
    try {
      await api.post(`/equipment/confirmations/${cid}/confirm`);
      toast.success('Potwierdzono odbiór');
    } catch (err) {
      setPendingConfirmations(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const handleContestSubmit = async () => {
    if (!contestModal) return;
    const cid = contestModal.id;
    const backup = pendingConfirmations;
    setPendingConfirmations((prev) => prev.filter((c) => c.id !== cid));
    try {
      await api.post(`/equipment/confirmations/${cid}/contest`, { reason: contestReason || null });
      toast.success('Spór zgłoszony - admin zostanie powiadomiony');
      setContestModal(null);
      setContestReason('');
    } catch (err) {
      setPendingConfirmations(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const handleDefect = async () => {
    const qty = parseInt(defectQty, 10);
    if (Number.isNaN(qty) || qty <= 0 || qty > defectModal.quantity) {
      toast.error(t('eq.qty_range_x').replace('{n}', defectModal.quantity));
      throw new Error('bad_qty');
    }
    const snapshot = { ...defectModal };
    const desc = defectDesc;
    const photo = defectPhoto;
    const backup = myEquipment;
    // Optymistycznie zmniejsz ilość (usterka też zabiera szt. z assignment)
    setMyEquipment((prev) => prev.map((e) =>
      e.id === snapshot.id ? { ...e, quantity: Math.max(0, (e.quantity || 0) - qty) } : e
    ));
    setDefectModal(null);
    setDefectQty('');
    setDefectDesc('');
    setDefectPhoto(null);
    try {
      await api.post('/equipment/defect', {
        equipment_id: snapshot.id,
        quantity: qty,
        description: desc || null,
        photo,
      });
      toast.success(`Usterka ${snapshot.name} (${qty} szt.) zgłoszona`);
      fetchAll();
    } catch (err) {
      setMyEquipment(backup);
      setDefectModal(snapshot);
      setDefectQty(String(qty));
      setDefectDesc(desc);
      setDefectPhoto(photo);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const handleReturn = async () => {
    const qty = parseInt(returnQty, 10);
    if (Number.isNaN(qty) || qty <= 0 || qty > returnModal.quantity) {
      toast.error(t('eq.qty_range_x').replace('{n}', returnModal.quantity));
      throw new Error('bad_qty');
    }
    // Optymistycznie: zamknij modal + zmniejsz ilość natychmiast
    const snapshot = { ...returnModal };
    const backup = myEquipment;
    setMyEquipment((prev) => prev.map((e) =>
      e.id === snapshot.id ? { ...e, quantity: Math.max(0, (e.quantity || 0) - qty) } : e
    ));
    setReturnModal(null);
    setReturnQty('');
    try {
      await api.post('/equipment/return', {
        equipment_id: snapshot.id,
        quantity: qty,
      });
      toast.success(`Zwrócono ${qty} szt. ${snapshot.name} do magazynu`);
      fetchAll();
    } catch (err) {
      setMyEquipment(backup);
      setReturnModal(snapshot);
      setReturnQty(String(qty));
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const handleAcknowledgeReturn = async (notifId) => {
    // Optymistycznie ukryj rekord natychmiast
    const backup = pendingReturns;
    setPendingReturns((prev) => prev.filter((r) => r.id !== notifId));
    try {
      await api.post(`/equipment/returns/${notifId}/acknowledge`);
      toast.success('Zwrot potwierdzony');
      fetchAll();
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
    setPendingReturns((prev) => prev.filter((r) => r.id !== notifId));
    try {
      const r = await api.post(`/equipment/returns/${notifId}/reject`);
      toast.success(`Sprzęt wrócił do ${r.data.returned_to}`);
      fetchAll();
    } catch (err) {
      setPendingReturns(backup);
      toast.error(err.response?.data?.detail || 'Błąd');
      throw err;
    }
  };

  const handleDefectPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Maks 2MB');
      return;
    }
    const b64 = await fileToBase64(file);
    setDefectPhoto(b64);
  };

  if (loading) {
    return <div className="text-[#94A3B8] text-sm">{t('eq.loading_dots')}</div>;
  }

  // BLOCKING modal: if there are pending transfers, force foreman to respond before doing anything else
  // iter89: BLOKUJACY modal dla pending_confirmation (najwyzszy priorytet)
  if (pendingConfirmations.length > 0 && !contestModal) {
    const c = pendingConfirmations[0];
    const deadline = c.deadline_at ? new Date(c.deadline_at) : null;
    const hoursLeft = deadline ? Math.max(0, Math.round((deadline - new Date()) / 36e5)) : null;
    return (
      <div
        className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4"
        data-testid="blocking-confirmation-modal"
      >
        <Card className="bg-[#19243C] border-2 border-[#D4AF37] w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-[#D4AF37] flex items-center gap-2 text-lg">
              <Bell className="h-6 w-6 animate-pulse" />
              Potwierdź odbiór sprzętu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-[#131C2F] border border-[#2A3B59] rounded-lg p-4">
              <p className="text-[#CBD5E1] text-base">Zostało Ci przypisane:</p>
              <p className="text-2xl font-bold text-[#D4AF37] mt-2">{c.equipment_name}</p>
              <p className="text-[#CBD5E1] text-lg mt-1">
                Ilość: <span className="font-bold text-white">{c.quantity} szt.</span>
              </p>
              {hoursLeft !== null && (
                <p className="text-xs text-[#FCA5A5] mt-2">
                  Pozostało: <b>{hoursLeft}h</b> do upływu 48-godzinnego SLA
                </p>
              )}
            </div>
            <p className="text-xs text-[#94A3B8] text-center">
              Potwierdź odbiór jeśli sprzęt fizycznie posiadasz, lub kliknij „Nie otrzymałem" aby zgłosić spór.
            </p>
            <div className="flex gap-2">
              <ActionButton
                onAction={() => { setContestModal(c); }}
                variant="ghost"
                className="flex-1 text-[#FCA5A5] hover:bg-[#9B2C2C] border border-[#9B2C2C]"
                data-testid={`contest-confirmation-${c.id}`}
              >
                <X className="h-4 w-4 mr-2" /> Nie otrzymałem
              </ActionButton>
              <ActionButton
                onAction={() => handleConfirmReceipt(c.id)}
                loadingText="Potwierdzam..."
                className="flex-1 bg-[#4F6343] hover:bg-[#3F5235] text-white"
                data-testid={`confirm-confirmation-${c.id}`}
              >
                <Check className="h-4 w-4 mr-2" /> Potwierdzam odbiór
              </ActionButton>
            </div>
            {pendingConfirmations.length > 1 && (
              <p className="text-xs text-[#D4AF37] text-center">
                Masz {pendingConfirmations.length - 1} kolejnych potwierdzeń do rozpatrzenia po tym
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // iter89: Modal zglaszania sporu (poza glownym blokujacym)
  if (contestModal) {
    return (
      <div
        className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4"
        data-testid="contest-reason-modal"
      >
        <Card className="bg-[#19243C] border-2 border-[#9B2C2C] w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-[#FCA5A5] flex items-center gap-2 text-lg">
              <AlertTriangle className="h-6 w-6" />
              Zgłoś spór - nie otrzymałem sprzętu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[#CBD5E1] text-sm">
              Sprzęt: <b>{contestModal.equipment_name} x{contestModal.quantity}</b>
            </p>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Powód (opcjonalnie)</label>
              <Input
                value={contestReason}
                onChange={(e) => setContestReason(e.target.value)}
                placeholder="Np. nie odebrałem z magazynu / nie zostało mi przekazane"
                className="bg-[#131C2F] border-[#2A3B59] text-white"
                data-testid="contest-reason-input"
              />
            </div>
            <p className="text-xs text-[#94A3B8] text-center">
              Admin zostanie powiadomiony i zdecyduje czy zostawić przypisanie, czy je wycofać.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => { setContestModal(null); setContestReason(''); }}
                variant="ghost"
                className="flex-1 text-[#94A3B8] hover:bg-[#2A3B59]"
                data-testid="contest-cancel-btn"
              >
                Anuluj
              </Button>
              <ActionButton
                onAction={handleContestSubmit}
                loadingText="Wysyłam..."
                className="flex-1 bg-[#9B2C2C] hover:bg-[#7C1D1D] text-white"
                data-testid="contest-submit-btn"
              >
                Zgłoś spór
              </ActionButton>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pendingTransfers.length > 0) {
    const t = pendingTransfers[0];
    return (
      <>
        <div
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4"
          data-testid="blocking-transfer-modal"
        >
          <Card className="bg-[#19243C] border-2 border-[#9B2C2C] w-full max-w-md shadow-2xl">
            <CardHeader>
              <CardTitle className="text-[#FCA5A5] flex items-center gap-2 text-lg">
                <Bell className="h-6 w-6 animate-pulse" />
                Oczekujace przekazanie sprzętu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-[#131C2F] border border-[#2A3B59] rounded-lg p-4">
                <p className="text-[#CBD5E1] text-base">
                  <span className="font-bold text-white">{t.from_foreman_name}</span> chce przekazac Ci:
                </p>
                <p className="text-2xl font-bold text-[#4F6343] mt-2">
                  {t.equipment_name}
                </p>
                <p className="text-[#CBD5E1] text-lg mt-1">
                  Ilość: <span className="font-bold text-white">{t.quantity} szt.</span>
                </p>
                <p className="text-xs text-[#64748B] mt-2">
                  {new Date(t.created_at).toLocaleString('pl-PL')}
                </p>
              </div>
              <p className="text-xs text-[#94A3B8] text-center">
                Musisz zaakceptowac lub odrzucic przekazanie aby kontynuowac.
              </p>
              <div className="flex gap-2">
                <ActionButton
                  onAction={() => handleReject(t.id)}
                  loadingText="Odrzucam..."
                  variant="ghost"
                  className="flex-1 text-[#FCA5A5] hover:bg-[#9B2C2C] border border-[#9B2C2C]"
                  data-testid={`reject-transfer-${t.id}`}
                >
                  <X className="h-4 w-4 mr-2" /> Odrzuc
                </ActionButton>
                <ActionButton
                  onAction={() => handleAccept(t.id)}
                  loadingText="Akceptuję..."
                  className="flex-1 bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid={`accept-transfer-${t.id}`}
                >
                  <Check className="h-4 w-4 mr-2" /> Akceptuj
                </ActionButton>
              </div>
              {pendingTransfers.length > 1 && (
                <p className="text-xs text-[#FCA5A5] text-center">
                  Masz {pendingTransfers.length - 1} kolejnych przekazan do rozpatrzenia po tym
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3" data-testid="equipment-foreman">
      {/* Pending warehouse returns (only visible to designated warehouse keeper) */}
      {pendingReturns.length > 0 && (
        <Card className="bg-[#19243C] border-[#4F6343]" data-testid="warehouse-keeper-section">
          <CardHeader>
            <CardTitle className="text-[#4F6343] flex items-center gap-2 text-base">
              <Undo2 className="h-5 w-5" /> Zwroty do magazynu — do potwierdzenia ({pendingReturns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingReturns.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#131C2F] rounded border border-[#2A3B59]"
                  data-testid={`keeper-pending-return-${r.id}`}
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
                  <div className="flex gap-2">
                    <ActionButton
                      size="sm"
                      onAction={() => handleRejectReturn(r.id, r.equipment_name, r.from_foreman_name)}
                      loadingText="Odrzucam..."
                      successText="✓ Odrzucono"
                      variant="outline"
                      className="border-[#9B2C2C] text-[#FCA5A5] hover:bg-[#9B2C2C]/20"
                      data-testid={`keeper-reject-return-${r.id}`}
                    >
                      Odrzuć
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      onAction={() => handleAcknowledgeReturn(r.id)}
                      loadingText="Przyjmuję..."
                      successText={`✓ Przyjęto x${r.quantity}`}
                      className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                      data-testid={`keeper-acknowledge-return-${r.id}`}
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

      {/* My equipment table */}
      <Card className="bg-[#19243C] border-[#2A3B59]" data-testid="my-equipment-card">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#4F6343]" /> {title}
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={openHistory}
            className="text-[#4F6343] hover:bg-[#2A3B59] text-xs"
            data-testid="my-history-btn"
          >
            <HistoryIcon className="h-4 w-4 mr-1" /> Moja historia
          </Button>
          {isWarehouseKeeper && (
            <Button
              size="sm"
              onClick={() => setWarehouseModal(true)}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs"
              data-testid="warehouse-overview-btn"
            >
              <Warehouse className="h-4 w-4 mr-1" /> Caly magazyn
            </Button>
          )}
          </div>
        </CardHeader>
        <CardContent>
          {myEquipment.length === 0 ? (
            <p className="text-[#94A3B8] text-sm">{t('eq.no_assigned')}</p>
          ) : (
            <div className="overflow-x-auto">
              {/* iter95ay: pasek bulk-akcji nad tabelą */}
              {selectedIds.size > 0 && (
                <div className="mb-2 flex items-center gap-2 p-2 bg-[#3F5235]/30 border border-[#5F7552]/60 rounded"
                     data-testid="bulk-toolbar">
                  <span className="text-sm text-[#9DBC85] font-semibold">
                    Zaznaczono: {selectedIds.size}
                  </span>
                  <Button
                    size="sm"
                    onClick={openBulkTransfer}
                    className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs h-7"
                    data-testid="bulk-transfer-btn"
                  >
                    <Send className="h-3 w-3 mr-1" /> Przekaż zaznaczone
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[#94A3B8] hover:text-white text-xs h-7"
                    data-testid="bulk-clear-btn"
                  >
                    Wyczyść zaznaczenie
                  </Button>
                </div>
              )}
              <table className="w-full border-collapse text-xs sm:text-sm" data-testid="my-equipment-table">
                <thead className="sticky top-0 z-30 bg-[#19243C]">
                  <tr className="bg-[#131C2F]">
                    <th className="border border-[#2A3B59] p-1 sm:p-2 text-center w-10">
                      <input
                        type="checkbox"
                        checked={myEquipment.length > 0 && selectedIds.size === myEquipment.length}
                        ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < myEquipment.length; }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(myEquipment.map((x) => x.id)));
                          else setSelectedIds(new Set());
                        }}
                        className="cursor-pointer accent-[#4F6343]"
                        title={selectedIds.size === myEquipment.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                        data-testid="bulk-select-all"
                      />
                    </th>
                    <th className="border border-[#2A3B59] p-1 sm:p-2 text-left text-[#CBD5E1]">Nazwa</th>
                    <th className="border border-[#2A3B59] p-1 sm:p-2 text-left text-[#CBD5E1]">Marka</th>
                    <th className="border border-[#2A3B59] p-1 sm:p-2 text-center text-[#CBD5E1]">Ilość</th>
                    <th className="border border-[#2A3B59] p-1 sm:p-2 text-center text-[#CBD5E1]">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {myEquipment.map((eq) => (
                    <tr key={eq.id} data-testid={`my-equipment-row-${eq.id}`}>
                      <td className="border border-[#2A3B59] p-1 sm:p-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(eq.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(eq.id); else next.delete(eq.id);
                              return next;
                            });
                          }}
                          className="cursor-pointer accent-[#4F6343]"
                          data-testid={`bulk-select-${eq.id}`}
                        />
                      </td>
                      <td className="border border-[#2A3B59] p-1 sm:p-2 align-middle">
                        <div className="flex items-center gap-2">
                          {eq.photo ? (
                            <img
                              src={eq.photo}
                              alt={eq.name}
                              className="w-10 h-10 sm:w-12 sm:h-12 object-contain rounded border border-[#2A3B59] shrink-0 bg-[#0B1120] cursor-zoom-in"
                              onClick={() => setPreviewPhoto(eq.photo)}
                            />
                          ) : (
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded bg-[#131C2F] border border-[#2A3B59] flex items-center justify-center shrink-0">
                              <Wrench className="h-5 w-5 text-[#2A3B59]" />
                            </div>
                          )}
                          <span className="text-[#CBD5E1] font-semibold text-[11px] sm:text-sm leading-tight break-words normal-case">{eq.name}</span>
                        </div>
                      </td>
                      <td className="border border-[#2A3B59] p-1 sm:p-2 text-[#94A3B8] text-[11px] sm:text-sm align-middle">{eq.brand || '-'}</td>
                      <td className="border border-[#2A3B59] p-1 sm:p-2 text-center text-[#4F6343] font-bold align-middle">{eq.quantity}</td>
                      <td className="border border-[#2A3B59] p-1 align-middle">
                        <div className="flex gap-1 flex-col sm:flex-row sm:flex-wrap items-stretch sm:justify-center">
                          <Button
                            size="sm"
                            onClick={() => {
                              setTransferModal(eq);
                              setTransferQty(String(Math.min(1, eq.quantity)));
                            }}
                            className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs h-7 px-2"
                            data-testid={`transfer-btn-${eq.id}`}
                          >
                            <Send className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">{t('eq.transfer')}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReturnModal(eq);
                              setReturnQty(String(eq.quantity));
                            }}
                            className="text-[#4F6343] hover:bg-[#2A3B59] text-xs h-7 px-2"
                            data-testid={`return-btn-${eq.id}`}
                          >
                            <Undo2 className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">{t('eq.return_warehouse')}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDefectModal(eq);
                              setDefectQty('1');
                            }}
                            className="text-[#DC4A3A] hover:bg-[#2A3B59] text-xs h-7 px-2"
                            data-testid={`defect-btn-${eq.id}`}
                          >
                            <AlertTriangle className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">{t('eq.defect_short')}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipment catalog for ordering */}
      <EquipmentCatalog category={category} />

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">Przekaz: {transferModal.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setTransferModal(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[#94A3B8]">
                Posiadasz: <span className="text-[#CBD5E1] font-semibold">{transferModal.quantity} szt.</span>
              </p>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.foreman_required')}</label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                  data-testid="transfer-to-select"
                >
                  <option value="">-- wybierz --</option>
                  {foremen.map((f) => (
                    <option key={f.id} value={f.id}>{f.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.qty_required')}</label>
                <Input
                  type="number"
                  min="1"
                  max={transferModal.quantity}
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                  data-testid="transfer-qty-input"
                />
              </div>
              <p className="text-xs text-[#94A3B8]">
                Drugi brygadzista musi zaakceptowac przekazanie.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setTransferModal(null)}>Anuluj</Button>
                <ActionButton
                  onAction={handleTransfer}
                  loadingText="Wysyłam..."
                  successText="✓ Wysłano"
                  className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="confirm-transfer-btn"
                >
                  Wyslij
                </ActionButton>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* iter95ay/iter95bd: Bulk Transfer Modal — wydzielony do ./equipment-foreman/BulkTransferModal.js */}
      <BulkTransferModal
        open={bulkModal}
        bulkItems={bulkItems}
        setBulkItems={setBulkItems}
        bulkTo={bulkTo}
        setBulkTo={setBulkTo}
        bulkSending={bulkSending}
        foremen={foremen}
        onClose={() => setBulkModal(false)}
        onConfirm={handleBulkTransfer}
      />

      {/* Return Modal */}
      {returnModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">Zwrot do magazynu: {returnModal.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setReturnModal(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[#94A3B8]">
                Posiadasz: <span className="text-[#CBD5E1] font-semibold">{returnModal.quantity} szt.</span>
              </p>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.qty_to_return')}</label>
                <Input
                  type="number"
                  min="1"
                  max={returnModal.quantity}
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                  data-testid="return-qty-input"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setReturnModal(null)}>Anuluj</Button>
                <ActionButton
                  onAction={handleReturn}
                  loadingText="Zwracam..."
                  successText="✓ Zwrócono"
                  className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="confirm-return-btn"
                >
                  Zwroc do magazynu
                </ActionButton>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Defect Modal */}
      {defectModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">Usterka: {defectModal.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setDefectModal(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.qty_pcs')}</label>
                <Input
                  type="number"
                  min="1"
                  max={defectModal.quantity}
                  value={defectQty}
                  onChange={(e) => setDefectQty(e.target.value)}
                  className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                  data-testid="defect-qty-input"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.defect_description')}</label>
                <textarea
                  value={defectDesc}
                  onChange={(e) => setDefectDesc(e.target.value)}
                  rows="3"
                  className="w-full bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                  data-testid="defect-desc-input"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">{t('eq.photo_2mb')}</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleDefectPhotoUpload}
                  className="text-xs text-[#CBD5E1]"
                  data-testid="defect-photo-input"
                />
                {defectPhoto && <img src={defectPhoto} alt="podglad" className="mt-2 max-h-64 max-w-full object-contain rounded bg-[#0B1120]" />}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setDefectModal(null)}>Anuluj</Button>
                <ActionButton
                  onAction={handleDefect}
                  loadingText="Zgłaszam..."
                  successText="✓ Zgłoszono"
                  className="bg-[#DC4A3A] hover:bg-[#C56A52] text-white"
                  data-testid="confirm-defect-btn"
                >
                  Zglos
                </ActionButton>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* My History Modal */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-2xl max-h-[80vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">{t('eq.history_title')}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setHistoryModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-3">
              {/* Transfers */}
              <div>
                <h4 className="text-[#4F6343] font-bold text-sm mb-2">{t('eq.transfers')}</h4>
                {historyData.transfers.length === 0 ? (
                  <p className="text-[#94A3B8] text-xs">{t('eq.no_transfers')}</p>
                ) : (
                  <div className="space-y-1" data-testid="my-history-transfers">
                    {historyData.transfers.map((t) => {
                      const isOutgoing = t.from_foreman_name === historyData.foreman_name;
                      return (
                        <div key={t.id} className="text-xs p-2 bg-[#131C2F] rounded border border-[#2A3B59]">
                          <span className={isOutgoing ? 'text-[#DC4A3A]' : 'text-[#4F6343]'}>
                            {isOutgoing ? '-> Wyslane do' : '<- Otrzymane od'}
                          </span>{' '}
                          <span className="text-[#CBD5E1] font-semibold">
                            {isOutgoing ? t.to_foreman_name : t.from_foreman_name}
                          </span>{' '}
                          <span className="text-[#94A3B8]">·</span>{' '}
                          <span className="text-[#CBD5E1]">{t.equipment_name} x {t.quantity}</span>{' '}
                          <span className="text-[#94A3B8]">·</span>{' '}
                          <span className={t.status === 'accepted' ? 'text-[#4F6343]' :
                                            t.status === 'rejected' ? 'text-[#DC4A3A]' :
                                            'text-[#FCA5A5]'}>
                            {t.status === 'pending' ? 'Oczekuje' :
                             t.status === 'accepted' ? 'Zaakceptowane' : 'Odrzucone'}
                          </span>{' '}
                          <span className="text-[#64748B]">
                            · {new Date(t.created_at).toLocaleString('pl-PL')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Other events */}
              {historyData.events.length > 0 && (
                <div>
                  <h4 className="text-[#4F6343] font-bold text-sm mb-2 mt-3">{t('eq.returns_defects')}</h4>
                  <div className="space-y-1">
                    {historyData.events.map((e) => (
                      <div key={e.id} className="text-xs p-2 bg-[#131C2F] rounded border border-[#2A3B59]">
                        <span className="text-[#4F6343] font-semibold">
                          {ACTION_LABELS[e.action] || e.action}
                        </span>{' '}
                        <span className="text-[#CBD5E1]">
                          {e.details?.equipment_name || ''} x {e.details?.quantity || '?'}
                        </span>
                        {e.details?.description && (
                          <span className="text-[#94A3B8]"> · "{e.details.description}"</span>
                        )}{' '}
                        <span className="text-[#64748B]">
                          · {new Date(e.created_at).toLocaleString('pl-PL')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Warehouse Overview Modal (warehouse keeper only) */}
      {warehouseModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-5xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-[#4F6343]" /> Caly magazyn — przeglad
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setWarehouseModal(false)} data-testid="close-warehouse-modal">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              {allEquipment.length === 0 ? (
                <p className="text-[#94A3B8] text-sm">{t('eq.no_eq')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" data-testid="warehouse-overview-table">
                    <thead className="sticky top-0 z-10 bg-[#19243C]">
                      <tr className="bg-[#131C2F]">
                        <th className="border border-[#2A3B59] p-2 text-left text-[#CBD5E1]">Nazwa</th>
                        <th className="border border-[#2A3B59] p-2 text-left text-[#CBD5E1]">Marka</th>
                        <th className="border border-[#2A3B59] p-2 text-center text-[#CBD5E1]">Razem</th>
                        <th className="border border-[#2A3B59] p-2 text-center text-[#DC4A3A]">{t('eq.in_repair')}</th>
                        <th className="border border-[#2A3B59] p-2 text-center text-[#4F6343]">Magazyn</th>
                        <th className="border border-[#2A3B59] p-2 text-left text-[#CBD5E1]">{t('eq.who_has')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allEquipment.map((eq) => {
                        const holders = allAssignments
                          .filter((a) => a.equipment_id === eq.id && a.quantity > 0)
                          .map((a) => {
                            const f = allForemen.find((x) => x.id === a.foreman_id);
                            return f ? `${f.full_name} (${a.quantity})` : null;
                          })
                          .filter(Boolean);
                        return (
                          <tr key={eq.id}>
                            <td className="border border-[#2A3B59] p-2">
                              <div className="flex items-center gap-2">
                                {eq.photo ? (
                                  <img src={eq.photo} alt={eq.name} className="w-12 h-12 object-contain rounded shrink-0 bg-[#0B1120] cursor-zoom-in" onClick={() => setPreviewPhoto(eq.photo)} />
                                ) : (
                                  <div className="w-12 h-12 rounded bg-[#131C2F] flex items-center justify-center shrink-0">
                                    <Wrench className="h-4 w-4 text-[#2A3B59]" />
                                  </div>
                                )}
                                <span className="text-[#CBD5E1] font-semibold">{eq.name}</span>
                              </div>
                            </td>
                            <td className="border border-[#2A3B59] p-2 text-[#94A3B8]">{eq.brand || '-'}</td>
                            <td className="border border-[#2A3B59] p-2 text-center text-[#CBD5E1] font-bold">{eq.total_quantity}</td>
                            <td className="border border-[#2A3B59] p-2 text-center text-[#DC4A3A] font-bold">{eq.broken_quantity || 0}</td>
                            <td className={`border border-[#2A3B59] p-2 text-center font-bold ${eq.available_quantity > 0 ? 'text-[#4F6343]' : 'text-[#DC4A3A]'}`}>
                              {eq.available_quantity}
                            </td>
                            <td className="border border-[#2A3B59] p-2 text-[#94A3B8]">
                              {holders.length === 0 ? <span className="text-[#64748B]">nikt</span> : holders.join(', ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-[#94A3B8] mt-3">
                Magazynier widzi cale stany sprzętu i kto co posiada. Aby zarzadzac przypisaniami zwroc sie do administratora.
              </p>
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
