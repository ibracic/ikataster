import Dexie from "dexie";
// @vitest-environment node
import { createResultsStore, resultKey, groupResults, filterRecords, resultDays, type ResultRecord } from "./results";
import type { EzkExtract, Owner } from "./types";

const owner = (name: string, extra: Partial<Owner> = {}): Owner => ({
  positionId: 1, right: "101 - vknjižena lastninska pravica", share: "1/2", shareValue: 0.5,
  holder: { kind: "person", name, address: "Vzorčna ulica 001, 2250 Ptuj", birthDate: "1990-01-01" }, restrictions: [], ...extra,
});
const extract = (label: string, number: string, owners: Owner[], part?: number): EzkExtract => ({
  kind: "current", createdAt: "2026-09-28T22:43:06", pending: false, owners, rights: [], benefits: [],
  property: { type: part ? "part" : "parcel", koId: 999, koName: "VZORČNA VAS", number, ...(part ? { part } : {}), label },
});

describe("results store", () => {
  it("keys results like the cart, replaces older extracts of the same property", async () => {
    const s = createResultsStore(`res-${Date.now()}`);
    const a = extract("999 VZORČNA VAS 100/1", "100/1", [owner("Janez Novak")]);
    expect(resultKey(a)).toBe("parcel:999:100/1");
    expect(resultKey(extract("998 X 50/21", "50", [], 21))).toBe("part:999:50:21");
    await s.put(a, "a.pdf");
    await s.put({ ...a, owners: [owner("Ana Zupan")] }, "b.pdf");
    const all = await s.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ key: "parcel:999:100/1", fileName: "b.pdf" });
    await s.remove(["parcel:999:100/1"]);
    expect(await s.list()).toHaveLength(0);
  });
});

describe("results store change check", () => {
  it("records what changed when the same property is downloaded again", async () => {
    const s = createResultsStore(`chg-${Date.now()}`);
    const a = extract("999 VZORČNA VAS 100/1", "100/1", [owner("Janez Novak")]);
    await s.put(a, "a.pdf");
    expect((await s.list())[0].changes).toBeUndefined();
    await s.put({ ...a, createdAt: "2026-11-13T10:00:00" }, "a2.pdf");
    expect((await s.list())[0].changes).toMatchObject({ previousCreatedAt: "2026-09-28T22:43:06", items: [] });
    await s.put({ ...a, createdAt: "2026-11-14T10:00:00", owners: [owner("Ana Zupan")] }, "a3.pdf");
    const c = (await s.list())[0].changes!;
    expect(c.items.map((i) => i.kind)).toEqual(["ownerRemoved", "ownerAdded"]);
    await s.acknowledge(["parcel:999:100/1"]);
    expect((await s.list())[0].changes?.seen).toBe(true);
  });
});

describe("groupResults", () => {
  const recs: ResultRecord[] = [
    { key: "k1", fileName: "1.pdf", addedAt: 1, extract: extract("999 VZORČNA VAS 100/1", "100/1", [owner("Janez Novak"), owner("Marija Kranjc")]) },
    { key: "k2", fileName: "2.pdf", addedAt: 2, extract: extract("998 TESTNI KRAJ 50/21", "50", [owner("Marija Kranjc", { share: "1/1" })], 21) },
    { key: "k3", fileName: "3.pdf", addedAt: 3, extract: extract("999 VZORČNA VAS 1/1", "1/1", [{ ...owner("x"), holder: { kind: "company", name: "VZOREC d.o.o.", companyId: "1234567000" } }]) },
  ];
  it("groups owners by property in insertion order", () => {
    const g = groupResults(recs, "");
    expect(g.map((x) => x.record.key)).toEqual(["k1", "k2", "k3"]);
    expect(g[0].owners).toHaveLength(2);
    expect(g.reduce((n, x) => n + x.owners.length, 0)).toBe(4);
  });
  it("filters by owner name (case/diacritics-insensitive), company ID or address; hides empty groups", () => {
    expect(groupResults(recs, "kranjc").map((x) => [x.record.key, x.owners.length])).toEqual([["k1", 1], ["k2", 1]]);
    expect(groupResults(recs, "vzorcna").length).toBe(2);
    expect(groupResults(recs, "1234567").map((x) => x.record.key)).toEqual(["k3"]);
    expect(groupResults(recs, "nobody")).toEqual([]);
  });
});


describe("results store PDFs", () => {
  it("keeps original PDFs in a separate table, replaced/removed with the result", async () => {
    const s = createResultsStore(`res-pdf-${Date.now()}`);
    const a = extract("999 VZORČNA VAS 100/1", "100/1", [owner("Janez Novak")]);
    await s.put(a, "a.pdf", new Uint8Array([37, 80, 68, 70]));
    expect((await s.list())[0]).toMatchObject({ hasPdf: true });
    expect([...(await s.pdfs(["parcel:999:100/1", "nope"])).get("parcel:999:100/1")!]).toEqual([37, 80, 68, 70]);
    await s.put(a, "b.pdf");
    expect((await s.list())[0].hasPdf).toBe(false);
    expect((await s.pdfs(["parcel:999:100/1"])).size).toBe(0);
    await s.put(a, "c.pdf", new Uint8Array([1]));
    await s.remove(["parcel:999:100/1"]);
    expect((await s.pdfs(["parcel:999:100/1"])).size).toBe(0);
  });
});

