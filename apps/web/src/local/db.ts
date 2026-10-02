import { DATABASES, LEGACY_DATABASES } from "../data/inventory";
import Dexie, { type Table } from "dexie";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Geometry, Polygon, MultiPolygon } from "geojson";
import type { Building, BuildingPart, KoDownload, Ko, Parcel } from "../gurs";
import type { ManagedBuilding, ManagedPart, Manager } from "../gurs/managers";

/**
 * One local, relational copy of the GURS data the user has seen: managers, buildings, building parts
 * and parcels, each stored once. Pinned KOs and the answer cache share these tables; `fetches` records
 * which question was answered completely and when (freshness), `pins` which KOs are kept offline.
 */
export type BBox = [number, number, number, number];
export interface Pin { koId: number; name: string; pinnedAt: number; parcels: number; buildings: number; parts: number; bytes: number }
export interface ManagerRow extends Manager { at: number }
export interface ParcelRow { koId: number; number: string; bbox: BBox; parcel: Parcel }
/** `building` = full attributes (null until opened / pinned); `outline` = footprint for map drawing. */
export interface BuildingRow { koId: number; number: number; eid?: string | null; bbox?: BBox; building?: Building | null; outline?: Geometry | null; outlineAt?: number }
/** `part` = full attributes (from building details or a pin); portfolio rows only know eid/use/manager. */
export interface PartRow { koId: number; building: number; number: number; eid: string; buildingEid?: string | null; use: string | null; managerId: number | null; part?: BuildingPart | null }
/** Completed question: `search:<q>` (meta {ids, truncated}), `portfolio:<id>`, `building:<ko>:<n>`, `parts:<ko>:<n>`. */
export interface FetchRow { key: string; at: number; meta?: unknown }

class GursDb extends Dexie {
  managers!: Table<ManagerRow, number>;
  buildings!: Table<BuildingRow, [number, number]>;
  parts!: Table<PartRow, [number, number, number]>;
  parcels!: Table<ParcelRow, [number, string]>;
  fetches!: Table<FetchRow, string>;
  pins!: Table<Pin, number>;
  kos!: Table<Ko, number>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      managers: "&id, name",
      buildings: "[koId+number], koId",
      parts: "[koId+building+number], [koId+building], koId, managerId",
      parcels: "[koId+number], koId",
      fetches: "&key, at",
      pins: "&koId",
      kos: "&id",
    });
  }
}

export function bboxOf(g: Geometry): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  if ("coordinates" in g) walk(g.coordinates);
  return b;
}
const inBox = (b: BBox | undefined, x: number, y: number) => !!b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const contains = (g: Geometry | null | undefined, lon: number, lat: number) =>
  !!g && (g.type === "Polygon" || g.type === "MultiPolygon") && booleanPointInPolygon([lon, lat], g as Polygon | MultiPolygon);

export const fetchKeys = {
  search: (q: string) => `search:${q}`,
  portfolio: (id: number) => `portfolio:${id}`,
  building: (ko: number, n: number) => `building:${ko}:${n}`,
  // v2: parts gained detail attributes (address, flat, renovations, status); older lists are refetched once
  parts: (ko: number, n: number) => `parts2:${ko}:${n}`,
};

const partRow = (koId: number, building: number, p: BuildingPart, buildingEid?: string | null): PartRow =>
  ({ koId, building, number: p.number, eid: p.eid, buildingEid: buildingEid ?? null, use: p.use, managerId: p.manager?.id ?? null, part: p });

