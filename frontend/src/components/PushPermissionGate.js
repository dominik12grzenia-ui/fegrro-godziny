import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Bell, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Baner blokujacy strone gdy uzytkownik nie ma jeszcze wlaczonych powiadomien push.
 * Pojawia sie nad cala zawartoscia i wymaga akceptacji aby kontynuowac.
 *
 * Logika:
 *  - Sprawdza Notification.permission + aktywna subskrypcje serviceWorker.
 *  - Jezeli permission='denied' → pokazuje instrukcje jak wlaczyc w ustawieniach.
 *  - Jezeli brak subskrypcji → pokazuje przycisk "Wlacz powiadomienia".
 *  - Po sukcesie → znika i odblokowuje strone.
 *  - Mozliwosc odlozenia na 24h (sessionStorage `push_gate_dismissed_until`).
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

export const PushPermissionGate = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [vapidKey, setVapidKey] = useState(null);
  const [busy, setBusy] = useState(false);
  // Dismissed (snooze 24h) - keyed in localStorage so nie pyta co restart
  const [dismissedUntil, setDismissedUntil] = useState(() => {
    try {
      const v = localStorage.getItem('push_gate_dismissed_until');
      return v ? parseInt(v, 10) : 0;
    } catch { return 0; }
  });

  const checkState = useCallback(async () => {
    if (!isSupported()) {
      setChecking(false);
      return;
    }
    try {
      // VAPID key (do subskrypcji)
      const res = await api.get('/push/vapid-key');
      setVapidKey(res.data.public_key);
    } catch { /* backend down → hide gate gracefully */ }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setSubscribed(!!existing);
      setPermission(Notification.permission);
    } catch { /* ignore */ }
    setChecking(false);
  }, []);

  useEffect(() => { checkState(); }, [checkState]);

  const enable = async () => {
    if (!vapidKey) {
      toast.error('Brak konfiguracji VAPID. Skontaktuj sie z administratorem.');
      return;
    }
    if (isIOS() && !isStandalone()) {
      toast.error(
        'iPhone: najpierw dodaj aplikację do ekranu głównego (Udostępnij → Do ekranu początkowego), otwórz z ikony i kliknij ponownie.',
        { duration: 9000 }
      );
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('Pozwolenie odrzucone. Otwórz ustawienia przeglądarki i zezwól na powiadomienia.');
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Clean-slate: usun stara subskrypcje (czesta przyczyna bledow VAPID)
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
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        user_agent: navigator.userAgent,
      });
      setSubscribed(true);
      toast.success('Powiadomienia włączone');
    } catch (err) {
      console.error('Push enable failed', err);
      toast.error('Nie udało się włączyć powiadomień: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const dismiss24h = () => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try { localStorage.setItem('push_gate_dismissed_until', String(until)); } catch { /* ignore */ }
    setDismissedUntil(until);
  };

  // Warunki kiedy NIE pokazujemy bramki (czyli renderujemy children normalnie)
  const hasActiveSubscription = subscribed && permission === 'granted';
  const browserUnsupported = !isSupported();
  const notReady = checking || !vapidKey;
  const snoozed = dismissedUntil > Date.now();

  if (hasActiveSubscription || browserUnsupported || notReady || snoozed) {
    return children;
  }

  // ===== Baner blokujacy =====
  const denied = permission === 'denied';
  const iosNeedsInstall = isIOS() && !isStandalone();

  return (
    <>
      {/* Renderujemy zawartosc pod baner, ale z blokada interakcji */}
      <div aria-hidden="true" className="pointer-events-none select-none opacity-30">
        {children}
      </div>
      {/* Pelnoekranowy baner */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#152033]/85 backdrop-blur-sm p-4"
        data-testid="push-permission-gate"
      >
        <div className="max-w-md w-full bg-[#1E2A44] border-2 border-[#D4AF37] rounded-xl shadow-2xl p-6 sm:p-8">
          <div className="flex items-start gap-3 mb-4">
            <div className="rounded-full bg-[#D4AF37]/20 p-3">
              <Bell className="h-7 w-7 text-[#D4AF37]" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-1">
                Włącz powiadomienia
              </h2>
              <p className="text-sm text-[#CBD5E1]">
                Aby otrzymywać informacje o zwrotach sprzętu, przekazaniach
                i zamówieniach materiału, musisz zezwolić na powiadomienia.
              </p>
            </div>
          </div>

          {denied && (
            <div className="bg-[#9B2C2C]/15 border border-[#9B2C2C]/40 rounded p-3 mb-4 text-xs text-[#FCA5A5] flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">Powiadomienia są zablokowane w przeglądarce.</div>
                <div className="text-[#FCA5A5]/80">
                  Otwórz ustawienia strony (ikonka kłódki w pasku adresu) → <em>Powiadomienia</em> → ustaw na <em>Zezwól</em>, następnie odśwież stronę.
                </div>
              </div>
            </div>
          )}

          {iosNeedsInstall && (
            <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded p-3 mb-4 text-xs text-[#D4AF37]">
              <div className="font-semibold mb-1">iPhone — najpierw zainstaluj aplikację:</div>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Stuknij przycisk <em>Udostępnij</em> (kwadrat ze strzałką w górę)</li>
                <li>Wybierz <em>Do ekranu początkowego</em></li>
                <li>Otwórz aplikację z ikony na pulpicie</li>
                <li>Wróć tutaj i kliknij <em>Włącz powiadomienia</em></li>
              </ol>
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={enable}
              disabled={busy || denied}
              className="w-full bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] font-bold h-11"
              data-testid="push-gate-enable-btn"
            >
              {busy ? 'Włączam...' : 'Włącz powiadomienia'}
            </Button>
            <button
              onClick={dismiss24h}
              className="w-full text-xs text-[#CBD5E1] hover:text-white py-2"
              data-testid="push-gate-dismiss-btn"
            >
              Przypomnij mi jutro
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default PushPermissionGate;
