import "fake-indexeddb/auto";
import type { Geometry } from "geojson";
import { createCartStore, itemKey, type CartInput } from "./store";

const poly: Geometry = { type: "Polygon", coordinates: [[[15.6, 46.5], [15.61, 46.5], [15.61, 46.51], [15.6, 46.5]]] };
const parcel: CartInput = { kind: "parcel", koId: 657, koName: "MARIBOR GRAD", number: "1587", eid: "p1", geometry: poly };
const building: CartInput = { kind: "building", koId: 657, koName: "MARIBOR GRAD", number: "130", eid: "b1", geometry: poly };
const part = (n: number): CartInput => ({ kind: "part", koId: 657, koName: "MARIBOR GRAD", number: "130", part: n, eid: `d${n}`, geometry: poly });

let n = 0;
const fresh = () => createCartStore(`cart-test-${++n}`);

describe("cart store", () => {
  it("keys items by kind, KO, number and part", () => {
    expect(itemKey(parcel)).toBe("parcel:657:1587");
    expect(itemKey(building)).toBe("building:657:130");
    expect(itemKey(part(2))).toBe("part:657:130:2");
  });

  it("adds parcels, buildings and building parts in insertion order", async () => {
    const s = fresh();
    expect(await s.add([parcel])).toBe(1);
    expect(await s.add([building, part(2), part(3)])).toBe(3);
    const items = await s.list();
    expect(items.map((i) => i.key)).toEqual(["parcel:657:1587", "building:657:130", "part:657:130:2", "part:657:130:3"]);
    expect(items[0].addedAt).toBeGreaterThan(0);
  });

  it("prevents duplicates, also within one batch", async () => {
    const s = fresh();
    await s.add([parcel]);
    expect(await s.add([parcel, part(2), part(2)])).toBe(1);
    expect(await s.count()).toBe(2);
  });

  it("persists across store instances (reload)", async () => {
    const name = `cart-persist-${Date.now()}`;
    await createCartStore(name).add([parcel, building]);
    const again = createCartStore(name);
    expect((await again.list()).map((i) => i.key)).toEqual(["parcel:657:1587", "building:657:130"]);
    expect(await again.has("building:657:130")).toBe(true);
  });

  it("removes single items and clears everything", async () => {
    const s = fresh();
    await s.add([parcel, building, part(1)]);
    await s.remove(["building:657:130"]);
    expect((await s.list()).map((i) => i.key)).toEqual(["parcel:657:1587", "part:657:130:1"]);
    await s.clear();
    expect(await s.count()).toBe(0);
  });
});
