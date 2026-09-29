/**
 * Service worker cache policy (pure, testable with fake Cache/fetch).
 * - GURS JSON (WFS, jv-api): network first; on network error / 5xx / OGC XML error → cached copy marked with X-Ikataster-Cached.
 * - GURS WMS tiles: network first, cache fallback (separate, larger cap).
 * - Orthophoto tiles: cache first (photos change every year or two), re-checked after 30 days;
 *   own cache so browsing builds up the user's often-visited areas (~50 KB/tile, 4000 tiles ≈ 200 MB).
 * - App shell: /assets/* cache first (immutable hashed); navigations network first, fallback to cached index.html.
 * Every successful network response refreshes the cache, so fresh data replaces old data as soon as GURS is back.
 */
export const CACHE_DATA = "ikataster-gurs-data-v1";
export const CACHE_TILES = "ikataster-gurs-tiles-v1";
export const CACHE_SHELL = "ikataster-shell-v1";
export const CACHE_ORTHO = "ikataster-ortho-v1";
export const ORTHO_TTL_MS = 30 * 24 * 3600_000;
/** Trimming lists all keys: do it every N stores, not on each. */
export const ORTHO_TRIM_EVERY = 50;
export const CACHED_HEADER = "X-Ikataster-Cached";
export const STORED_HEADER = "X-Ikataster-Stored";
export const LIMITS: Record<string, number> = { [CACHE_DATA]: 2000, [CACHE_TILES]: 3000, [CACHE_SHELL]: 200, [CACHE_ORTHO]: 4000 };

export type Route = "data" | "tiles" | "ortho" | "asset" | "navigate" | null;

export function classify(url: string, method: string, mode: string, origin: string): Route {
  if (method !== "GET") return null;
  const u = new URL(url);
  if (u.host === "ipi.eprostor.gov.si") {
    if (/\/wfs-si-/.test(u.pathname) || /\/jv-api\//.test(u.pathname)) return "data";
    if (/\/wms-si-gurs-dts\//.test(u.pathname)) return "ortho";
    if (/\/wms-si-/.test(u.pathname)) return "tiles";
    return null;
  }
  if (u.origin !== origin) return null;
  if (mode === "navigate") return "navigate";
  if (u.pathname.startsWith("/assets/")) return "asset";
  return null;
}

export interface Deps {
  fetch: (req: Request) => Promise<Response>;
  open: (name: string) => Promise<Cache>;
  now: () => number;
  waitUntil?: (p: Promise<unknown>) => void;
}

/** Copy of a response with extra headers (readable by the page because it is a synthetic response). */
async function withHeaders(res: Response, extra: Record<string, string>): Promise<Response> {
  const h = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) h.set("content-type", ct);
  const stored = res.headers.get(STORED_HEADER);
  if (stored) h.set(STORED_HEADER, stored);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  // The page makes CORS requests: without these, a synthetic SW response hides our headers (or is rejected).
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Expose-Headers", `${CACHED_HEADER}, ${STORED_HEADER}`);
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

export async function trim(cache: Cache, max: number): Promise<void> {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

let orthoStores = 0;
async function store(d: Deps, name: string, req: Request, res: Response): Promise<void> {
  const cache = await d.open(name);
  await cache.delete(req); // re-insert → insertion order = LRU-ish for trim
  await cache.put(req, await withHeaders(res, { [STORED_HEADER]: String(d.now()) }));
  if (name !== CACHE_ORTHO || ++orthoStores % ORTHO_TRIM_EVERY === 1) await trim(cache, LIMITS[name] ?? 1000);
}

/** Saved tile first; older than the TTL → GURS, saved copy only if GURS fails. */
async function cacheFirst(req: Request, name: string, ttl: number, d: Deps): Promise<Response> {
  const hit = await (await d.open(name)).match(req);
  const at = Number(hit?.headers.get(STORED_HEADER) ?? 0);
  if (hit && d.now() - at < ttl) return hit;
  let res: Response | null = null;
  try { res = await d.fetch(req); } catch { res = null; }
  const isImage = (res?.headers.get("content-type") ?? "").startsWith("image/");
  if (res && res.ok && isImage) {
    const p = store(d, name, req, res.clone()).catch(() => undefined);
    if (d.waitUntil) d.waitUntil(p); else await p;
    return res;
  }
  if (hit) return hit;
  if (res) return res;
  throw new TypeError("Network error and no cached tile");
}

function isOgcError(ct: string | null, body: string): boolean {
  return !(ct ?? "").includes("json") && body.trimStart().startsWith("<");
}

async function networkFirst(req: Request, name: string, d: Deps, json: boolean): Promise<Response> {
  let res: Response | null = null;
  try {
    res = await d.fetch(req);
  } catch {
    res = null;
  }
  if (res && res.ok) {
    let good = true;
    if (json) {
      const txt = await res.clone().text();
      good = !isOgcError(res.headers.get("content-type"), txt);
    }
    if (good) {
      const p = store(d, name, req, res.clone()).catch(() => undefined);
      if (d.waitUntil) d.waitUntil(p); else await p;
      return res;
    }
  }
  if (!res || res.status >= 500 || res.ok) {
    const hit = await (await d.open(name)).match(req);
    if (hit) return withHeaders(hit, { [CACHED_HEADER]: hit.headers.get(STORED_HEADER) ?? "0" });
  }
  if (res) return res;
  throw new TypeError("Network error and no cached copy");
}

export async function handle(route: Exclude<Route, null>, req: Request, d: Deps): Promise<Response> {
  if (route === "data") return networkFirst(req, CACHE_DATA, d, true);
  if (route === "tiles") return networkFirst(req, CACHE_TILES, d, false);
  if (route === "ortho") return cacheFirst(req, CACHE_ORTHO, ORTHO_TTL_MS, d);
  if (route === "asset") {
    const hit = await (await d.open(CACHE_SHELL)).match(req);
    if (hit) return hit;
    const res = await d.fetch(req);
    if (res.ok) await store(d, CACHE_SHELL, req, res.clone());
    return res;
  }
  // navigate: network first, fall back to cached index.html
  try {
    const res = await d.fetch(req);
    if (res.ok) await store(d, CACHE_SHELL, new Request(new URL("/index.html", req.url).toString()), res.clone());
    return res;
  } catch {
    const hit = await (await d.open(CACHE_SHELL)).match(new Request(new URL("/index.html", req.url).toString()));
    if (hit) return hit;
    throw new TypeError("offline");
  }
}

/** App shell for offline start: index.html plus every /assets file it references (hashed, immutable). */
export function shellUrls(html: string): string[] {
  const urls = new Set<string>(["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/favicon.svg"]);
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.add(m[1]);
  return [...urls];
}

export async function precache(origin: string, d: Pick<Deps, "fetch" | "open">): Promise<number> {
  const res = await d.fetch(new Request(origin + "/index.html", { cache: "no-store" }));
  if (!res.ok) return 0;
  const html = await res.clone().text();
  const cache = await d.open(CACHE_SHELL);
  await cache.put(new Request(origin + "/index.html"), res);
  let n = 1;
  for (const u of shellUrls(html).filter((x) => x !== "/index.html" && x !== "/")) {
    try {
      const r = await d.fetch(new Request(origin + u));
      if (r.ok) { await cache.put(new Request(origin + u), r); n++; }
    } catch { /* best effort */ }
  }
  return n;
}
