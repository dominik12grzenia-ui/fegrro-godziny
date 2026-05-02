// FeGrro Service Worker - cache-busting strategy
// - Nigdy nie cachuje HTML ani siebie => zmiany na produkcji sa widoczne natychmiast
// - Cache-first dla hashowanych bundli (static/js, static/css, static/media) - sa immutable z createra
// - Przy nowym deployu: bump SW_VERSION, stare cache beda usuniete w 'activate'
const SW_VERSION = 'fegrro-2026-02-12-01';

self.addEventListener('install', () => {
  // Aktywuj nowy SW natychmiast, nie czekaj na zamkniecie kart
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Usun wszystkie stare cache (rozne wersje SW)
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n !== SW_VERSION).map((n) => caches.delete(n))
    );
    // Przejmij kontrole nad otwartymi kartami
    await self.clients.claim();
    // Powiadom wszystkie karty ze jest nowa wersja -> przeladuj
    const clientsList = await self.clients.matchAll({ type: 'window' });
    clientsList.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
  })());
});

// Obsluga komunikatu z frontendu: natychmiastowa aktywacja przy nowej wersji
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Pomin zewnetrzne domeny (fonty google, logo fegrro itd.) - przegladarka radzi sobie sama
  if (url.origin !== self.location.origin) return;

  // 1) Nawigacja (HTML) + sam sw.js + manifest => NETWORK ONLY (zero cache)
  //    Gwarantuje: nowy deploy na Vercelu widoczny od razu przy odswiezeniu
  const isNavigation = req.mode === 'navigate' || req.destination === 'document';
  const isServiceWorker = url.pathname === '/sw.js';
  const isManifest = url.pathname === '/manifest.json';
  if (isNavigation || isServiceWorker || isManifest) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))
    );
    return;
  }

  // 2) Hashowane bundle (CRA nadaje hash: main.abc123.js, 123.chunk.css) => cache-first (immutable)
  const isHashedAsset = /\/static\/(js|css|media)\//.test(url.pathname);
  if (isHashedAsset) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const resp = await fetch(req);
      if (resp && resp.status === 200) {
        const cache = await caches.open(SW_VERSION);
        cache.put(req, resp.clone());
      }
      return resp;
    })());
    return;
  }

  // 3) Reszta (ikony, obrazy /public, /api) => network-first, cache jako fallback offline
  event.respondWith((async () => {
    try {
      const resp = await fetch(req);
      // Cachuj tylko pliki statyczne, nie odpowiedzi API
      if (resp && resp.status === 200 && !url.pathname.startsWith('/api/')) {
        const cache = await caches.open(SW_VERSION);
        cache.put(req, resp.clone());
      }
      return resp;
    } catch (_e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw _e;
    }
  })());
});
