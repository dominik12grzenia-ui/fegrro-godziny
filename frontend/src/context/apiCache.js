/**
 * Lightweight in-memory cache for API responses with stale-while-revalidate.
 *
 * Usage:
 *   const data = useCachedApi('/equipment/my?category=electronics', 10000);
 *
 * Returns instantly from cache (if any) and triggers a background refresh
 * if the cache is older than `ttlMs`. Subscribers re-render when the cache
 * updates.
 */
import { useEffect, useState } from 'react';
import { api } from './AuthContext';

const cache = new Map(); // key -> { data, ts, inflight: Promise|null }
const subscribers = new Map(); // key -> Set<setter>

function notify(key) {
  const subs = subscribers.get(key);
  if (!subs) return;
  const entry = cache.get(key);
  subs.forEach((setter) => setter(entry?.data));
}

async function refresh(key) {
  const entry = cache.get(key) || {};
  if (entry.inflight) return entry.inflight;
  const promise = api
    .get(key)
    .then((r) => {
      cache.set(key, { data: r.data, ts: Date.now(), inflight: null });
      notify(key);
      return r.data;
    })
    .catch((e) => {
      // Keep stale data on failure; clear inflight so retry is possible
      const cur = cache.get(key) || {};
      cache.set(key, { ...cur, inflight: null });
      throw e;
    });
  cache.set(key, { ...entry, inflight: promise });
  return promise;
}

export function useCachedApi(key, ttlMs = 10000, enabled = true) {
  const [data, setData] = useState(() => cache.get(key)?.data);

  useEffect(() => {
    if (!enabled || !key) return undefined;
    let subs = subscribers.get(key);
    if (!subs) {
      subs = new Set();
      subscribers.set(key, subs);
    }
    subs.add(setData);

    const entry = cache.get(key);
    setData(entry?.data); // sync to current cache when key changes
    if (!entry || Date.now() - entry.ts > ttlMs) {
      refresh(key).catch(() => { /* swallow - subscriber keeps stale */ });
    }

    return () => {
      subs.delete(setData);
      if (subs.size === 0) subscribers.delete(key);
    };
  }, [key, ttlMs, enabled]);

  return data;
}

/** Prefetch a key into cache (no return UI-binding). Useful for warming. */
export function prefetch(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < 60000) return Promise.resolve(entry.data);
  return refresh(key).catch(() => {});
}

/** Force-invalidate a cache entry (e.g. after a mutation).
 *  We MARK the entry as stale (ts=0) instead of deleting it so subscribers
 *  keep displaying the stale data while the background refresh is in-flight.
 *  This prevents a brief empty-state flicker after mutations.
 */
export function invalidateCache(key) {
  const entry = cache.get(key);
  if (entry) cache.set(key, { ...entry, ts: 0, inflight: null });
  else cache.delete(key);
}

/** Invalidate every key matching a prefix (e.g. '/equipment'). */
export function invalidateCachePrefix(prefix) {
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(prefix)) {
      const entry = cache.get(k);
      if (entry) cache.set(k, { ...entry, ts: 0, inflight: null });
    }
  }
}
