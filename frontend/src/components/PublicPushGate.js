import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Bell, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Pelnoekranowa bramka push dla widokow publicznych (`/hours/:token`).
 * Wymaga akceptacji powiadomien przed kontynuacja.
 * Uzywa endpointow `/api/public/push/{token}/...`.
 */

function urlBase64ToUint8Array(base64String) {
  const clean = String(base64String).replace(/\s+/g, '');
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  if (out.length !== 65 || out[0] !== 0x04) {
    throw new Error(`Klucz VAPID nieprawidłowy (${out.length}b).`);
  }
  return out;
}

const isSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true);

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

export const PublicPushGate = ({ token, children }) => {
  const [checking, setChecking] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [vapidKey, setVapidKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(() => {
    try {
      const v = localStorage.getItem(`push_gate_dismissed_until_${token}`);
      return v ? parseInt(v, 10) : 0;
    } catch { return 0; }
  });

  const checkState = useCallback(async () => {
    if (!isSupported() || !token) {
      setChecking(false);
      return;
    }
    try {
      const res = await axios.get(`${API}/api/public/push/vapid-key`);
      setVapidKey(res.data.public_key);
    } catch { /* backend down */ }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setSubscribed(!!existing);
      setPermission(Notification.permission);
    } catch { /* ignore */ }
    setChecking(false);
  }, [token]);

  useEffect(() => { checkState(); }, [checkState]);

  const enable = async () => {
    if (!vapidKey) { toast.error('Brak konfiguracji VAPID'); return; }
    if (isIOS() && !isStandalone()) {
      toast.error(
        'iPhone: najpierw dodaj stronę do ekranu głównego (Udostępnij → Do ekranu początkowego), otwórz z ikony i kliknij ponownie.',
        { duration: 9000 }
      );
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('Pozwolenie odrzucone. Włącz powiadomienia w ustawieniach.');
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        try { await existing.unsubscribe(); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 200));
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      await axios.post(`${API}/api/public/push/${token}/subscribe`, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        user_agent: navigator.userAgent,
      });
      setSubscribed(true);
      toast.success('Powiadomienia włączone');
    } catch (err) {
      console.error('Public push enable failed', err);
      toast.error('Nie udało się włączyć powiadomień: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const dismiss24h = () => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try { localStorage.setItem(`push_gate_dismissed_until_${token}`, String(until)); } catch { /* ignore */ }
    setDismissedUntil(until);
  };

  const hasActiveSubscription = subscribed && permission === 'granted';
  const browserUnsupported = !isSupported();
  const notReady = checking || !vapidKey;
  const snoozed = dismissedUntil > Date.now();

  if (hasActiveSubscription || browserUnsupported || notReady || snoozed) {
    return children;
  }

  const denied = permission === 'denied';
  const iosNeedsInstall = isIOS() && !isStandalone();

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none select-none opacity-30">
        {children}
      </div>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#152033]/85 backdrop-blur-sm p-4"
        data-testid="public-push-permission-gate"
      >
        <div className="max-w-md w-full bg-[#1E2A44] border-2 border-[#D4AF37] rounded-xl shadow-2xl p-6 sm:p-8">
          <div className="flex items-start gap-3 mb-4">
            <div className="rounded-full bg-[#D4AF37]/20 p-3">
              <Bell className="h-7 w-7 text-[#D4AF37]" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-1">Włącz powiadomienia</h2>
              <p className="text-sm text-[#CBD5E1]">
                Aby otrzymywać informacje o statusie zamówień (BHP, odzież) musisz zezwolić na powiadomienia.
              </p>
            </div>
          </div>

          {denied && (
            <div className="bg-[#9B2C2C]/15 border border-[#9B2C2C]/40 rounded p-3 mb-4 text-xs text-[#FCA5A5] flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">Powiadomienia zablokowane w przeglądarce.</div>
                <div className="text-[#FCA5A5]/80">
                  Stuknij ikonkę kłódki w pasku adresu → <em>Powiadomienia</em> → <em>Zezwól</em>, następnie odśwież.
                </div>
              </div>
            </div>
          )}

          {iosNeedsInstall && (
            <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded p-3 mb-4 text-xs text-[#D4AF37]">
              <div className="font-semibold mb-1">iPhone — najpierw zainstaluj:</div>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Stuknij <em>Udostępnij</em> (kwadrat ze strzałką)</li>
                <li>Wybierz <em>Do ekranu początkowego</em></li>
                <li>Otwórz z ikony i kliknij <em>Włącz powiadomienia</em></li>
              </ol>
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={enable}
              disabled={busy || denied}
              className="w-full bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] font-bold h-11"
              data-testid="public-push-gate-enable-btn"
            >
              {busy ? 'Włączam...' : 'Włącz powiadomienia'}
            </Button>
            <button
              onClick={dismiss24h}
              className="w-full text-xs text-[#CBD5E1] hover:text-white py-2"
              data-testid="public-push-gate-dismiss-btn"
            >
              Przypomnij mi jutro
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default PublicPushGate;
