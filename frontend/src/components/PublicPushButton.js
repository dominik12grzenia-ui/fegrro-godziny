import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';

const API = process.env.REACT_APP_BACKEND_URL;

/** Same helper as authed push button - validates P-256 key shape. */
function urlBase64ToUint8Array(base64String) {
  const clean = String(base64String).replace(/\s+/g, '');
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  if (out.length !== 65 || out[0] !== 0x04) {
    throw new Error(`Klucz VAPID nieprawidlowy (${out.length} bajtow)`);
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

/**
 * Public push enable button — used on /hours/{token} page so workers
 * (employees without JWT accounts) can receive notifications about
 * clothing order status using just their personal token.
 */
export const PublicPushButton = ({ token }) => {
  const [vapidKey, setVapidKey] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupported() || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/api/public/push/vapid-key`);
        if (!cancelled) setVapidKey(res.data.public_key);
      } catch (_e) { /* hide UI silently */ }
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!existing);
      } catch (_e) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (!isSupported() || !vapidKey) return null;
  const iosNeedsInstall = isIOS() && !isStandalone();

  const cleanSubscribe = async () => {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try { await existing.unsubscribe(); } catch (_e) { /* ignore */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  };

  const handleEnable = async () => {
    if (iosNeedsInstall) {
      toast.error(
        'Na iPhone najpierw dodaj strone do ekranu głównego (udostepnij -> "Do ekranu poczatkowego"), potem otwórz z ikony i sprobuj ponownie.',
        { duration: 8000 }
      );
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('Pozwolenie odrzucone');
        return;
      }
      let sub;
      try { sub = await cleanSubscribe(); }
      catch (_err) { await new Promise((r) => setTimeout(r, 500)); sub = await cleanSubscribe(); }
      const json = sub.toJSON();
      await axios.post(`${API}/api/public/push/${token}/subscribe`, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        user_agent: navigator.userAgent,
      });
      setSubscribed(true);
      toast.success('Powiadomienia wlaczone');
    } catch (err) {
      toast.error('Błąd: ' + (err.message || err));
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
          await axios.delete(`${API}/api/public/push/${token}/unsubscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
        } catch (_e) { /* ignore */ }
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
      await axios.post(`${API}/api/public/push/${token}/test`);
      toast.success('Test wyslany');
    } catch (err) {
      toast.error('Błąd: ' + (err.response?.data?.detail || err.message));
    }
  };

  if (subscribed) {
    return (
      <div className="flex gap-2 flex-wrap" data-testid="public-push-subscribed">
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          className="border-[#4F6343] text-[#5F7552] text-xs"
          data-testid="public-push-test"
        >
          <BellRing className="h-3.5 w-3.5 mr-1" /> Test
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDisable}
          disabled={busy}
          className="text-[#DC4A3A] text-xs"
          data-testid="public-push-disable"
        >
          <BellOff className="h-3.5 w-3.5 mr-1" /> Wyłącz powiadomienia
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      onClick={handleEnable}
      disabled={busy}
      className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#1E2A44] font-bold"
      data-testid="public-push-enable"
    >
      <Bell className="h-4 w-4 mr-1" />
      Włącz powiadomienia o moich zamowieniach
    </Button>
  );
};

export default PublicPushButton;
