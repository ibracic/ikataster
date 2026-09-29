import { createResultsStore, resultKey, groupResults, type ResultRecord } from "./results";
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

describe("saved folders", () => {
  it("save, list, rename, open (exact copy incl. PDFs), overwrite and delete; survive reopen of the DB", async () => {
    const name = `res-fold-${Date.now()}`;
    const s = createResultsStore(name);
    const a = extract("999 VZORČNA VAS 100/1", "100/1", [owner("Janez Novak")]);
    const b = extract("998 X 50/21", "50", [owner("Ana Zupan")], 21);
    await s.put(a, "a.pdf", new Uint8Array([37, 80, 68, 70, 1]));
    await s.put(b, "b.pdf");
    const before = await s.list();

    const id = await s.saveFolder("  Stranka Novak  ");
    await expect(s.saveFolder("   ")).rejects.toThrow();
    expect(await s.listFolders()).toEqual([expect.objectContaining({ id, name: "Stranka Novak", count: 2 })]);

    // change current results, then reopen the folder -> identical to the snapshot
    await s.clear();
    await s.put(extract("1 A 1", "1", [owner("X")]), "x.pdf");
    s.db.close();
    const s2 = createResultsStore(name); // "reload"
    expect(await s2.openFolder(id)).toBe(2);
    expect(await s2.list()).toEqual(before);
    expect([...(await s2.pdfs([before[0].key])).get(before[0].key)!]).toEqual([37, 80, 68, 70, 1]);

    await s2.renameFolder(id, "Novak 2026");
    // overwrite with a smaller set
    await s2.remove([before[1].key]);
    expect(await s2.saveFolder("Novak 2026", id)).toBe(id);
    const [f] = await s2.listFolders();
    expect(f).toMatchObject({ name: "Novak 2026", count: 1 });
    expect(f.createdAt).toBeLessThanOrEqual(f.updatedAt);

    await s2.deleteFolder(id);
    expect(await s2.listFolders()).toEqual([]);
    expect(await s2.db.folderItems.count()).toBe(0);
    expect(await s2.db.folderPdfs.count()).toBe(0);
    await expect(s2.openFolder(id)).rejects.toThrow("Folder not found");
  });
});
