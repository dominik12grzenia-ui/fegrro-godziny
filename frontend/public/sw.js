// FeGrro Service Worker - PASS-THROUGH ONLY (no fetch intercept)
//
// Po wczesniejszych problemach z cache/Safari zdecydowanie wycofujemy sie z aktywnego
// cachowania w Service Workerze. SW istnieje tylko po to zeby:
//   1) PWA mogla byc zainstalowana ("Add to Home Screen")
//   2) Stare wersje SW zostaly samoczynnie wyczyszczone u kazdego uzytkownika
//
// Brak fetch handlera == przegladarka idzie wprost do sieci. Vercel ustawia
// no-cache na index.html/sw.js/manifest, wiec kazdy deploy jest natychmiast widoczny.
const SW_VERSION = 'fegrro-wyceny-2026-02-26-iter95n';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Wyczysc WSZYSTKIE stare cache (ze starych wersji SW)
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (_e) { /* ignore */ }
    await self.clients.claim();
    // Powiadom otwarte karty zeby sie samoczynnie odswiezyly raz
    try {
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((client) => client.postMessage({ type: 'SW_RELOAD' }));
    } catch (_e) { /* ignore */ }
  })());
});

// CELOWO BRAK fetch handlera. Brak addEventListener('fetch', ...).
// Dzieki temu przegladarka NIGDY nie wywola event.respondWith przez ten SW
// i nie ma mozliwosci zwrocic null/undefined => zaden taki blad jak na Safari.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// --- Push notifications -----------------------------------------------------
// FeGrro PWA: handle push from backend (VAPID + pywebpush) and display
// a system notification. Click → focuses an existing tab or opens one.
self.addEventListener('push', (event) => {
  let data = { title: 'FeGrro', body: 'Masz nowe powiadomienie', url: '/', tag: 'fegrro' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    tag: data.tag || 'fegrro',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: { url: data.url || '/' },
    requireInteraction: !!data.requireInteraction,
    vibrate: [120, 60, 120],
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title || 'FeGrro', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Build a fully-qualified target URL on this origin so navigation is reliable
  // across PWA/standalone modes (Safari iOS in particular).
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 1) Find any open tab on our origin and tell it to navigate via postMessage.
    //    This is more reliable than client.navigate() in iOS Safari and Chrome
    //    standalone PWAs where navigate() silently fails.
    for (const c of allClients) {
      try {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          c.postMessage({ type: 'NAVIGATE', url: rawUrl });
          return;
        }
      } catch (_e) { /* ignore */ }
    }
    // 2) Fallback: open a brand-new tab on the target URL.
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
