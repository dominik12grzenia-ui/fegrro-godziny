import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, Send, AlertTriangle, Bell, Check, X, Undo2, History as HistoryIcon, Warehouse } from 'lucide-react';
import { toast } from 'sonner';

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

export const EquipmentForeman = () => {
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
  const [allForemen, setAllForemen] = useState([]);
  const [warehouseModal, setWarehouseModal] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [myRes, forRes, ptRes, meRes, retRes, wkRes] = await Promise.all([
        api.get('/equipment/my'),
        api.get('/foremen'),
        api.get('/equipment/transfers/pending'),
        api.get('/foreman/me').catch(() => ({ data: null })),
        api.get('/equipment/returns/pending').catch(() => ({ data: [] })),
        api.get('/settings/warehouse-keeper').catch(() => ({ data: { foreman_id: null } })),
      ]);
      setMyEquipment(myRes.data);
      const me = meRes.data;
      const allF = forRes.data || [];
      setAllForemen(allF);
      setForemen(allF.filter((f) => !me || f.id !== me.id));
      setPendingTransfers(ptRes.data);
      setPendingReturns(retRes.data);
      const keeperFlag = me && wkRes.data?.foreman_id === me.id;
      setIsWarehouseKeeper(keeperFlag);
      // If keeper, also load full equipment + assignments overview
      if (keeperFlag) {
        const [eqAll, asgAll] = await Promise.all([
          api.get('/equipment'),
          api.get('/equipment/assignments/all'),
        ]);
        setAllEquipment(eqAll.data);
        setAllAssignments(asgAll.data);
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Poll for new pending transfers every 30s
    const id = setInterval(() => {
      api.get('/equipment/transfers/pending').then((r) => setPendingTransfers(r.data)).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const openHistory = async () => {
    try {
      const r = await api.get('/equipment/my-history');
      setHistoryData(r.data);
      setHistoryModal(true);
    } catch (err) {
      toast.error('Blad pobierania historii');
    }
  };

  const handleTransfer = async () => {
    const qty = parseInt(transferQty, 10);
    if (!transferTo) {
      toast.error('Wybierz brygadziste');
      return;
    }
    if (Number.isNaN(qty) || qty <= 0 || qty > transferModal.quantity) {
      toast.error(`Ilosc musi byc 1-${transferModal.quantity}`);
      return;
    }
    try {
      await api.post('/equipment/transfer', {
        equipment_id: transferModal.id,
        to_foreman_id: transferTo,
        quantity: qty,
      });
      toast.success('Przekazanie wyslane do akceptacji');
      setTransferModal(null);
      setTransferTo('');
      setTransferQty('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const handleAccept = async (transferId) => {
    try {
      await api.post(`/equipment/transfers/${transferId}/accept`);
      toast.success('Zaakceptowano przekazanie');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const handleReject = async (transferId) => {
    try {
      await api.post(`/equipment/transfers/${transferId}/reject`);
      toast.success('Odrzucono przekazanie');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const handleDefect = async () => {
    const qty = parseInt(defectQty, 10);
    if (Number.isNaN(qty) || qty <= 0 || qty > defectModal.quantity) {
      toast.error(`Ilosc musi byc 1-${defectModal.quantity}`);
      return;
    }
    try {
      await api.post('/equipment/defect', {
        equipment_id: defectModal.id,
        quantity: qty,
        description: defectDesc || null,
        photo: defectPhoto,
      });
      toast.success('Usterka zgloszona');
      setDefectModal(null);
      setDefectQty('');
      setDefectDesc('');
      setDefectPhoto(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const handleReturn = async () => {
    const qty = parseInt(returnQty, 10);
    if (Number.isNaN(qty) || qty <= 0 || qty > returnModal.quantity) {
      toast.error(`Ilosc musi byc 1-${returnModal.quantity}`);
      return;
    }
    try {
      await api.post('/equipment/return', {
        equipment_id: returnModal.id,
        quantity: qty,
      });
      toast.success(`Zwrocono ${qty} szt. do magazynu`);
      setReturnModal(null);
      setReturnQty('');
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
    return <div className="text-[#94A3B8] text-sm">Wczytywanie sprzetu...</div>;
  }

  // BLOCKING modal: if there are pending transfers, force foreman to respond before doing anything else
  if (pendingTransfers.length > 0) {
    const t = pendingTransfers[0];
    return (
      <>
        <div
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4"
          data-testid="blocking-transfer-modal"
        >
          <Card className="bg-[#2A384C] border-2 border-[#7F2D2D] w-full max-w-md shadow-2xl">
            <CardHeader>
              <CardTitle className="text-[#FCA5A5] flex items-center gap-2 text-lg">
                <Bell className="h-6 w-6 animate-pulse" />
                Oczekujace przekazanie sprzetu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4">
                <p className="text-[#CBD5E1] text-base">
                  <span className="font-bold text-white">{t.from_foreman_name}</span> chce przekazac Ci:
                </p>
                <p className="text-2xl font-bold text-[#5F7151] mt-2">
                  {t.equipment_name}
                </p>
                <p className="text-[#CBD5E1] text-lg mt-1">
                  Ilosc: <span className="font-bold text-white">{t.quantity} szt.</span>
                </p>
                <p className="text-xs text-[#64748B] mt-2">
                  {new Date(t.created_at).toLocaleString('pl-PL')}
                </p>
              </div>
              <p className="text-xs text-[#94A3B8] text-center">
                Musisz zaakceptowac lub odrzucic przekazanie aby kontynuowac.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleReject(t.id)}
                  variant="ghost"
                  className="flex-1 text-[#FCA5A5] hover:bg-[#7F2D2D] border border-[#7F2D2D]"
                  data-testid={`reject-transfer-${t.id}`}
                >
                  <X className="h-4 w-4 mr-2" /> Odrzuc
                </Button>
                <Button
                  onClick={() => handleAccept(t.id)}
                  className="flex-1 bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid={`accept-transfer-${t.id}`}
                >
                  <Check className="h-4 w-4 mr-2" /> Akceptuj
                </Button>
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
        <Card className="bg-[#2A384C] border-[#5F7151]" data-testid="warehouse-keeper-section">
          <CardHeader>
            <CardTitle className="text-[#5F7151] flex items-center gap-2 text-base">
              <Undo2 className="h-5 w-5" /> Zwroty do magazynu — do potwierdzenia ({pendingReturns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingReturns.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#1E293B] rounded border border-[#334155]"
                  data-testid={`keeper-pending-return-${r.id}`}
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
                    data-testid={`keeper-acknowledge-return-${r.id}`}
                  >
                    Potwierdz przyjecie
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My equipment table */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#5F7151]" /> Moj sprzet
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={openHistory}
            className="text-[#5F7151] hover:bg-[#334155] text-xs"
            data-testid="my-history-btn"
          >
            <HistoryIcon className="h-4 w-4 mr-1" /> Moja historia
          </Button>
          {isWarehouseKeeper && (
            <Button
              size="sm"
              onClick={() => setWarehouseModal(true)}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs"
              data-testid="warehouse-overview-btn"
            >
              <Warehouse className="h-4 w-4 mr-1" /> Caly magazyn
            </Button>
          )}
          </div>
        </CardHeader>
        <CardContent>
          {myEquipment.length === 0 ? (
            <p className="text-[#94A3B8] text-sm">Nie masz przypisanego sprzetu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="my-equipment-table">
                <thead className="sticky top-0 z-30 bg-[#2A384C]">
                  <tr className="bg-[#1E293B]">
                    <th className="border border-[#334155] p-2 text-left text-[#CBD5E1]">Nazwa</th>
                    <th className="border border-[#334155] p-2 text-left text-[#CBD5E1]">Marka</th>
                    <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Ilosc</th>
                    <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {myEquipment.map((eq) => (
                    <tr key={eq.id} data-testid={`my-equipment-row-${eq.id}`}>
                      <td className="border border-[#334155] p-2">
                        <div className="flex items-center gap-2">
                          {eq.photo ? (
                            <img
                              src={eq.photo}
                              alt={eq.name}
                              className="w-10 h-10 object-cover rounded border border-[#334155] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-[#1E293B] border border-[#334155] flex items-center justify-center shrink-0">
                              <Wrench className="h-5 w-5 text-[#475569]" />
                            </div>
                          )}
                          <span className="text-[#CBD5E1] font-semibold">{eq.name}</span>
                        </div>
                      </td>
                      <td className="border border-[#334155] p-2 text-[#94A3B8]">{eq.brand || '-'}</td>
                      <td className="border border-[#334155] p-2 text-center text-[#5F7151] font-bold">{eq.quantity}</td>
                      <td className="border border-[#334155] p-1">
                        <div className="flex gap-1 flex-wrap justify-center">
                          <Button
                            size="sm"
                            onClick={() => {
                              setTransferModal(eq);
                              setTransferQty(String(Math.min(1, eq.quantity)));
                            }}
                            className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs h-7"
                            data-testid={`transfer-btn-${eq.id}`}
                          >
                            <Send className="h-3 w-3 mr-1" /> Przekaz
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReturnModal(eq);
                              setReturnQty(String(eq.quantity));
                            }}
                            className="text-[#5F7151] hover:bg-[#334155] text-xs h-7"
                            data-testid={`return-btn-${eq.id}`}
                          >
                            <Undo2 className="h-3 w-3 mr-1" /> Zwrot
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDefectModal(eq);
                              setDefectQty('1');
                            }}
                            className="text-[#E8836A] hover:bg-[#334155] text-xs h-7"
                            data-testid={`defect-btn-${eq.id}`}
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" /> Usterka
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

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
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
                <label className="text-xs text-[#94A3B8] mb-1 block">Brygadzista *</label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                  data-testid="transfer-to-select"
                >
                  <option value="">-- wybierz --</option>
                  {foremen.map((f) => (
                    <option key={f.id} value={f.id}>{f.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilosc *</label>
                <Input
                  type="number"
                  min="1"
                  max={transferModal.quantity}
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="transfer-qty-input"
                />
              </div>
              <p className="text-xs text-[#94A3B8]">
                Drugi brygadzista musi zaakceptowac przekazanie.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setTransferModal(null)}>Anuluj</Button>
                <Button
                  onClick={handleTransfer}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="confirm-transfer-btn"
                >
                  Wyslij
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Return Modal */}
      {returnModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
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
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilosc do zwrotu *</label>
                <Input
                  type="number"
                  min="1"
                  max={returnModal.quantity}
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="return-qty-input"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setReturnModal(null)}>Anuluj</Button>
                <Button
                  onClick={handleReturn}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="confirm-return-btn"
                >
                  Zwroc do magazynu
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Defect Modal */}
      {defectModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">Usterka: {defectModal.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setDefectModal(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Ilosc szt.</label>
                <Input
                  type="number"
                  min="1"
                  max={defectModal.quantity}
                  value={defectQty}
                  onChange={(e) => setDefectQty(e.target.value)}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="defect-qty-input"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Opis usterki</label>
                <textarea
                  value={defectDesc}
                  onChange={(e) => setDefectDesc(e.target.value)}
                  rows="3"
                  className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                  data-testid="defect-desc-input"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Zdjecie (opcjonalnie, max 2MB)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleDefectPhotoUpload}
                  className="text-xs text-[#CBD5E1]"
                  data-testid="defect-photo-input"
                />
                {defectPhoto && <img src={defectPhoto} alt="podglad" className="mt-2 max-h-24 rounded" />}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setDefectModal(null)}>Anuluj</Button>
                <Button
                  onClick={handleDefect}
                  className="bg-[#E8836A] hover:bg-[#C56A52] text-white"
                  data-testid="confirm-defect-btn"
                >
                  Zglos
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* My History Modal */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-2xl max-h-[80vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">Moja historia sprzetu</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setHistoryModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-3">
              {/* Transfers */}
              <div>
                <h4 className="text-[#5F7151] font-bold text-sm mb-2">Przekazania</h4>
                {historyData.transfers.length === 0 ? (
                  <p className="text-[#94A3B8] text-xs">Brak przekazan.</p>
                ) : (
                  <div className="space-y-1" data-testid="my-history-transfers">
                    {historyData.transfers.map((t) => {
                      const isOutgoing = t.from_foreman_name === historyData.foreman_name;
                      return (
                        <div key={t.id} className="text-xs p-2 bg-[#1E293B] rounded border border-[#334155]">
                          <span className={isOutgoing ? 'text-[#E8836A]' : 'text-[#5F7151]'}>
                            {isOutgoing ? '-> Wyslane do' : '<- Otrzymane od'}
                          </span>{' '}
                          <span className="text-[#CBD5E1] font-semibold">
                            {isOutgoing ? t.to_foreman_name : t.from_foreman_name}
                          </span>{' '}
                          <span className="text-[#94A3B8]">·</span>{' '}
                          <span className="text-[#CBD5E1]">{t.equipment_name} x {t.quantity}</span>{' '}
                          <span className="text-[#94A3B8]">·</span>{' '}
                          <span className={t.status === 'accepted' ? 'text-[#5F7151]' :
                                            t.status === 'rejected' ? 'text-[#E8836A]' :
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
                  <h4 className="text-[#5F7151] font-bold text-sm mb-2 mt-3">Zwroty i usterki</h4>
                  <div className="space-y-1">
                    {historyData.events.map((e) => (
                      <div key={e.id} className="text-xs p-2 bg-[#1E293B] rounded border border-[#334155]">
                        <span className="text-[#5F7151] font-semibold">
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
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-5xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-[#5F7151]" /> Caly magazyn — przeglad
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setWarehouseModal(false)} data-testid="close-warehouse-modal">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              {allEquipment.length === 0 ? (
                <p className="text-[#94A3B8] text-sm">Brak sprzetu.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" data-testid="warehouse-overview-table">
                    <thead className="sticky top-0 z-10 bg-[#2A384C]">
                      <tr className="bg-[#1E293B]">
                        <th className="border border-[#334155] p-2 text-left text-[#CBD5E1]">Nazwa</th>
                        <th className="border border-[#334155] p-2 text-left text-[#CBD5E1]">Marka</th>
                        <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Razem</th>
                        <th className="border border-[#334155] p-2 text-center text-[#E8836A]">Naprawa</th>
                        <th className="border border-[#334155] p-2 text-center text-[#5F7151]">Magazyn</th>
                        <th className="border border-[#334155] p-2 text-left text-[#CBD5E1]">Kto posiada</th>
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
                            <td className="border border-[#334155] p-2">
                              <div className="flex items-center gap-2">
                                {eq.photo ? (
                                  <img src={eq.photo} alt={eq.name} className="w-8 h-8 object-cover rounded shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-[#1E293B] flex items-center justify-center shrink-0">
                                    <Wrench className="h-4 w-4 text-[#475569]" />
                                  </div>
                                )}
                                <span className="text-[#CBD5E1] font-semibold">{eq.name}</span>
                              </div>
                            </td>
                            <td className="border border-[#334155] p-2 text-[#94A3B8]">{eq.brand || '-'}</td>
                            <td className="border border-[#334155] p-2 text-center text-[#CBD5E1] font-bold">{eq.total_quantity}</td>
                            <td className="border border-[#334155] p-2 text-center text-[#E8836A] font-bold">{eq.broken_quantity || 0}</td>
                            <td className={`border border-[#334155] p-2 text-center font-bold ${eq.available_quantity > 0 ? 'text-[#5F7151]' : 'text-[#E8836A]'}`}>
                              {eq.available_quantity}
                            </td>
                            <td className="border border-[#334155] p-2 text-[#94A3B8]">
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
                Magazynier widzi cale stany sprzetu i kto co posiada. Aby zarzadzac przypisaniami zwroc sie do administratora.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