describe("saved lists", () => {
  it("create, add several, remove, rename, delete (extracts stay); survives reopen", async () => {
    const name = `res-list-${Date.now()}`;
    const s = createResultsStore(name);
    await s.put(extract("999 VZORČNA VAS 100/1", "100/1", [owner("Janez Novak")]), "a.pdf");
    await s.put(extract("998 X 50/21", "50", [owner("Ana Zupan")], 21), "b.pdf");
    const [a, b] = (await s.list()).map((r) => r.key);
    const id = await s.createList("  Stavba 50  ", [b]);
    await expect(s.createList("  ", [a])).rejects.toThrow();
    expect(await s.addToList(id, [a, b])).toBe(1);
    s.db.close();
    const s2 = createResultsStore(name);
    expect(await s2.savedLists()).toEqual([expect.objectContaining({ id, name: "Stavba 50", keys: [b, a] })]);
    await s2.removeFromList(id, [b]);
    await s2.renameList(id, "Novak");
    expect((await s2.savedLists())[0]).toMatchObject({ name: "Novak", keys: [a] });
    await s2.deleteList(id);
    expect(await s2.savedLists()).toEqual([]);
    expect(await s2.list()).toHaveLength(2);
  });

  it("migrates old folders to lists without losing extracts that were only in a folder", async () => {
    const name = `res-mig-${Date.now()}`;
    const old = new Dexie(name);
    old.version(3).stores({ results: "key, addedAt", pdfs: "key", folders: "id, updatedAt", folderItems: "[folderId+key], folderId", folderPdfs: "[folderId+key], folderId" });
    const rec = (key: string) => ({ key, fileName: "x.pdf", addedAt: 1, extract: extract("999 X 1", "1", []) });
    await old.table("results").put(rec("parcel:999:1"));
    await old.table("folders").put({ id: "f1", name: "Stranka", createdAt: 1, updatedAt: 2, count: 2 });
    await old.table("folderItems").bulkPut([{ folderId: "f1", key: "parcel:999:1", record: rec("parcel:999:1") }, { folderId: "f1", key: "parcel:999:2", record: rec("parcel:999:2") }]);
    await old.table("folderPdfs").put({ folderId: "f1", key: "parcel:999:2", bytes: new Uint8Array([7]) });
    old.close();
    const s = createResultsStore(name);
    expect(await s.savedLists()).toEqual([expect.objectContaining({ id: "f1", name: "Stranka", keys: ["parcel:999:1", "parcel:999:2"] })]);
    expect((await s.list()).map((r) => r.key).sort()).toEqual(["parcel:999:1", "parcel:999:2"]);
    expect([...(await s.pdfs(["parcel:999:2"])).get("parcel:999:2")!]).toEqual([7]);
    expect(await s.db.folderItems.count()).toBe(0);
  });
});

describe("filterRecords (export scope)", () => {
  const at = (d: string) => new Date(`${d}T12:00:00+01:00`).getTime();
  const r = (key: string, day: string) => ({ key, fileName: "x.pdf", addedAt: at(day), extract: extract("999 X 1", "1", []) }) as ResultRecord;
  const recs = [r("part:392:572:4", "2026-11-21"), r("part:392:572:5", "2026-11-21"), r("building:392:573", "2026-11-18"),
    r("parcel:392:572/4", "2026-11-18"), r("parcel:532:572", "2026-11-21")];
  const keys = (f: Parameters<typeof filterRecords>[1]) => filterRecords(recs, f).map((x) => x.key);
  it("narrows by KO, building/parcel number and download day", () => {
    expect(keys({})).toHaveLength(5);
    expect(keys({ ko: 392 })).toEqual(["part:392:572:4", "part:392:572:5", "building:392:573", "parcel:392:572/4"]);
    expect(keys({ ko: 392, number: "572" })).toEqual(["part:392:572:4", "part:392:572:5"]);
    expect(keys({ number: "572/4" })).toEqual(["part:392:572:4", "parcel:392:572/4"]);
    expect(keys({ day: "2026-11-18" })).toEqual(["building:392:573", "parcel:392:572/4"]);
    expect(keys({ number: " 572 ", day: "2026-11-21" })).toEqual(["part:392:572:4", "part:392:572:5", "parcel:532:572"]);
  });
  it("lists download days newest first with counts", () => {
    expect(resultDays(recs)).toEqual([["2026-11-21", 3], ["2026-11-18", 2]]);
  });
});
