import type { Geometry } from "geojson";
import type { Building, BuildingPart, GursClient, Manager, ManagerPortfolio, ManagerSearch } from "../gurs";
import { isUnavailable } from "../offline/withOffline";
import type { CacheStore } from "./store";
import { fetchKeys } from "../local/db";

/** Cadastre data changes slowly: answers are reused for a week, outlines for a month. */
export const CACHE_TTL_MS = 7 * 24 * 3600_000;
export const OUTLINE_TTL_MS = 30 * 24 * 3600_000;

/** Same normalisation for stored searches and local matching (GURS ILIKE: case-insensitive). */
export const normQuery = (q: string) => q.trim().toLocaleLowerCase("sl").replace(/\s+/g, " ");

export const cacheKeys = {
  managerSearch: (q: string) => fetchKeys.search(normQuery(q)),
  portfolio: (id: number) => fetchKeys.portfolio(id),
  building: (ko: number, n: number) => fetchKeys.building(ko, n),
  parts: (ko: number, n: number) => fetchKeys.parts(ko, n),
};

/** Every manager seen so far (searches, portfolios, building parts, pins), biggest first. */
export async function knownManagers(store: CacheStore): Promise<Manager[]> {
  const rows = await store.listManagers().catch(() => []);
  return rows.map(({ at: _at, ...m }) => m).sort((a, b) => (b.parts ?? 0) - (a.parts ?? 0) || a.name.localeCompare(b.name, "sl"));
}

/** Local matches for the search box: name or address contains the text (case-insensitive). */
export function matchManagers(list: Manager[], q: string): Manager[] {
  const n = normQuery(q);
  return n ? list.filter((m) => normQuery(m.name).includes(n) || normQuery(m.address ?? "").includes(n)) : list;
}

/**
 * Cache-first GURS client for the slow, heavy queries. Fresh local answers come straight from
 * IndexedDB (no GURS request at all); stale ones are refreshed, and still used if GURS is down.
 */
export function withCache(client: GursClient, store: CacheStore, o: { now?: () => number; ttlMs?: number; outlineTtlMs?: number } = {}): GursClient {
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? CACHE_TTL_MS;
  const outlineTtl = o.outlineTtlMs ?? OUTLINE_TTL_MS;

  const fresh = (at: number | undefined, t = ttl) => at != null && now() - at < t;
  const quiet = <T,>(p: Promise<T>) => p.catch(() => undefined);

  /** Fresh completed fetch → local answer; otherwise GURS, saved; stale local answer if GURS is down. */
  async function cached<T>(key: string, local: () => Promise<T | null>, load: () => Promise<T>, save: (v: T) => Promise<unknown>, keep: (v: T) => boolean = (v) => v != null): Promise<T> {
    const f = await store.get(key).catch(() => undefined);
    if (f && fresh(f.at)) { const v = await local().catch(() => null); if (v != null) return v; }
    try {
      const v = await load();
      if (keep(v)) await quiet(save(v));
      return v;
    } catch (e) {
      if (f && isUnavailable(e)) { const v = await local().catch(() => null); if (v != null) return v; }
      throw e;
    }
  }

  const savedSearch = async (q: string): Promise<ManagerSearch | null> => {
    const f = await store.get(cacheKeys.managerSearch(q)).catch(() => undefined);
    const meta = f?.meta as { ids: number[]; truncated: boolean } | undefined;
    if (!meta) return null;
    const byId = new Map((await store.getManagers(meta.ids)).map(({ at: _at, ...m }) => [m.id, m]));
    return { managers: meta.ids.map((id) => byId.get(id)).filter((m): m is Manager => !!m), truncated: meta.truncated };
  };

  return {
    ...client,
    /**
     * Exact saved search → saved answer. A saved complete (not truncated) search for a shorter text
     * contained in this one ("indo" for "indoma") answers locally too. Otherwise GURS; every manager
     * found goes into the managers table.
     */
    searchManagers: async (q: string, signal?: AbortSignal) => {
      if (q.trim().length < 3) return client.searchManagers(q, signal);
      const n = normQuery(q);
      const exact = await store.get(cacheKeys.managerSearch(q)).catch(() => undefined);
      if (!exact || !fresh(exact.at)) {
        const saved = await store.listPrefix("search:").catch(() => []);
        const cover = saved.find((e) => {
          const q0 = e.key.slice("search:".length);
          const meta = e.meta as { truncated?: boolean } | undefined;
          return q0 !== n && n.includes(q0) && meta && !meta.truncated && fresh(e.at);
        });
        if (cover) {
          const r = await savedSearch(cover.key.slice("search:".length));
          if (r) return { managers: r.managers.filter((m) => normQuery(m.name).includes(n)), truncated: false };
        }
      }
      return cached<ManagerSearch>(cacheKeys.managerSearch(q), () => savedSearch(q), () => client.searchManagers(q, signal),
        async (r) => { await store.putManagers(r.managers, now()); await store.put(cacheKeys.managerSearch(q), { ids: r.managers.map((m) => m.id), truncated: r.truncated }, now()); },
        (v) => v.managers.length > 0);
    },

    /** The whole portfolio is stored once (parts point at their manager); a KO filter is applied locally. */
    managerPortfolio: async (id, opts = {}) => {
      const all = await cached<ManagerPortfolio | null>(cacheKeys.portfolio(id), () => store.portfolio(id),
        () => client.managerPortfolio(id, { signal: opts.signal, onProgress: opts.onProgress }),
        (p) => store.putPortfolio(p!.manager, p!.buildings, now()));
      if (!all || !opts.koId) return all;
      const buildings = all.buildings.filter((b) => b.koId === opts.koId);
      return buildings.length ? { ...all, buildings, parts: buildings.flatMap((b) => b.parts) } : null;
    },

    /** Only the missing / stale outlines go to GURS. */
    buildingOutlines: async (list, signal) => {
      const rows = await store.getOutlines(list).catch(() => []);
      const out = new Map<string, Geometry>();
      const ok = new Set<string>();
      for (const r of rows) {
        const k = `${r.koId}:${r.number}`;
        out.set(k, (r.outline ?? r.building?.geometry)!);
        if (fresh(r.outlineAt, outlineTtl) || (!r.outline && r.building?.geometry)) ok.add(k);
      }
      const missing = list.filter((b) => !ok.has(`${b.koId}:${b.number}`));
      if (!missing.length) return out;
      try {
        const got = await client.buildingOutlines(missing, signal);
        await quiet(store.putOutlines(got, now()));
        for (const [k, g] of got) out.set(k, g);
      } catch (e) {
        if (!out.size || !isUnavailable(e)) throw e;
      }
      return out;
    },

    findBuilding: (ko, n) => cached<Building | null>(cacheKeys.building(ko, n), () => store.getBuilding(ko, n), () => client.findBuilding(ko, n), (b) => store.putBuilding(b!, now())),
    buildingParts: async (ko, n) => {
      const parts = await cached<BuildingPart[]>(cacheKeys.parts(ko, n), () => store.getBuildingParts(ko, n), () => client.buildingParts(ko, n),
        (v) => store.putBuildingParts(ko, n, v, now()), (v) => v.length > 0);
      const ms = new Map<number, Manager>();
      for (const p of parts) if (p.manager && !ms.has(p.manager.id)) ms.set(p.manager.id, { id: p.manager.id, name: p.manager.name, address: null, parts: null });
      await quiet(store.putManagers([...ms.values()], now()));
      return parts;
    },
  };
}
