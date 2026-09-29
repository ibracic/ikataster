import { describe, expect, it } from "vitest";
import { createGursClient } from "./client";
import { likeLiteral } from "./managers";

type Row = Record<string, number | string>;
/** Tiny fake GURS WFS: evaluates the CQL subset we emit, caps at `count`, shuffles like unsorted GeoServer. */
function fakeWfs(rows: Row[], log: string[] = []) {
  const test = (cql: string) => (r: Row) => cql.split(" AND ").reduce<[boolean, string | null]>(([ok, pend], part) => {
    if (pend) { // second half of "F BETWEEN a AND b"
      const [f, a] = pend.split("|"); return [ok && Number(r[f]) >= Number(a) && Number(r[f]) <= Number(part), null];
    }
    let m;
    if ((m = /^(\w+) BETWEEN (\d+)$/.exec(part))) return [ok, `${m[1]}|${m[2]}`];
    if ((m = /^(\w+)=(\d+)$/.exec(part))) return [ok && Number(r[m[1]]) === Number(m[2]), null];
    if ((m = /^(\w+) IN \(([\d,]+)\)$/.exec(part))) return [ok && m[2].split(",").map(Number).includes(Number(r[m[1]])), null];
    if ((m = /^NAZIV ILIKE '%(.+)%'$/.exec(part))) return [ok && String(r.NAZIV).toLowerCase().includes(m[1].toLowerCase()), null];
    throw new Error("cql? " + part);
  }, [true, null])[0];
  const fn = async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    const cql = u.searchParams.get("cql_filter") ?? "";
    log.push(cql);
    const matched = rows.filter(test(cql)).sort(() => Math.random() - 0.5);
    const count = Number(u.searchParams.get("count") ?? 300);
    const obris = u.searchParams.get("typeNames") === "SI.GURS.KN:STAVBE_OBRIS";
    const feats = matched.slice(0, count).map((p) => ({ type: "Feature", properties: p, geometry: obris ? { type: "Point", coordinates: [15, 46] } : null }));
    return new Response(JSON.stringify({ type: "FeatureCollection", features: feats, numberMatched: matched.length }), { status: 200 });
  };
  return fn as typeof fetch;
}

const part = (id: number, ko: number, st: number, del: number, mgr = 617, name = "INDOMA d.o.o."): Row =>
  ({ UPRAVNIK_ID: mgr, NAZIV: name, NASLOV: "Maribor", KO_ID: ko, ST_STAVBE: st, ST_DELA_STAVBE: del, EID_DEL_STAVBE: `P${id}`, EID_STAVBA: `S${ko}-${st}`, VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL: "stanovanje" });

function portfolioRows() {
  const rows: Row[] = []; let id = 0;
  // one huge KO (one building with 450 parts + many buildings), a few small KOs, and another manager
  for (let d = 1; d <= 450; d++) rows.push(part(id++, 657, 125, d));
  for (let st = 200; st < 260; st++) for (let d = 1; d <= 12; d++) rows.push(part(id++, 657, st, d));
  for (const ko of [2, 606, 1500, 2700]) for (let d = 1; d <= 40; d++) rows.push(part(id++, ko, 7, d));
  for (let d = 1; d <= 50; d++) rows.push(part(id++, 657, 999, d, 900, "DRUGI UPRAVNIK"));
  return rows;
}

describe("manager search", () => {
  it("escapes user input for ILIKE", () => {
    expect(likeLiteral(" O'Neil  d.o.o ")).toBe("'%O''Neil d.o.o%'");
    expect(likeLiteral("100%_x")).toBe("'%100  x%'");
  });
  it("returns distinct managers with part counts", async () => {
    const c = createGursClient({ fetch: fakeWfs(portfolioRows()) });
    const r = await c.searchManagers("upravnik");
    expect(r.managers).toEqual([{ id: 900, name: "DRUGI UPRAVNIK", address: "Maribor", parts: 50 }]);
    expect((await c.searchManagers("ab")).managers).toEqual([]);
  });
});

describe("manager portfolio", () => {
  it("collects every part past the 300 cap without paging, grouped into buildings", async () => {
    const rows = portfolioRows(); const log: string[] = [];
    const c = createGursClient({ fetch: fakeWfs(rows, log) });
    let progress = 0;
    const p = (await c.managerPortfolio(617, { onProgress: (n) => { progress = n; } }))!;
    const expected = rows.filter((r) => r.UPRAVNIK_ID === 617).length; // 450 + 720 + 160
    expect(p.parts).toHaveLength(expected);
    expect(new Set(p.parts.map((x) => x.eid)).size).toBe(expected);
    expect(p.buildings).toHaveLength(1 + 60 + 4);
    expect(p.buildings.find((b) => b.koId === 657 && b.number === 125)!.parts).toHaveLength(450);
    expect(p.manager).toMatchObject({ id: 617, name: "INDOMA d.o.o.", parts: expected });
    expect(progress).toBe(expected);
    expect(log.every((q) => q.length < 200)).toBe(true); // filters never grow
  });
  it("filters by KO and returns null for unknown managers", async () => {
    const c = createGursClient({ fetch: fakeWfs(portfolioRows()) });
    expect((await c.managerPortfolio(617, { koId: 606 }))!.parts).toHaveLength(40);
    expect(await c.managerPortfolio(12345)).toBeNull();
    await expect(c.managerPortfolio(0)).rejects.toMatchObject({ kind: "invalid-input" });
  });
  it("fetches building outlines in per-KO batches", async () => {
    const rows = [...Array(130)].map((_, i) => ({ KO_ID: 657, ST_STAVBE: i + 1 })).concat([{ KO_ID: 2, ST_STAVBE: 7 }]);
    const log: string[] = [];
    const c = createGursClient({ fetch: fakeWfs(rows, log) });
    const g = await c.buildingOutlines([...rows.map((r) => ({ koId: r.KO_ID, number: r.ST_STAVBE }))]);
    expect(g.size).toBe(131);
    expect(log).toHaveLength(3); // 100 + 30 for KO 657, 1 for KO 2
  });
});
