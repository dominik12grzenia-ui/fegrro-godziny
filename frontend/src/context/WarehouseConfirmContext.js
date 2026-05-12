/**
 * WarehouseConfirmContext
 *
 * Wraps any UI mounted under /magazynier so EVERY destructive backend call
 * (POST/PUT/DELETE that modifies stock or assigns equipment) is intercepted
 * by axios and forces a confirmation dialog before proceeding.
 *
 * Why: the warehouse keeper (magazynier) re-uses the existing admin UI
 * components (EquipmentAdmin, WarehouseAdmin, ClothingAdmin, BhpAdmin). We do
 * NOT want to fork those components just to add confirms - instead, we hook
 * the shared axios instance globally for the lifetime of the warehouse
 * dashboard.
 *
 * On unmount the interceptor is removed so it doesn't leak into admin UI.
 */
import React, { createContext, useState, useEffect, useCallback } from 'react';
import { api } from './AuthContext';
import { Button } from '../components/ui/button';

export const WarehouseConfirmContext = createContext({});

// URL patterns that should trigger a confirmation. Each entry: [regex, label].
// The order matters - first match wins.
const CONFIRM_PATTERNS = [
  [/\/equipment\/assign(\?|$)/, 'Przypisać sprzęt brygadziście?'],
  [/\/equipment\/orders\/[^/]+\/issue$/, 'Wydać sprzęt z tego zamówienia?'],
  [/\/equipment\/orders\/[^/]+\/reject$/, 'Odrzucić zamówienie sprzętu?'],
  [/\/equipment\/transfer$/, 'Przekazać sprzęt drugiemu brygadziście?'],
  [/\/equipment\/defects\/[^/]+\/resolve$/, 'Oznaczyć usterkę jako rozwiązaną?'],
  [/\/equipment\/return$/, 'Zwrócić sprzęt do magazynu?'],
  [/\/equipment\/returns\/[^/]+\/acknowledge$/, 'Potwierdzić zwrot sprzętu?'],
  [/\/warehouse\/orders\/[^/]+\/items\/[^/]+\/issue$/, 'Wydać tę pozycję z magazynu?'],
  [/\/warehouse\/orders\/[^/]+\/status$/, 'Zmienić status zamówienia materiałów?'],
  [/\/warehouse\/orders\/[^/]+\/items\/[^/]+$/, 'Usunąć tę pozycję z zamówienia?'],
  [/\/warehouse\/materials\/[^/]+\/stock$/, 'Zaktualizować stan magazynowy?'],
  [/\/clothing\/orders\/[^/]+\/issue$/, 'Oznaczyć ubranie jako wydane?'],
  [/\/clothing\/orders\/[^/]+\/forward$/, 'Oznaczyć jako przekazane do realizacji?'],
  [/\/bhp\/issuances$/, 'Wydać artykuł BHP pracownikowi?'],
];

const needsConfirm = (config) => {
  const method = (config.method || 'get').toLowerCase();
  if (!['post', 'put', 'patch', 'delete'].includes(method)) return null;
  const url = config.url || '';
  for (const [pattern, label] of CONFIRM_PATTERNS) {
    if (pattern.test(url)) return label;
  }
  return null;
};

export const WarehouseConfirmProvider = ({ children }) => {
  const [pending, setPending] = useState(null); // { label, resolve, reject }

  const ask = useCallback((label) => {
    return new Promise((resolve, reject) => {
      setPending({ label, resolve, reject });
    });
  }, []);

  const confirm = () => {
    if (pending) {
      pending.resolve(true);
      setPending(null);
    }
  };

  const cancel = () => {
    if (pending) {
      pending.reject(new Error('cancelled-by-user'));
      setPending(null);
    }
  };

  useEffect(() => {
    // Install axios request interceptor on the shared api instance.
    const id = api.interceptors.request.use(async (config) => {
      const label = needsConfirm(config);
      if (!label) return config;
      // If the calling code already passed `__warehouseConfirmed: true`
      // (used for batched / chained calls), don't ask twice.
      if (config.__warehouseConfirmed) return config;
      try {
        await ask(label);
        config.__warehouseConfirmed = true;
        return config;
      } catch (_e) {
        // User cancelled - throw axios-cancel-like error so .catch fires
        const err = new Error('Anulowano przez uzytkownika');
        err.code = 'ERR_WAREHOUSE_CANCELLED';
        throw err;
      }
    });
    return () => { api.interceptors.request.eject(id); };
  }, [ask]);

  return (
    <WarehouseConfirmContext.Provider value={{ ask }}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"
          data-testid="warehouse-confirm-modal"
        >
          <div className="bg-[#1E293B] border-2 border-[#E8B76A] rounded-lg shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-[#E8B76A] text-lg font-bold mb-2">Potwierdź operację</h3>
            <p className="text-[#CBD5E1] mb-6">{pending.label}</p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={cancel}
                className="text-[#CBD5E1] hover:bg-[#334155]"
                data-testid="warehouse-confirm-cancel"
              >
                Anuluj
              </Button>
              <Button
                onClick={confirm}
                className="bg-[#E8B76A] hover:bg-[#C79B58] text-[#1E293B] font-bold"
                data-testid="warehouse-confirm-yes"
              >
                Tak, kontynuuj
              </Button>
            </div>
          </div>
        </div>
      )}
    </WarehouseConfirmContext.Provider>
  );
};
