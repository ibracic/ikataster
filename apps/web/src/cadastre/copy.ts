import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { GursError, type AreaFeature, type AreaKind, type AreaResult, type GursClient, type Parcel, type ParcelDetails } from "../gurs";
import { fromD96 } from "../gurs/proj";
import { noteCached } from "../sw/cacheStatus";
import type { Mirror } from "../mirror/data";
import { indexKo, type KoIndex } from "../mirror/koIndex";
import type { OfflineStore } from "../offline/store";

/** Point lookups try at most this many candidate KOs (bbox hits, nearest centre first). */
const MAX_POINT_KOS = 4;
/** An area search loads at most this many KOs. */
const MAX_AREA_KOS = 8;
/** KOs kept decoded in memory. */
const MEM_KOS = 8;
/** Pins younger than this are not rewritten when a KO is loaded again. */
const PIN_FRESH_MS = 7 * 24 * 3600 * 1000;

const empty = (r: unknown) => r == null || (Array.isArray(r) && r.length === 0);

/**
 * The cadastre client the app uses. Everything the app's own GURS copy (mirror) contains is answered
 * from it and never from GURS: KO list, parcels, buildings, parts, addresses, managers, outlines,
 * area searches, parcel details. A "not found" in the copy is final.
 *
 * Order per lookup: KO in memory → KO file from the copy (kept in memory, saved as a pin for offline use)
 * → saved pin when the copy itself can't be reached (offline).
 *
 * GURS is only asked for what the copy does not have: the spatial plan unit (EUP) of a parcel.
 * Ortho photos are map tiles and don't pass through here.
 */
