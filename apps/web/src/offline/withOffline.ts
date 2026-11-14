import { GursError, type GursClient } from "../gurs";
import { fromD96 } from "../gurs/proj";
import { noteCached } from "../sw/cacheStatus";
import type { Mirror } from "../mirror/data";
import { gursDown } from "../mirror/state";
import type { OfflineStore } from "./store";

/** GURS unreachable or broken (as opposed to "not found" / bad input). 403 = GURS firewall refusing the query. */
export function isUnavailable(e: unknown): boolean {
  return e instanceof GursError && (e.kind === "network" || e.kind === "timeout" || (e.kind === "http" && ((e.status ?? 0) >= 500 || e.status === 403)));
}

/** Point lookups load at most this many candidate KOs from the mirror. */
const MAX_POINT_KOS = 4;

/**
 * GURS client that falls back to pinned KOs when GURS is unavailable. Online answers win;
 * local answers mark the UI as "cached data" with the pin date. With a mirror, KOs that are
 * not pinned yet are loaded from the app's static GURS copy on demand (and kept as pins).
 */
export function withOffline(client: GursClient, store: OfflineStore, mirror?: Mirror): GursClient {
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
  const empty = (r: unknown) => r == null || (Array.isArray(r) && r.length === 0);
  async function fallback<T>(online: () => Promise<T>, local: () => Promise<T | null>, kos: () => Promise<number[]>, koId?: number): Promise<T> {
    let err: unknown = new GursError("network", "GURS ni dosegljiv");
    if (!gursDown()) {
      try {
        return await online();
      } catch (e) {
        if (!isUnavailable(e)) throw e;
        err = e;
      }
    }
    let r = await local().catch(() => null);
    if (empty(r) && mirror) {
      for (const k of (await kos().catch(() => [] as number[])).slice(0, MAX_POINT_KOS)) {
        if (!(await ensureKo(k))) continue;
        r = await local().catch(() => null);
        if (!empty(r)) break;
      }
    }
    if (empty(r)) throw err;
    const k = koId ?? (r as { koId?: number }).koId;
    const pin = k ? await store.getPin(k) : undefined;
    noteCached(pin?.pinnedAt ?? 0);
    return r as T;
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
      if (!gursDown()) {
        try { return await client.searchAddresses(q, size, signal); } catch (e) { if (!isUnavailable(e) || !mirror) throw e; }
      }
      if (!mirror) throw new GursError("network", "GURS ni dosegljiv");
      return mirror.searchAddresses(q, size);
    },
    findParcel: (ko, n) => fallback(() => client.findParcel(ko, n), () => store.findParcel(ko, n), one(ko), ko),
    parcelAt: (lon, lat) => fallback(() => client.parcelAt(lon, lat), () => store.parcelAt(lon, lat), at(lon, lat)),
    parcelAtD96: (e, n) => { const [lon, lat] = fromD96(e, n); return fallback(() => client.parcelAtD96(e, n), () => store.parcelAt(lon, lat), at(lon, lat)); },
    findBuilding: (ko, n) => fallback(() => client.findBuilding(ko, n), () => store.findBuilding(ko, n), one(ko), ko),
    buildingAt: (lon, lat) => fallback(() => client.buildingAt(lon, lat), () => store.buildingAt(lon, lat), at(lon, lat)),
    buildingParts: (ko, n) => fallback(() => client.buildingParts(ko, n), () => store.buildingParts(ko, n), one(ko), ko),
  };
}
