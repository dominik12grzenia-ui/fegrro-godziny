// FeGrro Service Worker - cache-busting strategy (safe on Safari/WebKit)
// - HTML/sw.js/manifest: ZAWSZE network (zero cache) - nowy deploy widoczny od razu
// - Hashowane bundle /static/*: cache-first (immutable z CRA)
// - Reszta: network-first, cache jako offline fallback
// IMPORTANT: respondWith MUSI zawsze dostac Response, nigdy null/undefined - inaczej Safari
// rzuca "FetchEvent.respondWith received an error: Returned response is null"
const SW_VERSION = 'fegrro-2026-02-12-02';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n !== SW_VERSION).map((n) => caches.delete(n))
    );
    await self.clients.claim();
    const clientsList = await self.clients.matchAll({ type: 'window' });
    clientsList.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Pomocnik: zawsze zwraca Response, nigdy null/undefined
async function safeFetch(req) {
  try {
    const resp = await fetch(req);
    if (resp) return resp;
  } catch (_e) { /* fallthrough */ }
  // Fallback: try cache
  const cached = await caches.match(req);
  if (cached) return cached;
  // Last resort - prosta odpowiedz 503 (NIGDY null)
  return new Response('Service unavailable', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_e) { return; }

  // Cross-origin: niech przegladarka sama sobie radzi
  if (url.origin !== self.location.origin) return;

  // 1) Nawigacja (HTML), sw.js i manifest -> NETWORK ONLY (no cache)
  const isNavigation = req.mode === 'navigate' || req.destination === 'document';
  const isServiceWorker = url.pathname === '/sw.js';
  const isManifest = url.pathname === '/manifest.json';
  if (isNavigation || isServiceWorker || isManifest) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req, { cache: 'no-store' });
        if (resp) return resp;
      } catch (_e) { /* offline */ }
      // Offline fallback - sprobuj z cache
      const cached = await caches.match(req);
      if (cached) return cached;
      return new Response(
        '<!DOCTYPE html><html><body><h1>Brak polaczenia</h1><p>Sprawdz internet i odswiez strone.</p></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    })());
    return;
  }

  // 2) Hashowane bundle (immutable z CRA: main.HASH.js) -> cache-first
  const isHashedAsset = /\/static\/(js|css|media)\//.test(url.pathname);
  if (isHashedAsset) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const resp = await safeFetch(req);
      if (resp && resp.ok && resp.status === 200) {
        try {
          const cache = await caches.open(SW_VERSION);
          cache.put(req, resp.clone());
        } catch (_e) { /* quota - ignore */ }
      }
      return resp;
    })());
    return;
  }

  // 3) Reszta (ikony, /api, /public/...) -> network-first, cache fallback
  event.respondWith((async () => {
    try {
      const resp = await fetch(req);
      if (resp && resp.ok && resp.status === 200 && !url.pathname.startsWith('/api/')) {
        try {
          const cache = await caches.open(SW_VERSION);
          cache.put(req, resp.clone());
        } catch (_e) { /* ignore */ }
      }
      if (resp) return resp;
    } catch (_e) { /* fallthrough */ }
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response('Service unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
