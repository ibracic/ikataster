import { SETTINGS } from "../data/inventory";
import { DATABASES } from "../data/inventory";
import Dexie, { type Table } from "dexie";
import { itemKey, type CartInput } from "../cart/store";
import { QUOTA_KEY, type QuotaStorage } from "../ezk/quota";

export type JobStatus = "queued" | "running" | "done" | "failed" | "deferred";
export interface Job {
  key: string;
  item: CartInput;
  status: JobStatus;
  attempts: number;
  /** Bridge/eZK error code or PARSE. */
  code?: string;
  error?: string;
  order: number;
  updatedAt: number;
}
interface Kv { k: string; v: string }

class QueueDb extends Dexie {
  jobs!: Table<Job, string>;
  kv!: Table<Kv, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ jobs: "&key, status, order", kv: "&k" });
  }
}

/** Where the quota lived before it moved into IndexedDB (both names the app had). */
export const LEGACY_QUOTA_KEYS = [SETTINGS.legacyQuota, "parcela.ezk.quota.v1"];
export const LEGACY_QUOTA_KEY = LEGACY_QUOTA_KEYS[1];

/** Download queue + small key/value table (eZK quota) in IndexedDB. */
export function createQueueStore(name: string = DATABASES.queue.name, now = () => Date.now()) {
  const db = new QueueDb(name);
  const kvCache = new Map<string, string>();
  let hydrated: Promise<void> | null = null;

  const store = {
    db,
    list: () => db.jobs.orderBy("order").toArray(),
    get: (key: string) => db.jobs.get(key),
    /** Add items as queued; failed/deferred ones are re-queued, done and queued ones stay. Returns number queued. */
    async enqueue(items: CartInput[]): Promise<number> {
      return db.transaction("rw", db.jobs, async () => {
        let order = ((await db.jobs.orderBy("order").last())?.order ?? 0) + 1;
        let n = 0;
        for (const item of items) {
          const key = itemKey(item);
          const old = await db.jobs.get(key);
          if (old && (old.status === "queued" || old.status === "running" || old.status === "done")) continue;
          await db.jobs.put({ key, item, status: "queued", attempts: old?.attempts ?? 0, order: old?.order ?? order++, updatedAt: now() });
          n++;
        }
        return n;
      });
    },
    async set(key: string, patch: Partial<Job>) { await db.jobs.update(key, { ...patch, updatedAt: now() }); },
    /** Next jobs waiting to run (queued first, then deferred from earlier days), in cart order. */
    async waiting(): Promise<Job[]> {
      return (await db.jobs.where("status").anyOf("queued", "deferred").toArray()).sort((a, b) => a.order - b.order);
    },
    /** After a reload a "running" job never finished: put it back in the queue. */
    async recover(): Promise<number> {
      return db.jobs.where("status").equals("running").modify({ status: "queued" });
    },
    retryFailed: () => db.jobs.where("status").equals("failed").modify({ status: "queued", code: undefined, error: undefined }),
    /** Drop everything that has not been downloaded yet. */
    cancelPending: () => db.jobs.where("status").anyOf("queued", "deferred", "running").delete(),
    clear: () => db.jobs.clear(),

    /**
     * Synchronous quota storage mirrored into IndexedDB. Call hydrate() once before use; it also migrates the
     * old localStorage counter (parcela.ezk.quota.v1) into IndexedDB and removes it.
     */
    quotaStorage: {
      getItem: (k: string) => kvCache.get(k) ?? null,
      setItem: (k: string, v: string) => { kvCache.set(k, v); void db.kv.put({ k, v }); },
    } satisfies QuotaStorage,
    hydrate(ls: Storage | null = globalThis.localStorage ?? null): Promise<void> {
      return (hydrated ??= (async () => {
        for (const r of await db.kv.toArray()) kvCache.set(r.k, r.v);
        for (const old of LEGACY_QUOTA_KEYS) {
          const legacy = ls?.getItem(old);
          if (legacy == null) continue;
          if (!kvCache.has(QUOTA_KEY)) { kvCache.set(QUOTA_KEY, legacy); await db.kv.put({ k: QUOTA_KEY, v: legacy }); }
          ls!.removeItem(old);
        }
      })());
    },
  };
  return store;
}
export type QueueStore = ReturnType<typeof createQueueStore>;
