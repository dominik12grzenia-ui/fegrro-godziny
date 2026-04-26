import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Wrench, Send, AlertTriangle, Bell, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

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

  const fetchAll = useCallback(async () => {
    try {
      const [myRes, forRes, ptRes, meRes] = await Promise.all([
        api.get('/equipment/my'),
        api.get('/foremen'),
        api.get('/equipment/transfers/pending'),
        api.get('/foreman/me').catch(() => ({ data: null })),
      ]);
      setMyEquipment(myRes.data);
      const me = meRes.data;
      setForemen((forRes.data || []).filter((f) => !me || f.id !== me.id));
      setPendingTransfers(ptRes.data);
    } catch (e) {
      // silent: foreman may not have any
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleTransfer = async () => {
    const qty = parseInt(transferQty, 10);
    if (!transferTo) {
      toast.error('Wybierz brygadziste');
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error('Podaj poprawna ilosc');
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
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error('Podaj poprawna ilosc');
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

  // Hide section entirely if user has nothing AND no pending transfers
  if (myEquipment.length === 0 && pendingTransfers.length === 0) {
    return (
      <Card className="bg-[#2A384C] border-[#334155]" data-testid="equipment-foreman-empty">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#5F7151]" /> Moj sprzet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[#94A3B8] text-sm">
            Nie masz przypisanego sprzetu. Skontaktuj sie z administratorem.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="equipment-foreman">
      {/* Pending transfer banners */}
      {pendingTransfers.map((t) => (
        <div
          key={t.id}
          className="p-3 bg-[#7F2D2D]/30 border-2 border-[#7F2D2D] rounded-lg flex flex-wrap items-center gap-3"
          data-testid={`pending-transfer-banner-${t.id}`}
        >
          <Bell className="h-6 w-6 text-[#FCA5A5] shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-[#FCA5A5] font-bold text-sm">
              {t.from_foreman_name} chce przekazac Ci{' '}
              <span className="text-white">{t.equipment_name}</span> x {t.quantity} szt.
            </p>
            <p className="text-[#94A3B8] text-xs">
              {new Date(t.created_at).toLocaleString('pl-PL')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleAccept(t.id)}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              data-testid={`accept-transfer-${t.id}`}
            >
              <Check className="h-4 w-4 mr-1" /> Akceptuj
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleReject(t.id)}
              className="text-[#FCA5A5] hover:bg-[#7F2D2D]"
              data-testid={`reject-transfer-${t.id}`}
            >
              <X className="h-4 w-4 mr-1" /> Odrzuc
            </Button>
          </div>
        </div>
      ))}

      {/* My equipment */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#5F7151]" /> Moj sprzet
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myEquipment.length === 0 ? (
            <p className="text-[#94A3B8] text-sm">Nie masz przypisanego sprzetu.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {myEquipment.map((eq) => (
                <Card key={eq.id} className="bg-[#1E293B] border-[#334155]" data-testid={`my-equipment-${eq.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex gap-3">
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
                        <p className="text-sm mt-1">
                          <span className="text-[#94A3B8]">Posiadasz: </span>
                          <span className="text-[#5F7151] font-bold">{eq.quantity} szt.</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() => {
                          setTransferModal(eq);
                          setTransferQty(String(Math.min(1, eq.quantity)));
                        }}
                        className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs flex-1"
                        data-testid={`transfer-btn-${eq.id}`}
                      >
                        <Send className="h-3 w-3 mr-1" /> Przekaz
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDefectModal(eq);
                          setDefectQty('1');
                        }}
                        className="text-[#E8836A] hover:bg-[#334155] text-xs flex-1"
                        data-testid={`defect-btn-${eq.id}`}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" /> Zglos usterke
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
                    <option key={f.id} value={f.id}>
                      {f.full_name}
                    </option>
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
                Drugi brygadzista musi zaakceptowac przekazanie. Admin zobaczy je w historii.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setTransferModal(null)}>
                  Anuluj
                </Button>
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
                  onChange={handleDefectPhotoUpload}
                  className="text-xs text-[#CBD5E1]"
                  data-testid="defect-photo-input"
                />
                {defectPhoto && <img src={defectPhoto} alt="podglad" className="mt-2 max-h-24 rounded" />}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setDefectModal(null)}>
                  Anuluj
                </Button>
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
    </div>
  );
};
