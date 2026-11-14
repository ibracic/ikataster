import { GursError, type GursClient, type Parcel, type ParcelDetails } from "../gurs";
import { fromD96 } from "../gurs/proj";
import { noteCached } from "../sw/cacheStatus";
import type { Mirror } from "../mirror/data";
import { gursDown } from "../mirror/state";
import { indexKo, type KoIndex } from "../mirror/koIndex";
import type { OfflineStore } from "./store";

/** GURS unreachable or broken (as opposed to "not found" / bad input). 403 = GURS firewall refusing the query. */
export function isUnavailable(e: unknown): boolean {
  return e instanceof GursError && (e.kind === "network" || e.kind === "timeout" || (e.kind === "http" && ((e.status ?? 0) >= 500 || e.status === 403)));
}

/** Point lookups load at most this many candidate KOs from the mirror. */
const MAX_POINT_KOS = 4;
/** Pins younger than this are not rewritten when a KO is loaded again. */
const PIN_FRESH_MS = 7 * 24 * 3600 * 1000;

/**
 * GURS client that falls back to pinned KOs when GURS is unavailable. Online answers win;
 * local answers mark the UI as "cached data" with the pin date. With a mirror, KOs that are
 * not pinned yet are loaded from the app's static GURS copy on demand (and kept as pins).
 */