export function createGursStore(name: string = DATABASES.gurs.name) {
  const db = new GursDb(name);
  const cacheTables = () => [db.managers, db.buildings, db.parts, db.fetches];

  const store = {
    db,
    // --- freshness ---------------------------------------------------------------------------
    get: (key: string) => db.fetches.get(key),
    put: (key: string, meta?: unknown, at = Date.now()) => db.fetches.put({ key, at, meta }),
    delete: (key: string) => db.fetches.delete(key),
    listPrefix: (prefix: string) => db.fetches.where("key").startsWith(prefix).toArray(),

    // --- managers ----------------------------------------------------------------------------
    listManagers: () => db.managers.toArray(),
    getManagers: async (ids: number[]) => (await db.managers.bulkGet(ids)).filter((m): m is ManagerRow => !!m),
    /** Upsert; unknown fields (null) never overwrite known ones. */
    async putManagers(ms: Manager[], at = Date.now()) {
      if (!ms.length) return;
      const uniq = [...new Map(ms.map((m) => [m.id, m])).values()];
      await db.transaction("rw", db.managers, async () => {
        const old = await db.managers.bulkGet(uniq.map((m) => m.id));
        await db.managers.bulkPut(uniq.map((m, i) => ({
          id: m.id, name: m.name || old[i]?.name || "", address: m.address ?? old[i]?.address ?? null, parts: m.parts ?? old[i]?.parts ?? null, at,
        })));
      });
    },

    // --- portfolios --------------------------------------------------------------------------
    /** Save a manager's portfolio: its parts point at the manager; parts it no longer manages are released. */
    async putPortfolio(manager: Manager, buildings: ManagedBuilding[], at = Date.now()) {
      await db.transaction("rw", [db.managers, db.buildings, db.parts, db.fetches], async () => {
        await store.putManagers([manager], at);
        const keep = new Set(buildings.flatMap((b) => b.parts.map((p) => `${p.koId}:${p.building}:${p.part}`)));
        const old = await db.parts.where("managerId").equals(manager.id).toArray();
        const released = old.filter((r) => !keep.has(`${r.koId}:${r.building}:${r.number}`));
        if (released.length) await db.parts.bulkPut(released.map((r) => ({ ...r, managerId: null, part: r.part ? { ...r.part, manager: null } : r.part })));
        const all = buildings.flatMap((b) => b.parts);
        const existing = await db.parts.bulkGet(all.map((p) => [p.koId, p.building, p.part] as [number, number, number]));
        await db.parts.bulkPut(all.map((p, i) => {
          const e = existing[i];
          const part = e?.part ? { ...e.part, manager: { id: manager.id, name: manager.name, status: e.part.manager?.status ?? null } } : e?.part;
          return { koId: p.koId, building: p.building, number: p.part, eid: p.eid, buildingEid: p.buildingEid, use: p.use ?? e?.use ?? null, managerId: manager.id, part };
        }));
        const bs = await db.buildings.bulkGet(buildings.map((b) => [b.koId, b.number] as [number, number]));
        const newB = buildings.filter((_, i) => !bs[i]).map((b) => ({ koId: b.koId, number: b.number, eid: b.eid }));
        if (newB.length) await db.buildings.bulkPut(newB);
        await db.fetches.put({ key: fetchKeys.portfolio(manager.id), at });
      });
    },
    /** Portfolio rebuilt from the tables (buildings ordered by KO, number; parts by number). */
    async portfolio(id: number): Promise<{ manager: Manager; parts: ManagedPart[]; buildings: ManagedBuilding[] } | null> {
      const m = await db.managers.get(id);
      if (!m) return null;
      const rows = await db.parts.where("managerId").equals(id).toArray();
      rows.sort((a, b) => a.koId - b.koId || a.building - b.building || a.number - b.number);
      const byB = new Map<string, ManagedBuilding>();
      const parts: ManagedPart[] = [];
      for (const r of rows) {
        const mp: ManagedPart = { koId: r.koId, building: r.building, part: r.number, eid: r.eid, buildingEid: r.buildingEid ?? "", use: r.use };
        parts.push(mp);
        const k = `${r.koId}:${r.building}`;
        let b = byB.get(k);
        if (!b) byB.set(k, (b = { koId: r.koId, number: r.building, eid: r.buildingEid ?? "", parts: [] }));
        b.parts.push(mp);
      }
      const { at: _at, ...manager } = m;
      return { manager: { ...manager, parts: manager.parts ?? parts.length }, parts, buildings: [...byB.values()] };
    },

    // --- buildings, parts, outlines ------------------------------------------------------------
    async putBuilding(b: Building, at = Date.now()) {
      await db.transaction("rw", [db.buildings, db.fetches], async () => {
        const old = await db.buildings.get([b.koId, b.number]);
        await db.buildings.put({ ...old, koId: b.koId, number: b.number, eid: b.eid, building: b, bbox: b.geometry ? bboxOf(b.geometry) : old?.bbox });
        await db.fetches.put({ key: fetchKeys.building(b.koId, b.number), at });
      });
    },
    async getBuilding(koId: number, number: number) { return (await db.buildings.get([koId, number]))?.building ?? null; },
    /** Replace the part list of one building (complete answer from GURS). */
    async putBuildingParts(koId: number, building: number, parts: BuildingPart[], at = Date.now()) {
      await db.transaction("rw", [db.buildings, db.parts, db.fetches], async () => {
        const b = await db.buildings.get([koId, building]);
        await db.parts.where("[koId+building]").equals([koId, building]).delete();
        await db.parts.bulkPut(parts.map((p) => partRow(koId, building, p, b?.eid ?? b?.building?.eid)));
        await db.fetches.put({ key: fetchKeys.parts(koId, building), at });
      });
    },
    /** Full part list, only when it is known to be complete (fetched or pinned). */
    async getBuildingParts(koId: number, building: number): Promise<BuildingPart[] | null> {
      const complete = (await db.fetches.get(fetchKeys.parts(koId, building))) || (await db.pins.get(koId));
      if (!complete) return null;
      const rows = await db.parts.where("[koId+building]").equals([koId, building]).toArray();
      if (rows.some((r) => !r.part)) return null;
      return rows.map((r) => r.part!).sort((a, b) => a.number - b.number);
    },
    async getOutlines(list: { koId: number; number: number }[]) {
      const rows = await db.buildings.bulkGet(list.map((b) => [b.koId, b.number] as [number, number]));
      return rows.filter((r): r is BuildingRow => !!r && !!(r.outline ?? r.building?.geometry));
    },
    async putOutlines(got: Map<string, Geometry>, at = Date.now()) {
      const keys = [...got.keys()].map((k) => k.split(":").map(Number) as [number, number]);
      await db.transaction("rw", db.buildings, async () => {
        const old = await db.buildings.bulkGet(keys);
        await db.buildings.bulkPut(keys.map(([koId, number], i) => {
          const g = got.get(`${koId}:${number}`)!;
          return { ...old[i], koId, number, outline: g, outlineAt: at, bbox: old[i]?.bbox ?? bboxOf(g) };
        }));
      });
    },

    // --- pins (offline KOs) ----------------------------------------------------------------------
    listPins: () => db.pins.orderBy("koId").toArray(),
    getPin: (koId: number) => db.pins.get(koId),
    async savePin(d: KoDownload, now = Date.now()): Promise<Pin> {
      const bytes = JSON.stringify(d).length;
      const pin: Pin = { koId: d.ko.id, name: d.ko.name, pinnedAt: now, parcels: d.parcels.length, buildings: d.buildings.length, parts: d.parts.length, bytes };
      await db.transaction("rw", [db.pins, db.parcels, db.buildings, db.parts, db.managers], async () => {
        await db.parcels.where("koId").equals(d.ko.id).delete();
        await db.parcels.bulkPut(d.parcels.map((p) => ({ koId: p.koId, number: p.number, bbox: bboxOf(p.geometry), parcel: p })));
        const old = new Map((await db.buildings.where("koId").equals(d.ko.id).toArray()).map((r) => [r.number, r]));
        await db.buildings.bulkPut(d.buildings.map((b) => ({ ...old.get(b.number), koId: b.koId, number: b.number, eid: b.eid, bbox: bboxOf(b.geometry), building: b })));
        const eid = new Map(d.buildings.map((b) => [b.number, b.eid]));
        await db.parts.where("koId").equals(d.ko.id).delete();
        await db.parts.bulkPut(d.parts.map((x) => partRow(d.ko.id, x.building, x.part, eid.get(x.building))));
        const ms = new Map<number, Manager>();
        for (const x of d.parts) if (x.part.manager) ms.set(x.part.manager.id, { id: x.part.manager.id, name: x.part.manager.name, address: null, parts: null });
        await store.putManagers([...ms.values()], now);
        await db.pins.put(pin);
      });
      return pin;
    },
    /** Unpin: parcels go (pins are their only source); buildings/parts stay as ordinary cached data. */
    async removePin(koId: number): Promise<void> {
      await db.transaction("rw", [db.pins, db.parcels], async () => {
        await db.parcels.where("koId").equals(koId).delete();
        await db.pins.delete(koId);
      });
    },
    async findParcel(koId: number, number: string) { return (await db.parcels.get([koId, number.trim()]))?.parcel ?? null; },
    async parcelAt(lon: number, lat: number) {
      const r = await db.parcels.filter((p) => inBox(p.bbox, lon, lat) && contains(p.parcel.geometry, lon, lat)).first();
      return r?.parcel ?? null;
    },
    findBuilding: (koId: number, number: number) => store.getBuilding(koId, number),
    async buildingAt(lon: number, lat: number) {
      const r = await db.buildings.filter((b) => !!b.building && inBox(b.bbox, lon, lat) && contains(b.building.geometry, lon, lat)).first();
      return r?.building ?? null;
    },
    buildingParts: async (koId: number, building: number) => (await store.getBuildingParts(koId, building)) ?? [],
    async saveKos(kos: Ko[]) { await db.transaction("rw", db.kos, async () => { await db.kos.clear(); await db.kos.bulkPut(kos); }); },
    async listKos(): Promise<Ko[]> {
      const all = await db.kos.orderBy("id").toArray();
      if (all.length) return all;
      return (await db.pins.orderBy("koId").toArray()).map((p) => ({ id: p.koId, name: p.name }));
    },

    // --- housekeeping ------------------------------------------------------------------------------
    /** Rows of cached (not pinned) data, for "clear caches". */
    async count() {
      const pinned = new Set((await db.pins.toArray()).map((p) => p.koId));
      const [m, f] = await Promise.all([db.managers.count(), db.fetches.count()]);
      const b = await db.buildings.filter((r) => !pinned.has(r.koId)).count();
      const p = await db.parts.filter((r) => !pinned.has(r.koId)).count();
      return m + f + b + p;
    },
    /** Drop cached data; pinned KOs (and their buildings/parts) stay. */
    async clear() {
      const pinned = [...new Set((await db.pins.toArray()).map((p) => p.koId))];
      await db.transaction("rw", cacheTables(), async () => {
        await db.fetches.clear();
        if (!pinned.length) { await db.managers.clear(); await db.buildings.clear(); await db.parts.clear(); return; }
        await db.buildings.where("koId").noneOf(pinned).delete();
        await db.parts.where("koId").noneOf(pinned).delete();
        const keep = new Set((await db.parts.toArray()).map((r) => r.managerId).filter((x): x is number => x != null));
        await db.managers.filter((m) => !keep.has(m.id)).delete();
      });
    },
  };
  return store;
}
export type GursStore = ReturnType<typeof createGursStore>;

