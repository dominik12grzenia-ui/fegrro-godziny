import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { ClipboardCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_LABELS = {
  electronics: 'Elektronarzedzia',
  accessories: 'Akcesoria',
  formwork: 'Szalunki',
};

/**
 * Blocking modal forcing the foreman to confirm each piece of assigned equipment
 * (per-item checkbox) before being able to use the rest of the app.
 *
 * Shows ALL active inventory checks for this foreman in sequence (one card each).
 */
export const InventoryCheckModal = ({ onAllConfirmed }) => {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmedItems, setConfirmedItems] = useState({}); // {check_id: Set(eq_id)}
  const [submitting, setSubmitting] = useState(false);

  const fetchChecks = useCallback(async () => {
    try {
      const r = await api.get('/equipment/inventory/active-for-me');
      setChecks(r.data || []);
    } catch (e) {
      // ignore
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

  const allChecked = (check) => {
    const set = confirmedItems[check.id] || new Set();
    return (check.equipment || []).every((eq) => set.has(eq.id));
  };

  const handleConfirm = async (check) => {
    if (!allChecked(check)) {
      toast.error('Zaznacz wszystkie pozycje, aby potwierdzic.');
      return;
    }
    setSubmitting(true);
    try {
      const ids = Array.from(confirmedItems[check.id] || []);
      await api.post(`/equipment/inventory/${check.id}/confirm`, {
        confirmed_equipment_ids: ids,
      });
      toast.success('Inwentaryzacja potwierdzona');
      // Refresh - if no more remain, parent unblocks
      const r = await api.get('/equipment/inventory/active-for-me');
      setChecks(r.data || []);
      if (!r.data || r.data.length === 0) {
        onAllConfirmed?.();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad potwierdzenia');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!checks || checks.length === 0) return null;

  // Show first active check (sequential)
  const check = checks[0];
  const items = check.equipment || [];
  const checkedSet = confirmedItems[check.id] || new Set();
  const checkedCount = items.filter((eq) => checkedSet.has(eq.id)).length;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      data-testid="inventory-check-modal"
    >
      <div className="bg-[#2A384C] border-2 border-[#E8B76A] rounded-lg shadow-2xl max-w-2xl w-full my-4">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#334155] flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-[#E8B76A] shrink-0" />
          <div className="flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              Wymagana inwentaryzacja: {CATEGORY_LABELS[check.category] || check.category}
            </h2>
            <p className="text-sm text-[#94A3B8] mt-1">
              Potwierdz, ze posiadasz kazdy z ponizszych elementow. Bez tego nie mozna edytowac godzin.
            </p>
            {checks.length > 1 && (
              <p className="text-xs text-[#E8B76A] mt-1">
                Pozostalo do wykonania: {checks.length} {checks.length === 1 ? 'inwentaryzacja' : 'inwentaryzacji'}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-[#94A3B8] mb-4">
                Nie masz przypisanego sprzetu w tej kategorii.
              </p>
              <Button
                onClick={() => handleConfirm(check)}
                disabled={submitting}
                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                data-testid="inventory-confirm-empty-btn"
              >
                Potwierdz brak sprzetu
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((eq) => {
                const isChecked = checkedSet.has(eq.id);
                return (
                  <label
                    key={eq.id}
                    htmlFor={`inv-item-${eq.id}`}
                    className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-[#5F7151]/20 border-[#5F7151]'
                        : 'bg-[#1E293B] border-[#334155] hover:border-[#5F7151]'
                    }`}
                    data-testid={`inventory-item-${eq.id}`}
                  >
                    <input
                      id={`inv-item-${eq.id}`}
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleItem(check.id, eq.id)}
                      className="h-5 w-5 accent-[#5F7151] cursor-pointer shrink-0"
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
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-white">{eq.assigned_quantity}</div>
                      <div className="text-xs text-[#94A3B8]">szt.</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
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
              {submitting ? 'Zapisywanie...' : 'Potwierdzam wszystko'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryCheckModal;
