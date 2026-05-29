import React, { useEffect, useState } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';

/** Base64-URL → Uint8Array (required by PushManager.subscribe applicationServerKey).
 *  Validates that the result is a valid uncompressed P-256 point (65 bytes, 0x04 prefix).
 */
function urlBase64ToUint8Array(base64String) {
  // Strip whitespace/newlines just in case (env vars sometimes carry trailing \n)
  const clean = String(base64String).replace(/\s+/g, '');
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  if (out.length !== 65 || out[0] !== 0x04) {
    throw new Error(
      `Klucz VAPID nieprawidlowy: oczekiwano 65 bajtow z prefiksem 0x04, otrzymano ${out.length} bajtow (0x${(out[0]||0).toString(16)}).`
    );
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
    // iOS Safari PWA flag
    // eslint-disable-next-line no-undef
    window.navigator.standalone === true);

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

export const PushNotificationButton = ({ compact = false }) => {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vapidKey, setVapidKey] = useState(null);

  // Bootstrap: fetch public VAPID key + detect current subscription
  useEffect(() => {
    if (!isSupported()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/push/vapid-key');
        if (!cancelled) setVapidKey(res.data.public_key);
      } catch (_e) {
        /* backend unavailable - hide UI gracefully */
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!existing);
      } catch (_e) {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!isSupported() || !vapidKey) {
    return null;
  }

  // iOS Safari: push only works when installed as PWA (iOS 16.4+)
  const iosNeedsInstall = isIOS() && !isStandalone();

  const handleEnable = async () => {
    if (iosNeedsInstall) {
      toast.error(
        'Na iPhone najpierw dodaj aplikacje do ekranu głównego: udostepnij -> "Do ekranu poczatkowego". Potem otwórz aplikacje z ikony i klinij ponownie.',
        { duration: 8000 }
      );
      return;
    }
    setBusy(true);

    // Helper: full clean-slate subscribe. Always wipes any existing browser-level
    // subscription first so the user never has to clear Chrome settings manually
    // (the most common cause of "applicationServerKey must contain a valid P-256
    // public key" is a leftover subscription from an old VAPID key).
    const cleanSubscribe = async () => {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        try { await existing.unsubscribe(); } catch (_e) { /* ignore */ }
        // Give the browser a tick to release the old subscription internally.
        await new Promise((r) => setTimeout(r, 200));
      }
      const appKey = urlBase64ToUint8Array(vapidKey);
      return reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });
    };

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('Pozwolenie odrzucone. Włącz powiadomienia w ustawieniach przegladarki.');
        return;
      }
      // Try once; on failure (stale state, race, etc.) retry once after a delay.
      let sub;
      try {
        sub = await cleanSubscribe();
      } catch (firstErr) {
        console.warn('Push subscribe attempt 1 failed, retrying:', firstErr);
        await new Promise((r) => setTimeout(r, 500));
        sub = await cleanSubscribe();
      }
      const json = sub.toJSON();
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        user_agent: navigator.userAgent,
      });
      setSubscribed(true);
      toast.success('Powiadomienia wlaczone');
    } catch (err) {
      console.error('Push enable failed', err);
      toast.error('Nie udalo sie włączyć powiadomien: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await api.delete(`/push/unsubscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
        } catch (_e) { /* unsub even if backend missed */ }
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success('Powiadomienia wylaczone');
    } catch (err) {
      toast.error('Błąd: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    try {
      await api.post('/push/test');
      toast.success('Test wyslany - sprawdź baner powiadomien');
    } catch (err) {
      toast.error('Błąd testu: ' + (err.response?.data?.detail || err.message));
    }
  };

  if (subscribed && permission === 'granted') {
    if (compact) {
      return (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleTest}
          className="text-[#4F6343] hover:bg-[#4F6343]/20"
          data-testid="push-test-btn"
          title="Wyslij testowe powiadomienie"
        >
          <BellRing className="h-4 w-4" />
        </Button>
      );
    }
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          className="border-[#4F6343] text-[#5F7552]"
          data-testid="push-test-btn"
        >
          <BellRing className="h-4 w-4 mr-1" />
          Test powiadomien
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDisable}
          disabled={busy}
          className="text-[#DC4A3A]"
          data-testid="push-disable-btn"
        >
          <BellOff className="h-4 w-4 mr-1" />
          Wyłącz
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      onClick={handleEnable}
      disabled={busy}
      className={compact
        ? 'bg-[#D4AF37] hover:bg-[#B8941F] text-[#1E2A44] font-bold h-8'
        : 'bg-[#4F6343] hover:bg-[#3F5235] text-white'}
      data-testid="push-enable-btn"
    >
      <Bell className="h-4 w-4 mr-1" />
      {compact ? 'Włącz push' : 'Włącz powiadomienia push'}
    </Button>
  );
};

export default PushNotificationButton;
