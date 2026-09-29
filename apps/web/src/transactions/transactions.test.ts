import { describe, expect, it } from "vitest";
import { buildingTx, createTransactions, parcelTx, partTx, type KoTx } from ".";

const tx: KoTx = {
  ko: 999, date: "2026-09-27",
  s: { "1": ["2021-02-11", 120000, 1, 1, 1, 0], "2": ["2018-12-13", 65000, 1, 3, 2, 1], "3": ["2012-05-17", 20000, 1, 1, 0, 1] },
  sd: { "20/3": [[1, null, 60, 2, "1/1", "2"], [2, null, 40, 2, "1/1", ""]], "20/4": [[2, 30000, 15, 4, "1/2", ""]] },
  sp: { "100/1": [[3, null, 500, 7, "1/1"]] },
  r: { "9": ["2024-01-05", 600, 1, 1, "2024-02-01", ""] },
  rd: { "20/3": [[9, 600, 60, 2]] },
};

describe("transactions", () => {
  it("builds part history with €/m² only when the price is for this part alone", () => {
    const items = partTx(tx, 20, 3);
    expect(items.map((i) => [i.kind, i.date, i.price, i.wholeDeal, i.perM2])).toEqual([
      ["rent", "2024-01-05", 600, false, 10],
      ["sale", "2021-02-11", 120000, false, 2000],
      ["sale", "2018-12-13", 65000, true, null],
    ]);
  });

  it("does not compute €/m² for partial shares", () => {
    const [i] = partTx(tx, 20, 4);
    expect(i.price).toBe(30000);
    expect(i.perM2).toBeNull();
  });

  it("lists parcel sales and all building sales/rentals newest first", () => {
    expect(parcelTx(tx, "100/1")[0]).toMatchObject({ date: "2012-05-17", price: 20000, perM2: 40 });
    expect(buildingTx(tx, 20).map((i) => `${i.kind}:${i.part}`)).toEqual(["rent:3", "sale:3", "sale:3", "sale:4"]);
    expect(buildingTx(tx, 2)).toEqual([]);
  });

  it("fetches tx/ko/<ko>.json once and remembers missing KOs", async () => {
    const calls: string[] = [];
    const t = createTransactions({ name: `tx-${Math.random()}`, base: "https://data.example",
      fetch: (async (u: string) => { calls.push(u); return u.includes("/1.json") ? new Response("", { status: 404 }) : new Response(JSON.stringify(tx)); }) as unknown as typeof fetch });
    expect((await t.get(999))?.sd["20/3"]).toHaveLength(2);
    await t.get(999);
    expect(await t.get(1)).toBeNull();
    expect(await t.get(1)).toBeNull();
    expect(calls).toEqual(["https://data.example/tx/ko/999.json", "https://data.example/tx/ko/1.json"]);
  });
});
