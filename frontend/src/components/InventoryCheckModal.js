import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ClipboardCheck, AlertTriangle, AlertCircle, Camera, X } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_LABELS = {
  electronics: 'Elektronarzędzia',
  accessories: 'Akcesoria',
  formwork: 'Szalunki',
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Blocking modal forcing the foreman to confirm each piece of assigned equipment
 * (per-item checkbox) OR report a shortage ("Brak / Mam mniej") before being
 * able to use the rest of the app.
 */
export const InventoryCheckModal = ({ onAllConfirmed }) => {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmedItems, setConfirmedItems] = useState({}); // {check_id: Set(eq_id)}
  const [reportedItems, setReportedItems] = useState({}); // {check_id: Set(eq_id)}  - already shortage-reported
  const [submitting, setSubmitting] = useState(false);
  const [shortageModal, setShortageModal] = useState(null); // {check_id, equipment}
  const [shortageQty, setShortageQty] = useState('');
  const [shortageDesc, setShortageDesc] = useState('');
  const [shortagePhoto, setShortagePhoto] = useState(null);
  const [shortageSubmitting, setShortageSubmitting] = useState(false);

  const fetchChecks = useCallback(async () => {
    try {
      const r = await api.get('/equipment/inventory/active-for-me');
      setChecks(r.data || []);
    } catch (e) {
      const status = e?.response?.status;
      if (status && status !== 404) {
        toast.error('Nie udalo sie pobrać inwentaryzacji');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChecks();
  }, [fetchChecks]);

  const toggleItem = (checkId, eqId) => {
    setConfirmedItems((prev) => {
      const set = new Set(prev[checkId] || []);
      if (set.has(eqId)) set.delete(eqId);
      else set.add(eqId);
      return { ...prev, [checkId]: set };
    });
  };

  const isItemMarked = (checkId, eqId) => {
    const conf = confirmedItems[checkId] || new Set();
    const rep = reportedItems[checkId] || new Set();
    return conf.has(eqId) || rep.has(eqId);
  };

  const allMarked = (check) => {
    return (check.equipment || []).every((eq) => isItemMarked(check.id, eq.id));
  };

  const markedCount = (check) =>
    (check.equipment || []).filter((eq) => isItemMarked(check.id, eq.id)).length;

  const openShortage = (checkId, equipment) => {
    setShortageModal({ check_id: checkId, equipment });
    // Default reported qty = expected - 1 (foreman likely reporting "I have one less")
    const expected = equipment.assigned_quantity || 0;
    setShortageQty(String(Math.max(0, expected - 1)));
    setShortageDesc('');
    setShortagePhoto(null);
  };

  const closeShortage = () => {
    setShortageModal(null);
    setShortageQty('');
    setShortageDesc('');
    setShortagePhoto(null);
  };

  const handleShortagePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Maks 2MB');
      return;
    }
    const b64 = await fileToBase64(file);
    setShortagePhoto(b64);
  };

  const submitShortage = async () => {
    if (!shortageModal) return;
    const qty = parseInt(shortageQty, 10);
    if (Number.isNaN(qty) || qty < 0) {
      toast.error('Podaj prawidlowa ilość');
      return;
    }
    const expected = shortageModal.equipment.assigned_quantity || 0;
    if (qty > expected) {
      toast.error('Ilość nie moze być większa niz przypisana');
      return;
    }
    if (qty === expected) {
      toast.error('Jesli masz pełna ilość, zaznacz checkbox potwierdzenia');
      return;
    }
    setShortageSubmitting(true);
    try {
      await api.post(`/equipment/inventory/${shortageModal.check_id}/report-shortage`, {
        equipment_id: shortageModal.equipment.id,
        reported_quantity: qty,
        description: shortageDesc || null,
        photo: shortagePhoto,
      });
      toast.success('Zgloszenie wyslane do admina');
      // Mark item as reported (locally) so the foreman can finalize confirmation.
      setReportedItems((prev) => {
        const set = new Set(prev[shortageModal.check_id] || []);
        set.add(shortageModal.equipment.id);
        return { ...prev, [shortageModal.check_id]: set };
      });
      closeShortage();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd zgloszenia');
    } finally {
      setShortageSubmitting(false);
    }
  };

  const handleConfirm = async (check) => {
    if (!allMarked(check)) {
      toast.error('Zaznacz wszystkie pozycje (potwierdź lub zglos brak).');
      return;
    }
    setSubmitting(true);
    try {
      const ids = Array.from(confirmedItems[check.id] || []);
      await api.post(`/equipment/inventory/${check.id}/confirm`, {
        confirmed_equipment_ids: ids,
      });
      toast.success('Inwentaryzacja zakonczona');
      const r = await api.get('/equipment/inventory/active-for-me');
      setChecks(r.data || []);
      if (!r.data || r.data.length === 0) {
        onAllConfirmed?.();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd potwierdzenia');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!checks || checks.length === 0) return null;

  const check = checks[0];
  const items = check.equipment || [];
  const checkedCount = markedCount(check);

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        data-testid="inventory-check-modal"
      >
        <div className="bg-[#2A384C] border-2 border-[#E8B76A] rounded-lg shadow-2xl max-w-2xl w-full my-4">
          <div className="px-5 py-4 border-b border-[#334155] flex items-center gap-3">
            <AlertTriangle className="h-7 w-7 text-[#E8B76A] shrink-0" />
            <div className="flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-white">
                Wymagana inwentaryzacja: {CATEGORY_LABELS[check.category] || check.category}
              </h2>
              <p className="text-sm text-[#94A3B8] mt-1">
                Zaznacz checkbox jesli posiadasz dany sprzęt, lub kliknij <b className="text-[#E8B76A]">Brak / Mam mniej</b> aby zglosic niezgodność.
              </p>
              {checks.length > 1 && (
                <p className="text-xs text-[#E8B76A] mt-1">
                  Pozostalo do wykonania: {checks.length} {checks.length === 1 ? 'inwentaryzacja' : 'inwentaryzacji'}
                </p>
              )}
            </div>
          </div>

          <div className="p-5 max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-[#94A3B8] mb-4">
                  Nie masz przypisanego sprzętu w tej kategorii.
                </p>
                <Button
                  onClick={() => handleConfirm(check)}
                  disabled={submitting}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="inventory-confirm-empty-btn"
                >
                  Potwierdź brak sprzętu
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((eq) => {
                  const conf = (confirmedItems[check.id] || new Set()).has(eq.id);
                  const rep = (reportedItems[check.id] || new Set()).has(eq.id);
                  return (
                    <div
                      key={eq.id}
                      className={`flex items-center gap-3 p-3 rounded border transition-colors ${
                        conf
                          ? 'bg-[#5F7151]/20 border-[#5F7151]'
                          : rep
                          ? 'bg-[#E8B76A]/10 border-[#E8B76A]'
                          : 'bg-[#1E293B] border-[#334155]'
                      }`}
                      data-testid={`inventory-item-${eq.id}`}
                    >
                      <input
                        id={`inv-item-${eq.id}`}
                        type="checkbox"
                        checked={conf}
                        disabled={rep}
                        onChange={() => toggleItem(check.id, eq.id)}
                        className="h-5 w-5 accent-[#5F7151] cursor-pointer shrink-0 disabled:opacity-50"
                        data-testid={`inventory-checkbox-${eq.id}`}
                      />
                      {eq.photo ? (
                        <img
                          src={eq.photo}
                          alt={eq.name}
                          className="h-12 w-12 rounded object-cover shrink-0 border border-[#334155]"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-[#334155] flex items-center justify-center shrink-0">
                          <ClipboardCheck className="h-5 w-5 text-[#94A3B8]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[#CBD5E1] font-semibold truncate">{eq.name}</div>
                        {eq.brand && (
                          <div className="text-xs text-[#94A3B8] truncate">{eq.brand}</div>
                        )}
                        {rep && (
                          <div className="text-xs text-[#E8B76A] mt-0.5">
                            ✓ Zgloszono niezgodność - czeka na admina
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold text-white">{eq.assigned_quantity}</div>
                        <div className="text-xs text-[#94A3B8]">szt.</div>
                      </div>
                      {!rep && !conf && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openShortage(check.id, eq)}
                          className="bg-transparent border-[#E8B76A] text-[#E8B76A] hover:bg-[#E8B76A]/20 shrink-0"
                          data-testid={`inventory-shortage-btn-${eq.id}`}
                        >
                          <AlertCircle className="h-4 w-4 mr-1" /> Brak
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="px-5 py-4 border-t border-[#334155] flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-[#94A3B8]" data-testid="inventory-progress">
                Zaznaczono: <span className="text-white font-bold">{checkedCount}</span> / {items.length}
              </div>
              <Button
                onClick={() => handleConfirm(check)}
                disabled={submitting || checkedCount !== items.length}
                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="inventory-confirm-btn"
              >
                {submitting ? 'Zapisywanie...' : 'Zakoncz inwentaryzacje'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Shortage report modal */}
      {shortageModal && (
        <div
          className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="shortage-modal"
        >
          <div className="bg-[#2A384C] border-2 border-[#E8B76A] rounded-lg shadow-2xl max-w-md w-full">
            <div className="px-5 py-4 border-b border-[#334155] flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-[#E8B76A]" />
                Zglos niezgodność
              </h3>
              <button
                onClick={closeShortage}
                className="text-[#94A3B8] hover:text-white"
                data-testid="shortage-close-btn"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-sm text-[#94A3B8]">Sprzęt</div>
                <div className="text-[#CBD5E1] font-semibold">{shortageModal.equipment.name}</div>
                {shortageModal.equipment.brand && (
                  <div className="text-xs text-[#94A3B8]">{shortageModal.equipment.brand}</div>
                )}
                <div className="text-xs text-[#94A3B8] mt-1">
                  Przypisana ilość: <b className="text-white">{shortageModal.equipment.assigned_quantity}</b> szt.
                </div>
              </div>
              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">
                  Aktualnie posiadana ilość
                </label>
                <Input
                  type="number"
                  min="0"
                  max={shortageModal.equipment.assigned_quantity}
                  value={shortageQty}
                  onChange={(e) => setShortageQty(e.target.value)}
                  className="bg-[#1E293B] border-[#334155] text-white"
                  data-testid="shortage-qty-input"
                />
                <p className="text-xs text-[#94A3B8] mt-1">
                  Wpisz 0 jesli nic nie masz, lub mniej niz {shortageModal.equipment.assigned_quantity}.
                </p>
              </div>
              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">Opis (opcjonalnie)</label>
                <textarea
                  value={shortageDesc}
                  onChange={(e) => setShortageDesc(e.target.value)}
                  rows="3"
                  placeholder="np. zaginal na budowie X, oddany pracownikowi..."
                  className="w-full bg-[#1E293B] border border-[#334155] text-white rounded px-3 py-2 text-sm"
                  data-testid="shortage-desc-input"
                />
              </div>
              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">Zdjecie (opcjonalnie)</label>
                <label
                  htmlFor="shortage-photo-input"
                  className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-[#1E293B] border border-[#334155] rounded text-sm text-[#CBD5E1] hover:border-[#5F7151] w-fit"
                >
                  <Camera className="h-4 w-4" />
                  {shortagePhoto ? 'Zmien zdjecie' : 'Dodaj zdjecie'}
                </label>
                <input
                  id="shortage-photo-input"
                  type="file"
                  accept="image/*"
                  onChange={handleShortagePhoto}
                  className="hidden"
                  data-testid="shortage-photo-input"
                />
                {shortagePhoto && (
                  <img
                    src={shortagePhoto}
                    alt="preview"
                    className="mt-2 h-24 rounded border border-[#334155]"
                  />
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[#334155] flex items-center justify-end gap-2">
              <Button
                onClick={closeShortage}
                variant="ghost"
                className="text-[#94A3B8] hover:bg-[#334155]"
                data-testid="shortage-cancel-btn"
              >
                Anuluj
              </Button>
              <Button
                onClick={submitShortage}
                disabled={shortageSubmitting}
                className="bg-[#E8B76A] hover:bg-[#D4A055] text-[#1E293B] font-semibold"
                data-testid="shortage-submit-btn"
              >
                {shortageSubmitting ? 'Wysylanie...' : 'Wyslij zgloszenie'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InventoryCheckModal;