export function withCopy(client: GursClient, mirror: Mirror, store: OfflineStore, o: { pinDelayMs?: number } = {}): GursClient {
  const pinDelay = o.pinDelayMs ?? 8000;
  const memory = new Map<number, Promise<KoIndex | null>>();

  function savePinLater(koId: number, d: Parameters<OfflineStore["savePin"]>[0]) {
    const save = () => void store.getPin(koId)
      .then((pin) => (pin && Date.now() - pin.pinnedAt < PIN_FRESH_MS ? undefined : store.savePin(d))).catch(() => undefined);
    if (pinDelay <= 0) return save();
    // After the answer has rendered and when the browser is idle: cloning a large KO into IndexedDB blocks the main thread.
    setTimeout(() => (globalThis.requestIdleCallback ? globalThis.requestIdleCallback(save, { timeout: 30_000 }) : save()), pinDelay);
  }

  /** KO from the copy, decoded and indexed; null when the copy can't be reached (or doesn't know the KO). */
  function ko(koId: number): Promise<KoIndex | null> {
    let p = memory.get(koId);
    if (p) { memory.delete(koId); memory.set(koId, p); return p; }
    p = mirror.downloadKo(koId).then((d) => { savePinLater(koId, d); return indexKo(d); })
      .catch(() => { memory.delete(koId); return null; });
    memory.set(koId, p);
    while (memory.size > MEM_KOS) memory.delete(memory.keys().next().value!);
    return p;
  }

  /** First non-empty answer from the given KOs; offline → saved pins; nothing → `none`. */
  async function lookup<T>(kos: number[] | Promise<number[]>, pick: (k: KoIndex) => T | null, pinned: () => Promise<T | null>, none: T): Promise<T> {
    let reachable = false;
    for (const id of (await Promise.resolve(kos).catch(() => [] as number[])).slice(0, MAX_POINT_KOS)) {
      const idx = await ko(id);
      if (!idx) continue;
      reachable = true;
      const r = pick(idx);
      if (!empty(r)) return r as T;
    }
    if (reachable) return none;
    // The copy can't be reached: answer from KOs saved on this device.
    const r = await pinned().catch(() => null);
    if (empty(r)) return none;
    const k = (r as { koId?: number }).koId;
    const pin = k ? await store.getPin(k) : undefined;
    noteCached(pin?.pinnedAt ?? 0);
    return r as T;
  }

  const at = (lon: number, lat: number) => mirror.kosAt(lon, lat);

  return {
    ...client,
    async listKos() {
      try {
        const k = await mirror.listKos();
        void store.saveKos(k).catch(() => undefined);
        return k;
      } catch (e) {
        const k = await store.listKos().catch(() => []);
        if (!k.length) throw e;
        return k;
      }
    },
    downloadKo: (koId) => mirror.downloadKo(koId),
    searchManagers: (q) => mirror.searchManagers(q),
    managerPortfolio: (id, opt = {}) => mirror.managerPortfolio(id, opt.koId),
    // Outlines of buildings in loaded manager files; a building without one has no outline in GURS either.
    buildingOutlines: async (list) => mirror.knownOutlines(list),
    searchAddresses: (q, size) => mirror.searchAddresses(q, size),

    findParcel: (koId: number, n: string) => lookup([koId], (k) => k.parcel(n), () => store.findParcel(koId, n), null),
    parcelAt: (lon: number, lat: number) => lookup(at(lon, lat), (k) => k.parcelAt(lon, lat), () => store.parcelAt(lon, lat), null),
    parcelAtD96: (e: number, n: number) => { const [lon, lat] = fromD96(e, n); return lookup(at(lon, lat), (k) => k.parcelAt(lon, lat), () => store.parcelAt(lon, lat), null); },
    findBuilding: (koId: number, n: number) => lookup([koId], (k) => k.building(n), () => store.getBuilding(koId, n), null),
    buildingAt: (lon: number, lat: number) => lookup(at(lon, lat), (k) => k.buildingAt(lon, lat), () => store.buildingAt(lon, lat), null),
    buildingParts: (koId: number, n: number) => lookup([koId], (k) => k.parts(n), async () => (await store.getBuildingParts(koId, n)) ?? [], []),

    async parcelDetails(p: Parcel): Promise<ParcelDetails> {
      const x = p.extra ?? { landUse: [], intendedUse: [], buildings: [] };
      const errors: ParcelDetails["errors"] = p.extra ? [] : ["landUse", "intendedUse", "buildings"];
      // EUP (spatial plan unit) is the one parcel detail the copy doesn't have.
      const spatialPlanUnit = await client.spatialPlanUnit(p).catch(() => { errors.push("spatialPlanUnit"); return null; });
      return { landUse: x.landUse, intendedUse: x.intendedUse, buildings: x.buildings, spatialPlanUnit, soilQuality: p.soilQuality, errors };
    },

    async featuresInPolygon(kind: AreaKind, ring: [number, number][], o2: { max?: number } = {}): Promise<AreaResult> {
      const max = o2.max ?? 300;
      const pts = ring.filter((q, i) => i === 0 || q[0] !== ring[i - 1][0] || q[1] !== ring[i - 1][1]);
      const closed = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts : [...pts, pts[0]];
      if (closed.length < 4) throw new GursError("invalid-input", "A polygon needs at least 3 points");
      const poly = { type: "Polygon" as const, coordinates: [closed] };
      const xs = closed.map((q) => q[0]), ys = closed.map((q) => q[1]);
      const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const kos = await mirror.kosIn(box);
      if (kos.length > MAX_AREA_KOS) return { total: max + 1, tooMany: true, items: [] };
      const items: AreaFeature[] = [];
      for (const id of kos) {
        const idx = await ko(id);
        if (!idx) throw new GursError("network", "Kopija podatkov ni dosegljiva");
        for (const f of idx.within(kind, box)) {
          if (!booleanPointInPolygon(f.centroid, poly)) continue;
          items.push({ kind, koId: f.koId, koName: f.koName, number: String(f.number), eid: f.eid, geometry: f.geometry ?? null });
          if (items.length > max) return { total: items.length, tooMany: true, items: [] };
        }
      }
      return { total: items.length, tooMany: false, items };
    },
  } as GursClient;
}
