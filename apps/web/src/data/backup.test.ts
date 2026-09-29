import { describe, expect, it } from "vitest";
import { createCartStore } from "../cart/store";
import { createResultsStore } from "../ezk/results";
import type { EzkExtract } from "../ezk/types";
import { exportBackup, readBackup, restoreBackup, collectBackup, BackupError } from "./backup";
import { ensurePersisted, storageInfo } from "./storage";

const mem = () => { const m = new Map<string, string>(); return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() } as Storage; };
const x = (n: string): EzkExtract => ({
  kind: "current", createdAt: "2026-09-28T10:00:00", pending: false, rights: [], benefits: [],
  owners: [{ positionId: 1, right: "101", share: "1/1", shareValue: 1, holder: { kind: "company", name: "ACME d.o.o.", address: "Maribor", companyId: "1" }, restrictions: [] }],
  property: { type: "parcel", koId: 657, koName: "MARIBOR GRAD", number: n, label: `657 ${n}` },
} as EzkExtract);

async function seed(tag: string) {
  const cart = createCartStore(`bk-cart-${tag}`), res = createResultsStore(`bk-res-${tag}`);
  await cart.add([{ kind: "parcel", koId: 657, koName: "MARIBOR GRAD", number: "1587", eid: "E1", geometry: { type: "Point", coordinates: [15.6, 46.5] } }]);
  await res.put(x("1"), "1.pdf", new Uint8Array([37, 80, 68, 70, 0, 255]));
  await res.put(x("2"), "2.pdf");
  await res.saveFolder("Mapa A");
  return { cart, res };
}

describe("backup/restore", () => {
  it("round-trips all IndexedDB data (incl. PDFs and folders) and settings into empty stores", async () => {
    const a = await seed(`a${Date.now()}`);
    const lsA = mem(); lsA.setItem("ikataster.lang", "en"); lsA.setItem("ikataster.kos.v1", "cache"); lsA.setItem("mantine-color-scheme-value", "dark"); lsA.setItem("other", "x");
    const { zip, fileName, summary } = await exportBackup({ cart: a.cart.db, results: a.res.db }, lsA, new Date("2026-09-29T08:00:00Z"));
    expect(fileName).toBe("ikataster-varnostna-kopija-2026-09-29.zip");
    expect(summary.tables).toMatchObject({ "cart.items": 1, "results.results": 2, "results.pdfs": 1, "results.folders": 1, "results.folderItems": 2, "results.folderPdfs": 1 });
    expect(summary.local).toBe(2); // lang + color scheme; KO cache and foreign keys skipped

    const b = { cart: createCartStore(`bk-cart-b${Date.now()}`), res: createResultsStore(`bk-res-b${Date.now()}`) };
    await b.cart.add([{ kind: "parcel", koId: 1, koName: "X", number: "9", eid: "Z", geometry: null }]); // gets replaced
    const lsB = mem(); lsB.setItem("ikataster.lang", "sl");
    await restoreBackup(readBackup(zip), { cart: b.cart.db, results: b.res.db }, lsB);

    const before = await collectBackup({ cart: a.cart.db, results: a.res.db }, lsA);
    const after = await collectBackup({ cart: b.cart.db, results: b.res.db }, lsB);
    expect(after.dbs).toEqual(before.dbs);
    expect(after.local).toEqual(before.local);
    expect([...(await b.res.pdfs(["parcel:657:1"])).get("parcel:657:1")!]).toEqual([37, 80, 68, 70, 0, 255]);
    expect(await b.res.openFolder((await b.res.listFolders())[0].id)).toBe(2);
  });

  it("rejects files that are not backups", () => {
    expect(() => readBackup(new TextEncoder().encode('{"hello":1}'))).toThrow(BackupError);
    expect(() => readBackup(new Uint8Array([0x50, 0x4b, 1, 2]))).toThrow(BackupError);
    try { readBackup(new TextEncoder().encode(JSON.stringify({ format: "ikataster-backup", version: 99, dbs: {} }))); } catch (e) { expect((e as BackupError).reason).toBe("newer-version"); }
  });
});

describe("persistent storage", () => {
  it("asks for persistence only once and reports usage", async () => {
    let asked = 0; let persisted = false;
    const nav = { storage: { persist: async () => { asked++; persisted = true; return true; }, persisted: async () => persisted, estimate: async () => ({ usage: 1234, quota: 10_000 }) } };
    const ls = mem();
    expect(await ensurePersisted(nav, ls)).toBe(true);
    expect(await ensurePersisted(nav, ls)).toBe(true);
    expect(asked).toBe(1);
    expect(await storageInfo(nav)).toEqual({ supported: true, persisted: true, usage: 1234, quota: 10_000 });
    const denied = { storage: { persist: async () => { asked++; return false; }, persisted: async () => false, estimate: async () => ({}) } };
    const ls2 = mem();
    expect(await ensurePersisted(denied, ls2)).toBe(false);
    expect(await ensurePersisted(denied, ls2)).toBe(false); // not asked again
    expect(asked).toBe(2);
    expect(await storageInfo({})).toMatchObject({ supported: false });
  });
});
