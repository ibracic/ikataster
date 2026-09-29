import { GursError, type GursClient } from "../gurs";
import { fromD96 } from "../gurs/proj";
import { noteCached } from "../sw/cacheStatus";
import type { OfflineStore } from "./store";

/** GURS unreachable or broken (as opposed to "not found" / bad input). */
export function isUnavailable(e: unknown): boolean {
  return e instanceof GursError && (e.kind === "network" || e.kind === "timeout" || (e.kind === "http" && (e.status ?? 0) >= 500));
}

/**
 * GURS client that falls back to pinned KOs when GURS is unavailable. Online answers win;
 * local answers mark the UI as "cached data" with the pin date.
 */
export function withOffline(client: GursClient, store: OfflineStore): GursClient {
  async function fallback<T>(online: () => Promise<T>, local: () => Promise<T | null>, koId?: number): Promise<T> {
    try {
      return await online();
    } catch (e) {
      if (!isUnavailable(e)) throw e;
      const r = await local().catch(() => null);
      if (r == null || (Array.isArray(r) && r.length === 0)) throw e;
      const k = koId ?? (r as { koId?: number }).koId;
      const pin = k ? await store.getPin(k) : undefined;
      noteCached(pin?.pinnedAt ?? 0);
      return r;
    }
  }
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
    findParcel: (ko, n) => fallback(() => client.findParcel(ko, n), () => store.findParcel(ko, n), ko),
    parcelAt: (lon, lat) => fallback(() => client.parcelAt(lon, lat), () => store.parcelAt(lon, lat)),
    parcelAtD96: (e, n) => fallback(() => client.parcelAtD96(e, n), () => { const [lon, lat] = fromD96(e, n); return store.parcelAt(lon, lat); }),
    findBuilding: (ko, n) => fallback(() => client.findBuilding(ko, n), () => store.findBuilding(ko, n), ko),
    buildingAt: (lon, lat) => fallback(() => client.buildingAt(lon, lat), () => store.buildingAt(lon, lat)),
    buildingParts: (ko, n) => fallback(() => client.buildingParts(ko, n), () => store.buildingParts(ko, n), ko),
  };
}
