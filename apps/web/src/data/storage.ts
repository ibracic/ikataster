/** Persistent storage (so the browser does not evict IndexedDB) and usage estimate. */
export interface StorageInfo { supported: boolean; persisted: boolean | null; usage: number | null; quota: number | null }
type Nav = { storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean>; estimate?: () => Promise<{ usage?: number; quota?: number }> } };

const ASKED = "ikataster.persistAsked";

export async function storageInfo(nav: Nav = globalThis.navigator as Nav): Promise<StorageInfo> {
  const s = nav?.storage;
  if (!s?.estimate) return { supported: false, persisted: null, usage: null, quota: null };
  const [persisted, est] = await Promise.all([s.persisted?.().catch(() => null) ?? null, s.estimate().catch(() => ({} as { usage?: number; quota?: number }))]);
  return { supported: true, persisted, usage: est.usage ?? null, quota: est.quota ?? null };
}

/** Ask once (on the first save) for persistent storage. Returns the resulting state. */
export async function ensurePersisted(nav: Nav = globalThis.navigator as Nav, ls: Storage | null = globalThis.localStorage ?? null, force = false): Promise<boolean | null> {
  const s = nav?.storage;
  if (!s?.persist) return null;
  if (await s.persisted?.().catch(() => false)) return true;
  if (!force && ls?.getItem(ASKED)) return false;
  ls?.setItem(ASKED, String(Date.now()));
  return s.persist().catch(() => false);
}

/** Drop HTTP caches (service-worker GURS cache) and derived localStorage caches. Data stays. */
export async function clearCaches(ls: Storage | null = globalThis.localStorage ?? null, answers: { count(): Promise<number>; clear(): Promise<void> } | null = null): Promise<number> {
  let n = 0;
  if (answers) { n += await answers.count().catch(() => 0); await answers.clear().catch(() => undefined); }
  if (globalThis.caches) for (const k of await caches.keys()) if (await caches.delete(k)) n++;
  if (ls) for (let i = ls.length - 1; i >= 0; i--) { const k = ls.key(i)!; if (k.startsWith("ikataster.kos.")) { ls.removeItem(k); n++; } }
  return n;
}
