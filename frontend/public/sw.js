// FeGrro Service Worker - PASS-THROUGH ONLY (no fetch intercept)
//
// Po wczesniejszych problemach z cache/Safari zdecydowanie wycofujemy sie z aktywnego
// cachowania w Service Workerze. SW istnieje tylko po to zeby:
//   1) PWA mogla byc zainstalowana ("Add to Home Screen")
//   2) Stare wersje SW zostaly samoczynnie wyczyszczone u kazdego uzytkownika
//
// Brak fetch handlera == przegladarka idzie wprost do sieci. Vercel ustawia
// no-cache na index.html/sw.js/manifest, wiec kazdy deploy jest natychmiast widoczny.
const SW_VERSION = 'fegrro-passthrough-2026-02-12-03';

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
