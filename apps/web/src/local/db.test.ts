import Dexie from "dexie";
import { createGursStore, migrateLegacyStores } from "./db";
import type { BuildingPart } from "../gurs";
import { restoreBackup, BACKUP_FORMAT } from "../data/backup";

let n = 0;
const mk = () => createGursStore(`gurs-test-${++n}`);
const part = (num: number, managerId: number | null, extra: Partial<BuildingPart> = {}): BuildingPart =>
  ({ eid: `e${num}`, number: num, use: "stanovanje", area: 50, usableArea: 45, floor: "1", elevator: null, condominium: true,
     manager: managerId ? { id: managerId, name: `M${managerId}`, status: null } : null, ...extra });
const mp = (b: number, p: number) => ({ koId: 657, building: b, part: p, eid: `e${p}`, buildingEid: `B${b}`, use: "stanovanje" });

describe("relational GURS store", () => {
  it("each part is stored once: portfolio + building details share the row, portfolio is an index lookup", async () => {
    const s = mk();
    await s.putBuildingParts(657, 1, [part(1, 617), part(2, 9), part(3, 617)]);
    await s.putPortfolio({ id: 617, name: "INDOMA", address: "Maribor", parts: 2 }, [{ koId: 657, number: 1, eid: "B1", parts: [mp(1, 1), mp(1, 3)] }]);
    expect(await s.db.parts.count()).toBe(3);
    const p = (await s.portfolio(617))!;
    expect(p.buildings.map((b) => [b.number, b.parts.map((x) => x.part)])).toEqual([[1, [1, 3]]]);
    expect((await s.getBuildingParts(657, 1))!.map((x) => x.area)).toEqual([50, 50, 50]); // full attributes kept
  });

  it("refreshing a portfolio releases parts the manager no longer manages", async () => {
    const s = mk();
    const m = { id: 617, name: "INDOMA", address: null, parts: null };
    await s.putPortfolio(m, [{ koId: 657, number: 1, eid: "B1", parts: [mp(1, 1), mp(1, 2)] }]);
    await s.putPortfolio(m, [{ koId: 657, number: 1, eid: "B1", parts: [mp(1, 2)] }]);
    expect((await s.portfolio(617))!.parts.map((x) => x.part)).toEqual([2]);
    expect((await s.db.parts.get([657, 1, 1]))!.managerId).toBeNull();
  });

  it("building parts from a portfolio alone are not treated as the complete list", async () => {
    const s = mk();
    await s.putPortfolio({ id: 1, name: "X", address: null, parts: null }, [{ koId: 657, number: 5, eid: "B5", parts: [mp(5, 1)] }]);
    expect(await s.getBuildingParts(657, 5)).toBeNull();
  });

  it("managers upsert never loses known address/part count", async () => {
    const s = mk();
    await s.putManagers([{ id: 1, name: "A", address: "Kranj", parts: 10 }]);
    await s.putManagers([{ id: 1, name: "A", address: null, parts: null }]);
    expect(await s.db.managers.get(1)).toMatchObject({ address: "Kranj", parts: 10 });
  });

  it("clear keeps pinned KOs, drops everything else", async () => {
    const s = mk();
    await s.putBuildingParts(1, 1, [part(1, 5)]);
    await s.savePin({ ko: { id: 2, name: "K" }, parcels: [], buildings: [], parts: [{ building: 7, part: part(1, 6) }] });
    await s.put("search:x", { ids: [], truncated: false });
    await s.clear();
    expect(await s.db.parts.toArray()).toHaveLength(1);
    expect((await s.db.managers.toArray()).map((m) => m.id)).toEqual([6]);
    expect(await s.db.fetches.count()).toBe(0);
    expect(await s.getBuildingParts(2, 7)).toHaveLength(1); // pinned KO = complete
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
    expect(await s.db.managers.get(77)).toBeTruthy();
  });

  it("restores a v1 backup whose GURS data was called 'offline'", async () => {
    const s = mk();
    await restoreBackup({ format: BACKUP_FORMAT, version: 1, createdAt: "", local: {},
      dbs: { offline: { pins: [{ koId: 3, name: "Z", pinnedAt: 1, parcels: 0, buildings: 0, parts: 1, bytes: 1 }], parts: [{ koId: 3, building: 4, number: 1, part: part(1, 8) }] } } }, { gurs: s.db }, null);
    expect(await s.db.parts.where("managerId").equals(8).count()).toBe(1);
  });
});