export function withOffline(client: GursClient, store: OfflineStore, mirror?: Mirror, o: { pinDelayMs?: number } = {}): GursClient {
  const loading = new Map<number, Promise<boolean>>();
  /** Make sure a KO is available locally; true when it was newly loaded from the mirror. */
  function ensureKo(koId: number): Promise<boolean> {
    if (!mirror) return Promise.resolve(false);
    let p = loading.get(koId);
    if (!p) {
      p = (async () => {
        if (await store.getPin(koId)) return false;
        await store.savePin(await mirror.downloadKo(koId));
        return true;
      })().catch(() => false).finally(() => loading.delete(koId));
      loading.set(koId, p);
    }
    return p;
  }
  /** KOs from the mirror kept in memory (small LRU); stored as pins in the background for offline use. */
  const MEM_KOS = 8;
  /** Save the pin well after the first answer has rendered (and when the browser is idle). */
  const PIN_SAVE_DELAY_MS = o.pinDelayMs ?? 8000;
  const memory = new Map<number, Promise<KoIndex | null>>();
  function memKo(koId: number): Promise<KoIndex | null> {
    if (!mirror) return Promise.resolve(null);
    let p = memory.get(koId);
    if (p) { memory.delete(koId); memory.set(koId, p); return p; }
    p = mirror.downloadKo(koId).then((d) => {
      // Persist after the answer has rendered: cloning a large KO into IndexedDB blocks the main thread.
      const idle = (f: () => void) => (PIN_SAVE_DELAY_MS > 0 && globalThis.requestIdleCallback ? globalThis.requestIdleCallback(f, { timeout: 30_000 }) : setTimeout(f, 0));
      setTimeout(() => idle(() => { void store.getPin(koId).then((pin) => (pin && Date.now() - pin.pinnedAt < PIN_FRESH_MS ? undefined : store.savePin(d))).catch(() => undefined); }), PIN_SAVE_DELAY_MS);
      return indexKo(d);
    }).catch(() => { memory.delete(koId); return null; });
    memory.set(koId, p);
    while (memory.size > MEM_KOS) memory.delete(memory.keys().next().value!);
    return p;
  }
  async function fromMemory<T>(kos: number[], pick: (k: KoIndex) => T | null): Promise<T | null> {
    for (const k of kos.slice(0, MAX_POINT_KOS)) {
      const idx = await memKo(k);
      const r = idx ? pick(idx) : null;
      if (r != null && !(Array.isArray(r) && r.length === 0)) return r;
    }
    return null;
  }
  /** Copy first (memory, then pins), GURS only when the copy has no answer. */
  async function copyFirst<T>(kos: () => Promise<number[]>, pick: (k: KoIndex) => T | null, local: () => Promise<T | null>, online: () => Promise<T>): Promise<T> {
    const m = await fromMemory(await kos().catch(() => [] as number[]), pick);
    if (m != null) return m;
    const l = await local().catch(() => null);
    if (l != null && !(Array.isArray(l) && l.length === 0)) return l;
    if (gursDown()) throw new GursError("network", "GURS ni dosegljiv");
    return online();
  }
  const empty = (r: unknown) => r == null || (Array.isArray(r) && r.length === 0);
  /**
   * With a mirror the app's own copy answers first (fast, GURS is unreliable); GURS is asked only when the
   * copy has no answer. Without a mirror: GURS first, pinned KOs when GURS is unavailable.
   */
  async function fallback<T>(online: () => Promise<T>, local: () => Promise<T | null>, kos: () => Promise<number[]>, koId?: number): Promise<T> {
    const localAnswer = async () => {
      let r = await local().catch(() => null);
      if (empty(r) && mirror) {
        for (const k of (await kos().catch(() => [] as number[])).slice(0, MAX_POINT_KOS)) {
          if (!(await ensureKo(k))) continue;
          r = await local().catch(() => null);
          if (!empty(r)) break;
        }
      }
      if (empty(r)) return null;
      const k = koId ?? (r as { koId?: number }).koId;
      const pin = k ? await store.getPin(k) : undefined;
      noteCached(pin?.pinnedAt ?? 0);
      return r as T;
    };
    if (mirror) {
      const r = await localAnswer();
      if (r != null) return r;
      if (gursDown()) throw new GursError("network", "GURS ni dosegljiv");
      return online();
    }
    let err: unknown = new GursError("network", "GURS ni dosegljiv");
    if (!gursDown()) {
      try {
        return await online();
      } catch (e) {
        if (!isUnavailable(e)) throw e;
        err = e;
      }
    }
    const r = await localAnswer();
    if (r == null) throw err;
    return r;
  }
  const one = (ko: number) => async () => [ko];
  const at = (lon: number, lat: number) => async () => (mirror ? mirror.kosAt(lon, lat) : []);
  return {
    ...client,
    listKos: async () => {
      try {
        const k = await client.listKos();
        await store.saveKos(k).catch(() => undefined);
        return k;
      } catch (e) {
        if (!isUnavailable(e)) throw e;
        const k = await store.listKos();
        if (!k.length) throw e;
        return k;
      }
    },
    searchAddresses: async (q, size, signal) => {
      if (mirror) {
        const r = await mirror.searchAddresses(q, size).catch(() => []);
        if (r.length || gursDown()) return r;
      }
      if (!gursDown()) {
        try { return await client.searchAddresses(q, size, signal); } catch (e) { if (!isUnavailable(e) || !mirror) throw e; }
      }
      if (!mirror) throw new GursError("network", "GURS ni dosegljiv");
      return mirror.searchAddresses(q, size);
    },
    ...(mirror ? {
      parcelDetails: async (p: Parcel): Promise<ParcelDetails> => {
        const x = p.extra;
        if (!x) return client.parcelDetails(p);
        const errors: ParcelDetails["errors"] = [];
        let spatialPlanUnit: ParcelDetails["spatialPlanUnit"] = null;
        if (gursDown()) errors.push("spatialPlanUnit");
        else spatialPlanUnit = await client.spatialPlanUnit(p).catch(() => { errors.push("spatialPlanUnit"); return null; });
        return { landUse: x.landUse, intendedUse: x.intendedUse, buildings: x.buildings, spatialPlanUnit, soilQuality: p.soilQuality, errors };
      },
      findParcel: (ko: number, n: string) => copyFirst(one(ko), (k) => k.parcel(n), () => store.findParcel(ko, n), () => client.findParcel(ko, n)),
      parcelAt: (lon: number, lat: number) => copyFirst(at(lon, lat), (k) => k.parcelAt(lon, lat), () => store.parcelAt(lon, lat), () => client.parcelAt(lon, lat)),
      parcelAtD96: (e: number, n: number) => { const [lon, lat] = fromD96(e, n); return copyFirst(at(lon, lat), (k) => k.parcelAt(lon, lat), () => store.parcelAt(lon, lat), () => client.parcelAtD96(e, n)); },
      findBuilding: (ko: number, n: number) => copyFirst(one(ko), (k) => k.building(n), () => store.findBuilding(ko, n), () => client.findBuilding(ko, n)),
      buildingAt: (lon: number, lat: number) => copyFirst(at(lon, lat), (k) => k.buildingAt(lon, lat), () => store.buildingAt(lon, lat), () => client.buildingAt(lon, lat)),
      buildingParts: (ko: number, n: number) => copyFirst(one(ko), (k) => k.parts(n), () => store.buildingParts(ko, n), () => client.buildingParts(ko, n)),
    } : {
    findParcel: (ko, n) => fallback(() => client.findParcel(ko, n), () => store.findParcel(ko, n), one(ko), ko),
    parcelAt: (lon, lat) => fallback(() => client.parcelAt(lon, lat), () => store.parcelAt(lon, lat), at(lon, lat)),
    parcelAtD96: (e, n) => { const [lon, lat] = fromD96(e, n); return fallback(() => client.parcelAtD96(e, n), () => store.parcelAt(lon, lat), at(lon, lat)); },
    findBuilding: (ko, n) => fallback(() => client.findBuilding(ko, n), () => store.findBuilding(ko, n), one(ko), ko),
    buildingAt: (lon, lat) => fallback(() => client.buildingAt(lon, lat), () => store.buildingAt(lon, lat), at(lon, lat)),
    buildingParts: (ko, n) => fallback(() => client.buildingParts(ko, n), () => store.buildingParts(ko, n), one(ko), ko),
    }),
  } as GursClient;
}
