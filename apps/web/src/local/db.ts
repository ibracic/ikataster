import { DATABASES, LEGACY_DATABASES } from "../data/inventory";
import Dexie, { type Table } from "dexie";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Geometry, Polygon, MultiPolygon } from "geojson";
import type { Building, BuildingPart, KoDownload, Ko, Parcel } from "../gurs";

/**
 * KOs kept on this device for offline use (pins): parcels, buildings and building parts of each KO from
 * the app's GURS copy, plus the KO list. (v1 also held an answer cache of GURS lookups — managers,
 * single buildings/parts, outlines, `fetches`; v2 drops it: the copy answers those directly.)
 */
export type BBox = [number, number, number, number];
export interface Pin { koId: number; name: string; pinnedAt: number; parcels: number; buildings: number; parts: number; bytes: number }
export interface ParcelRow { koId: number; number: string; bbox: BBox; parcel: Parcel }
export interface BuildingRow { koId: number; number: number; eid?: string | null; bbox?: BBox; building?: Building | null }
export interface PartRow { koId: number; building: number; number: number; eid: string; buildingEid?: string | null; use: string | null; managerId: number | null; part?: BuildingPart | null }

class GursDb extends Dexie {
  buildings!: Table<BuildingRow, [number, number]>;
  parts!: Table<PartRow, [number, number, number]>;
  parcels!: Table<ParcelRow, [number, string]>;
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
    // v2: the answer cache is gone. Drop its tables and every building/part row of a KO that is not pinned.
    this.version(2).stores({ managers: null, fetches: null }).upgrade(async (tx) => {
      const pinned = new Set((await tx.table("pins").toArray()).map((p: Pin) => p.koId));
      await tx.table("buildings").filter((r: BuildingRow) => !pinned.has(r.koId)).delete();
      await tx.table("parts").filter((r: PartRow) => !pinned.has(r.koId)).delete();
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


const partRow = (koId: number, building: number, p: BuildingPart, buildingEid?: string | null): PartRow =>
  ({ koId, building, number: p.number, eid: p.eid, buildingEid: buildingEid ?? null, use: p.use, managerId: p.manager?.id ?? null, part: p });

export function createGursStore(name: string = DATABASES.gurs.name) {
  const db = new GursDb(name);
  const store = {
    db,
    // --- pins (offline KOs) ----------------------------------------------------------------------
    listPins: () => db.pins.orderBy("koId").toArray(),
    getPin: (koId: number) => db.pins.get(koId),
    async savePin(d: KoDownload, now = Date.now()): Promise<Pin> {
      const bytes = JSON.stringify(d).length;
      const pin: Pin = { koId: d.ko.id, name: d.ko.name, pinnedAt: now, parcels: d.parcels.length, buildings: d.buildings.length, parts: d.parts.length, bytes };
      await db.transaction("rw", [db.pins, db.parcels, db.buildings, db.parts], async () => {
        await db.parcels.where("koId").equals(d.ko.id).delete();
        await db.parcels.bulkPut(d.parcels.map((p) => ({ koId: p.koId, number: p.number, bbox: bboxOf(p.geometry), parcel: p })));
        const old = new Map((await db.buildings.where("koId").equals(d.ko.id).toArray()).map((r) => [r.number, r]));
        await db.buildings.bulkPut(d.buildings.map((b) => ({ ...old.get(b.number), koId: b.koId, number: b.number, eid: b.eid, bbox: bboxOf(b.geometry), building: b })));
        const eid = new Map(d.buildings.map((b) => [b.number, b.eid]));
        await db.parts.where("koId").equals(d.ko.id).delete();
        await db.parts.bulkPut(d.parts.map((x) => partRow(d.ko.id, x.building, x.part, eid.get(x.building))));
        await db.pins.put(pin);
      });
      return pin;
    },
    /** Unpin: the KO's parcels, buildings and parts go with it. */
    async removePin(koId: number): Promise<void> {
      await db.transaction("rw", [db.pins, db.parcels, db.buildings, db.parts], async () => {
        await db.parcels.where("koId").equals(koId).delete();
        await db.buildings.where("koId").equals(koId).delete();
        await db.parts.where("koId").equals(koId).delete();
        await db.pins.delete(koId);
      });
    },
    async getBuilding(koId: number, number: number) { return (await db.buildings.get([koId, number]))?.building ?? null; },
    /** Part list of a building in a pinned KO; null when the KO is not on this device. */
    async getBuildingParts(koId: number, building: number): Promise<BuildingPart[] | null> {
      if (!(await db.pins.get(koId))) return null;
      const rows = await db.parts.where("[koId+building]").equals([koId, building]).toArray();
      return rows.filter((r) => r.part).map((r) => r.part!).sort((a, b) => a.number - b.number);
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
    /** Rows that are not part of a pinned KO (none since v2; kept for "clear caches"). */
    async count() {
      const pinned = new Set((await db.pins.toArray()).map((p) => p.koId));
      return (await db.buildings.filter((r) => !pinned.has(r.koId)).count()) + (await db.parts.filter((r) => !pinned.has(r.koId)).count());
    },
    /** Drop rows that don't belong to a pinned KO; pinned KOs stay. */
    async clear() {
      const pinned = new Set((await db.pins.toArray()).map((p) => p.koId));
      await db.transaction("rw", [db.buildings, db.parts], async () => {
        await db.buildings.filter((r) => !pinned.has(r.koId)).delete();
        await db.parts.filter((r) => !pinned.has(r.koId)).delete();
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
    await db.transaction("rw", [db.pins, db.parcels, db.buildings, db.parts, db.kos], async () => {
      if (await db.pins.count()) return; // already migrated / new data wins
      const eid = new Map(buildings.map((b) => [`${b.koId}:${b.number}`, b.building.eid]));
      await db.parcels.bulkPut(parcels);
      await db.buildings.bulkPut(buildings.map((b) => ({ ...b, eid: b.building.eid })));
      await db.parts.bulkPut(parts.map((r) => partRow(r.koId, r.building, r.part, eid.get(`${r.koId}:${r.building}`))));
      await db.kos.bulkPut(kos);
      await db.pins.bulkPut(pins);
      moved = pins.length + parcels.length + buildings.length + parts.length;
    });
    await Dexie.delete(names.offline);
  }
  if (await Dexie.exists(names.cache)) await Dexie.delete(names.cache);
  return moved;
}
