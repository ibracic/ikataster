import Dexie, { type Table } from 'dexie';
export const DATASET_BASE = (import.meta.env.VITE_IKATASTER_VALUES_URL as string | undefined) ?? 'https://raw.githubusercontent.com/ibracic/ikataster/data';
export const DATASET_TTL = 7 * 24 * 3600 * 1000;
export interface DatasetOptions { name?: string; base?: string; fetch?: typeof fetch; now?: () => number }
export interface Dataset<T> { get(ko: number): Promise<T | null>; count(): Promise<number>; clear(): Promise<void> }
type Row<T> = T & { fetchedAt: number; missing?: boolean };
class KoDb<T> extends Dexie {
  kos!: Table<Row<T>, number>;
  constructor(name: string) { super(name); this.version(1).stores({ kos: '&ko' }); }
}
/** Shared persistence/HTTP policy; adapters own only path and record shape. Existing v1 rows remain readable. */
export function createDataset<T extends { ko: number; date: string }>(adapter: {
  name: string; path: string; decode: (json: any, ko: number) => T; empty: (ko: number) => T;
}, opts: DatasetOptions = {}): Dataset<T> {
  const db = new KoDb<T>(opts.name ?? adapter.name);
  const base = (opts.base ?? DATASET_BASE).replace(/\/$/, '');
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  const inflight = new Map<number, Promise<T | null>>();
  const load = async (ko: number): Promise<T | null> => {
    const cached = await db.kos.get(ko).catch(() => undefined);
    if (cached && now() - cached.fetchedAt < DATASET_TTL) return cached.missing ? null : cached;
    try {
      const res = await doFetch(`${base}/${adapter.path}/${ko}.json`);
      if (res.status === 404) {
        await db.kos.put({ ...adapter.empty(ko), fetchedAt: now(), missing: true });
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = { ...adapter.decode(await res.json(), ko), fetchedAt: now() };
      await db.kos.put(row);
      return row;
    } catch (e) {
      if (cached) return cached.missing ? null : cached;
      throw e;
    }
  };
  return {
    get(ko) {
      let p = inflight.get(ko);
      if (!p) { p = load(ko).finally(() => inflight.delete(ko)); inflight.set(ko, p); }
      return p;
    },
    count: () => db.kos.count(),
    clear: () => db.kos.clear(),
  };
}
