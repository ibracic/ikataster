import { createCacheStore } from "./store";
import { cacheKeys, knownManagers, matchManagers, withCache } from "./withCache";
import { GursError, type GursClient, type ManagerPortfolio } from "../gurs";

const sq = (x: number) => ({ type: "Polygon" as const, coordinates: [[[x, 46], [x + 1, 46], [x, 47], [x, 46]]] });
const portfolio: ManagerPortfolio = {
  manager: { id: 617, name: "INDOMA", address: null, parts: 3 },
  parts: [],
  buildings: [
    { koId: 657, number: 1, eid: "A", parts: [{ koId: 657, building: 1, part: 1, eid: "a1", buildingEid: "A", use: null }, { koId: 657, building: 1, part: 2, eid: "a2", buildingEid: "A", use: null }] },
    { koId: 606, number: 9, eid: "B", parts: [{ koId: 606, building: 9, part: 1, eid: "b1", buildingEid: "B", use: null }] },
  ],
};
portfolio.parts = portfolio.buildings.flatMap((b) => b.parts);

let n = 0;
function setup() {
  const calls = { search: 0, portfolio: 0, outlines: [] as string[][], building: 0, parts: 0 };
  let down = false;
  const fail = () => { throw new GursError("network", "down"); };
  const base = {
    searchManagers: async () => { calls.search++; if (down) fail(); return { managers: [portfolio.manager], truncated: false }; },
    managerPortfolio: async () => { calls.portfolio++; if (down) fail(); return portfolio; },
    buildingOutlines: async (list: { koId: number; number: number }[]) => { calls.outlines.push(list.map((b) => `${b.koId}:${b.number}`)); if (down) fail(); return new Map(list.map((b) => [`${b.koId}:${b.number}`, sq(b.number)])); },
    findBuilding: async (ko: number, num: number) => { calls.building++; if (down) fail(); return { koId: ko, number: num } as never; },
    buildingParts: async () => { calls.parts++; if (down) fail(); return [{ number: 1 }] as never; },
  } as unknown as GursClient;
  let t = 1_000_000;
  const store = createCacheStore(`cache-test-${++n}`);
  const client = withCache(base, store, { now: () => t, ttlMs: 1000, outlineTtlMs: 5000 });
  return { client, store, calls, tick: (ms: number) => { t += ms; }, setDown: (v: boolean) => { down = v; } };
}

describe("withCache (local answers for slow GURS queries)", () => {
  it("manager search: second identical query (case/space-insensitive) never reaches GURS", async () => {
    const { client, calls } = setup();
    await client.searchManagers("Indoma");
    const r = await client.searchManagers("  indoma ");
    expect(r.managers[0].name).toBe("INDOMA");
    expect(calls.search).toBe(1);
  });

  it("portfolio is fetched once; KO filter is applied locally", async () => {
    const { client, calls } = setup();
    expect((await client.managerPortfolio(617))!.buildings).toHaveLength(2);
    const ko = await client.managerPortfolio(617, { koId: 606 });
    expect(ko!.buildings.map((b) => b.number)).toEqual([9]);
    expect(ko!.parts).toHaveLength(1);
    expect(calls.portfolio).toBe(1);
  });

  it("stale answers are refreshed, but still served when GURS is down", async () => {
    const { client, calls, tick, setDown } = setup();
    await client.managerPortfolio(617);
    tick(2000);
    await client.managerPortfolio(617);
    expect(calls.portfolio).toBe(2);
    tick(2000); setDown(true);
    expect((await client.managerPortfolio(617))!.manager.name).toBe("INDOMA");
  });

  it("errors without a cached answer still surface", async () => {
    const { client, setDown } = setup();
    setDown(true);
    await expect(client.managerPortfolio(617)).rejects.toBeInstanceOf(GursError);
  });

  it("outlines: only missing ones go to GURS", async () => {
    const { client, calls } = setup();
    await client.buildingOutlines([{ koId: 657, number: 1 }]);
    const m = await client.buildingOutlines([{ koId: 657, number: 1 }, { koId: 606, number: 9 }]);
    expect([...m.keys()].sort()).toEqual(["606:9", "657:1"]);
    expect(calls.outlines).toEqual([["657:1"], ["606:9"]]);
    await client.buildingOutlines([{ koId: 657, number: 1 }, { koId: 606, number: 9 }]);
    expect(calls.outlines).toHaveLength(2);
  });

  it("building + parts opened again come from the cache", async () => {
    const { client, calls, store } = setup();
    await client.findBuilding(657, 1); await client.buildingParts(657, 1);
    await client.findBuilding(657, 1); await client.buildingParts(657, 1);
    expect([calls.building, calls.parts]).toEqual([1, 1]);
    expect(await store.get(cacheKeys.building(657, 1))).toBeTruthy();
  });

  it("empty manager search results are not cached (typo today, data tomorrow)", async () => {
    const { store } = setup();
    const base = { searchManagers: async () => ({ managers: [], truncated: false }) } as unknown as GursClient;
    const c = withCache(base, store);
    await c.searchManagers("nobody");
    expect(await store.get(cacheKeys.managerSearch("nobody"))).toBeUndefined();
  });

  it("a saved complete shorter search answers a longer one locally ('indo' -> 'indoma')", async () => {
    const { store } = setup();
    let calls = 0;
    const base = { searchManagers: async (q: string) => { calls++; return { managers: [{ id: 1, name: "INDOMA d.o.o.", address: null, parts: 5 }, { id: 2, name: "INDOOR", address: null, parts: 1 }].filter((m) => m.name.toLowerCase().includes(q)), truncated: false }; } } as unknown as GursClient;
    const c = withCache(base, store);
    await c.searchManagers("indo");
    const r = await c.searchManagers("Indoma");
    expect(r.managers.map((m) => m.id)).toEqual([1]);
    expect(calls).toBe(1);
  });

  it("a truncated shorter search is not reused", async () => {
    const { store } = setup();
    let calls = 0;
    const base = { searchManagers: async () => { calls++; return { managers: [{ id: 1, name: "INDOMA", address: null, parts: 5 }], truncated: true }; } } as unknown as GursClient;
    const c = withCache(base, store);
    await c.searchManagers("ind");
    await c.searchManagers("indoma");
    expect(calls).toBe(2);
  });

  it("remembers every manager seen in searches, portfolios and building parts", async () => {
    const { client, store } = setup();
    const base = { buildingParts: async () => [{ manager: { id: 99, name: "DOMPLAN d.d.", status: null } }, { manager: { id: 99, name: "DOMPLAN d.d.", status: null } }] } as unknown as GursClient;
    await client.searchManagers("indoma");
    await withCache(base, store).buildingParts(1, 2);
    const all = await knownManagers(store);
    expect(all.map((m) => m.name)).toEqual(["INDOMA", "DOMPLAN d.d."]);
    expect(matchManagers(all, "domp").map((m) => m.id)).toEqual([99]);
    expect(all[0].parts).toBe(3); // count from the search is kept
  });
});