/**
 * One-time move from the old layout (ikataster-offline tables + ikataster-cache key/value answers)
 * into ikataster-gurs. Pins are kept; the old answer cache is simply dropped (rebuilt on use).
 */
export async function migrateLegacyStores(target: GursStore, names = LEGACY_DATABASES): Promise<number> {
  let moved = 0;
  if (await Dexie.exists(names.offline)) {
    const src = new Dexie(names.offline);
    await src.open();
    const rows = async <T,>(t: string) => (src.tables.some((x) => x.name === t) ? ((await src.table(t).toArray()) as T[]) : []);
    const pins = await rows<Pin>("pins");
    const parcels = await rows<ParcelRow>("parcels");
    const buildings = await rows<{ koId: number; number: number; bbox: BBox; building: Building }>("buildings");
    const parts = await rows<{ koId: number; building: number; number: number; part: BuildingPart }>("parts");
    const kos = await rows<Ko>("kos");
    src.close();
    const db = target.db;
    await db.transaction("rw", [db.pins, db.parcels, db.buildings, db.parts, db.kos, db.managers], async () => {
      if (await db.pins.count()) return; // already migrated / new data wins
      const eid = new Map(buildings.map((b) => [`${b.koId}:${b.number}`, b.building.eid]));
      await db.parcels.bulkPut(parcels);
      await db.buildings.bulkPut(buildings.map((b) => ({ ...b, eid: b.building.eid })));
      await db.parts.bulkPut(parts.map((r) => partRow(r.koId, r.building, r.part, eid.get(`${r.koId}:${r.building}`))));
      await db.kos.bulkPut(kos);
      const ms = new Map<number, Manager>();
      for (const r of parts) if (r.part.manager) ms.set(r.part.manager.id, { id: r.part.manager.id, name: r.part.manager.name, address: null, parts: null });
      await target.putManagers([...ms.values()]);
      await db.pins.bulkPut(pins);
      moved = pins.length + parcels.length + buildings.length + parts.length;
    });
    await Dexie.delete(names.offline);
  }
  if (await Dexie.exists(names.cache)) await Dexie.delete(names.cache);
  return moved;
}
