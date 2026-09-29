import { createGursClient } from ".";
import { fakeFetch, fixture, q, typeIs } from "./testFetch";

const routes = () => fakeFetch([
  [typeIs("SI.GURS.KN:STAVBE"), fixture("bld-attrs.json")],
  [typeIs("SI.GURS.KN:STAVBE_OBRIS"), fixture("bld-obris.json")],
  [typeIs("SI.GURS.KN:DELI_STAVB"), fixture("bld-parts.json")],
]);

describe("findBuilding", () => {
  it("combines STAVBE attributes with the STAVBE_OBRIS outline in WGS84", async () => {
    const f = routes();
    const b = await createGursClient({ fetch: f }).findBuilding(657, 130);
    expect(b).toMatchObject({
      eid: "100201000000088661", koId: 657, koName: "MARIBOR GRAD", number: 130,
      floors: 10, flats: 49, businessUnits: 0, yearBuilt: 1949, facadeRenovated: 2021,
      type: "krajna vrstna stavba", structure: "beton, železobeton",
      utilities: { electricity: true, water: true, sewage: true, gas: false },
    });
    expect(b!.geometry.type).toBe("Polygon");
    expect(b!.centroid[0]).toBeGreaterThan(15.6);
    const attrs = f.calls.find((u) => q(u, "typeNames") === "SI.GURS.KN:STAVBE")!;
    expect(q(attrs, "cql_filter")).toBe("KO_ID=657 AND ST_STAVBE=130");
    expect(q(attrs, "propertyName")).not.toMatch(/GEOM/);
    expect(q(f.calls.find((u) => q(u, "typeNames") === "SI.GURS.KN:STAVBE_OBRIS")!, "srsName")).toBe("EPSG:4326");
  });

  it("returns null when the building does not exist", async () => {
    const f = fakeFetch([[() => true, fixture("bld-empty.json")]]);
    expect(await createGursClient({ fetch: f }).findBuilding(657, 99999999)).toBeNull();
  });

  it("rejects invalid numbers without calling GURS", async () => {
    const f = fakeFetch([]);
    await expect(createGursClient({ fetch: f }).findBuilding(657, 1.5)).rejects.toMatchObject({ kind: "invalid-input" });
    expect(f.calls).toHaveLength(0);
  });
});

describe("buildingAt", () => {
  it("finds the building whose outline contains a WGS84 point (D96 query)", async () => {
    const f = routes();
    const b = await createGursClient({ fetch: f }).buildingAt(15.6557, 46.5594);
    expect(b?.number).toBe(130);
    const obris = f.calls.find((u) => q(u, "typeNames") === "SI.GURS.KN:STAVBE_OBRIS")!;
    expect(q(obris, "cql_filter")).toMatch(/^INTERSECTS\(OBRIS_GEOM,POINT\(\d+\.?\d* \d+\.?\d*\)\)$/);
  });

  it("returns null when the point is not on a building", async () => {
    const f = fakeFetch([[() => true, fixture("bld-empty.json")]]);
    expect(await createGursClient({ fetch: f }).buildingAt(15.6, 46.5)).toBeNull();
  });
});

describe("buildingParts", () => {
  it("lists building parts sorted by number with use, area and floor", async () => {
    const f = routes();
    const parts = await createGursClient({ fetch: f }).buildingParts(657, 130);
    expect(parts).toHaveLength(61);
    expect(parts.map((p) => p.number)).toEqual([...parts.map((p) => p.number)].sort((a, b) => a - b));
    expect(parts.find((p) => p.number === 2)).toMatchObject({
      eid: "100301000000354583", use: "stanovanje", area: 34.1, usableArea: 34.1, floor: "3", elevator: true, condominium: false,
    });
    const u = f.calls[0];
    expect(Number(q(u, "count"))).toBeLessThanOrEqual(300);
    expect(q(u, "cql_filter")).toBe("KO_ID=657 AND ST_STAVBE=130");
  });

  it("splits by part-number ranges when a building has more than 300 parts", async () => {
    const big = JSON.parse(fixture("bld-parts.json"));
    big.numberMatched = 450;
    const f = fakeFetch([
      [(u) => q(u, "cql_filter") === "KO_ID=657 AND ST_STAVBE=130", JSON.stringify(big)],
      [(u) => q(u, "cql_filter").includes("ST_DELA_STAVBE BETWEEN"), fixture("bld-parts.json")],
    ]);
    const parts = await createGursClient({ fetch: f }).buildingParts(657, 130);
    const ranges = f.calls.map((u) => q(u, "cql_filter")).filter((c) => c.includes("BETWEEN"));
    expect(ranges[0]).toBe("KO_ID=657 AND ST_STAVBE=130 AND ST_DELA_STAVBE BETWEEN 1 AND 300");
    expect(new Set(parts.map((p) => p.eid)).size).toBe(parts.length);
  });
});
