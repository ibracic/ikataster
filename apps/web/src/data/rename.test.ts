import Dexie from "dexie";
import { createCartStore } from "../cart/store";
import { createResultsStore } from "../ezk/results";
import { migrateDatabases, migrateLocalStorage } from "./rename";

it("moves parcela.* settings to ikataster.* without overwriting newer values", () => {
  localStorage.clear();
  localStorage.setItem("parcela.lang", "en");
  localStorage.setItem("parcela.bridge", "mock");
  localStorage.setItem("ikataster.bridge", "extension");
  localStorage.setItem("parcela.kos.v1", "cache");
  expect(migrateLocalStorage(localStorage)).toBe(3);
  expect(localStorage.getItem("ikataster.lang")).toBe("en");
  expect(localStorage.getItem("ikataster.bridge")).toBe("extension");
  expect(localStorage.getItem("ikataster.kos.v1")).toBeNull();
  expect(Object.keys(localStorage).filter((k) => k.startsWith("parcela."))).toEqual([]);
});

it("copies the old IndexedDB databases into the new names, including PDFs, then deletes the old ones", async () => {
  const t = Date.now();
  const oldCart = createCartStore(`parcela-${t}`), oldRes = createResultsStore(`parcela-results-${t}`);
  await oldCart.add([{ kind: "parcel", koId: 657, koName: "MARIBOR GRAD", number: "1587", eid: "E", geometry: null }]);
  const x = { kind: "current", createdAt: "2026-09-29T10:00:00", pending: false, owners: [], rights: [], benefits: [],
    property: { type: "parcel", koId: 657, koName: "M", number: "1587", label: "657 1587" } } as never;
  await oldRes.put(x, "a.pdf", new Uint8Array([37, 80, 68, 70]));
  oldCart.db.close(); oldRes.db.close();
  const renames: [string, string][] = [[`parcela-${t}`, `ikataster-${t}`], [`parcela-results-${t}`, `ikataster-results-${t}`]];
  const target = (n: string) => (n.includes("results") ? createResultsStore(n).db : createCartStore(n).db);
  expect(await migrateDatabases(renames, target)).toBe(3); // cart item + result + its PDF
  expect(await Dexie.exists(`parcela-${t}`)).toBe(false);
  const cart = createCartStore(`ikataster-${t}`), res = createResultsStore(`ikataster-results-${t}`);
  expect((await cart.list()).map((i) => i.key)).toEqual(["parcel:657:1587"]);
  const pdf = (await res.db.table("pdfs").toArray())[0];
  expect(Array.from(pdf.bytes)).toEqual([37, 80, 68, 70]);
  // idempotent: nothing left to migrate
  expect(await migrateDatabases(renames, target)).toBe(0);
});
