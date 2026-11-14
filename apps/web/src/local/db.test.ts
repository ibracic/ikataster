import Dexie from "dexie";
import { createGursStore, migrateLegacyStores } from "./db";
import type { BuildingPart } from "../gurs";
import { restoreBackup, BACKUP_FORMAT } from "../data/backup";

let n = 0;
const mk = () => createGursStore(`gurs-test-${++n}`);
const part = (num: number, managerId: number | null, extra: Partial<BuildingPart> = {}): BuildingPart =>
  ({ eid: `e${num}`, number: num, use: "stanovanje", area: 50, usableArea: 45, floor: "1", elevator: null, condominium: true,
     manager: managerId ? { id: managerId, name: `M${managerId}`, status: null } : null, ...extra });

describe("GURS store (offline KOs)", () => {
  it("v2 upgrade drops the old answer cache and keeps pinned KOs", async () => {
    const name = `gurs-v1-${++n}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ managers: "&id, name", buildings: "[koId+number], koId", parts: "[koId+building+number], [koId+building], koId, managerId",
      parcels: "[koId+number], koId", fetches: "&key, at", pins: "&koId", kos: "&id" });
    await v1.open();
    await v1.table("pins").put({ koId: 3, name: "Z", pinnedAt: 1, parcels: 0, buildings: 1, parts: 1, bytes: 1 });
    await v1.table("buildings").bulkPut([{ koId: 3, number: 4, building: { eid: "B4" } }, { koId: 9, number: 1, building: { eid: "X" } }]);
    await v1.table("parts").bulkPut([{ koId: 3, building: 4, number: 1, part: part(1, 7) }, { koId: 9, building: 1, number: 1, part: part(1, 7) }]);
    await v1.table("managers").put({ id: 7, name: "M7", at: 1 });
    await v1.table("fetches").put({ key: "parts2:9:1", at: 1 });
    v1.close();
    const s = createGursStore(name);
    await s.db.open();
    expect(s.db.tables.map((t) => t.name).sort()).toEqual(["buildings", "kos", "parcels", "parts", "pins"]);
    expect(await s.db.buildings.count()).toBe(1);
    expect(await s.getBuildingParts(3, 4)).toHaveLength(1);
    expect(await s.getBuildingParts(9, 1)).toBeNull();
  });

  it("removing a pin removes its parcels, buildings and parts", async () => {
    const s = mk();
    await s.savePin({ ko: { id: 5, name: "K" }, parcels: [], buildings: [{ eid: "B1", koId: 5, koName: "K", number: 1, geometry: { type: "Point", coordinates: [0, 0] } } as never],
      parts: [{ building: 1, part: part(1, null) }] });
    expect(await s.getBuildingParts(5, 1)).toHaveLength(1);
    await s.removePin(5);
    expect(await s.db.buildings.count()).toBe(0);
    expect(await s.db.parts.count()).toBe(0);
  });

  it("migrates the old ikataster-offline pins and drops the old answer cache", async () => {
    const o = `old-off-${n}`, c = `old-cache-${n}`;
    const old = new Dexie(o);
    old.version(1).stores({ pins: "&koId", parcels: "[koId+number], koId", buildings: "[koId+number], koId", parts: "[koId+building+number], [koId+building], koId", kos: "&id" });
    await old.table("pins").put({ koId: 3, name: "Z", pinnedAt: 1, parcels: 0, buildings: 1, parts: 1, bytes: 1 });
    await old.table("buildings").put({ koId: 3, number: 4, bbox: [0, 0, 1, 1], building: { eid: "B4", koId: 3, number: 4 } });
    await old.table("parts").put({ koId: 3, building: 4, number: 1, part: part(1, 77) });
    old.close();
    const oc = new Dexie(c); oc.version(1).stores({ entries: "&key" }); await oc.open(); oc.close();
    const s = mk();
    await migrateLegacyStores(s, { offline: o, cache: c });
    expect(await Dexie.exists(o)).toBe(false);
    expect(await Dexie.exists(c)).toBe(false);
    expect((await s.db.parts.get([3, 4, 1]))).toMatchObject({ managerId: 77, buildingEid: "B4" });
    expect(await s.getBuildingParts(3, 4)).toHaveLength(1);
  });

  it("restores a v1 backup whose GURS data was called 'offline'", async () => {
    const s = mk();
    await restoreBackup({ format: BACKUP_FORMAT, version: 1, createdAt: "", local: {},
      dbs: { offline: { pins: [{ koId: 3, name: "Z", pinnedAt: 1, parcels: 0, buildings: 0, parts: 1, bytes: 1 }], parts: [{ koId: 3, building: 4, number: 1, part: part(1, 8) }] } } }, { gurs: s.db }, null);
    expect(await s.db.parts.where("managerId").equals(8).count()).toBe(1);
  });
});
