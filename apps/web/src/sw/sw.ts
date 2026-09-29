import { classify, handle, precache, CACHE_DATA, CACHE_SHELL, CACHE_TILES } from "./policy";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ev = Event & { waitUntil(p: Promise<unknown>): void; respondWith(r: Promise<Response>): void; request: Request };
const sw = self as any;
const KEEP = [CACHE_DATA, CACHE_TILES, CACHE_SHELL];

sw.addEventListener("install", (e: Ev) => {
  // Precache the shell so an installed app starts offline; never block activation on it.
  e.waitUntil(precache(sw.location.origin, { fetch: (q) => fetch(q), open: (n) => caches.open(n) }).catch(() => 0).then(() => sw.skipWaiting()));
});
sw.addEventListener("activate", (e: Ev) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith("parcela-") || k.startsWith("ikataster-")) && !KEEP.includes(k)) await caches.delete(k);
    await sw.clients.claim();
  })());
});
sw.addEventListener("fetch", (e: Ev) => {
  const r = e.request;
  const route = classify(r.url, r.method, r.mode, sw.location.origin);
  if (!route) return;
  e.respondWith(handle(route, r, { fetch: (q) => fetch(q), open: (n) => caches.open(n), now: () => Date.now(), waitUntil: (p) => e.waitUntil(p) }));
});
