// FeGrro Service Worker - PASS-THROUGH ONLY (no fetch intercept)
//
// Po wczesniejszych problemach z cache/Safari zdecydowanie wycofujemy sie z aktywnego
// cachowania w Service Workerze. SW istnieje tylko po to zeby:
//   1) PWA mogla byc zainstalowana ("Add to Home Screen")
//   2) Stare wersje SW zostaly samoczynnie wyczyszczone u kazdego uzytkownika
//
// Brak fetch handlera == przegladarka idzie wprost do sieci. Vercel ustawia
// no-cache na index.html/sw.js/manifest, wiec kazdy deploy jest natychmiast widoczny.
const SW_VERSION = 'fegrro-push-2026-02-13-01';

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
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      try {
        if ('focus' in c) {
          await c.focus();
          if (c.url !== targetUrl && 'navigate' in c) {
            try { await c.navigate(targetUrl); } catch (_e) { /* cross-origin etc. */ }
          }
          return;
        }
      } catch (_e) { /* ignore */ }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
