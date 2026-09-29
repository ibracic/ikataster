import { createGursClient, fromD96 } from ".";
import { fakeFetch, fixture, q, typeIs } from "./testFetch";

// Same D96 rectangle as the recorded fixtures (around building 657/130).
const RING_D96: [number, number][] = [[550000, 157900], [550180, 157900], [550180, 158040], [550000, 158040], [550000, 157900]];
const ring = RING_D96.map(([e, n]) => fromD96(e, n));

const routes = () => fakeFetch([
  [typeIs("SI.GURS.KN:PARCELE"), fixture("poly-parcels.json")],
  [typeIs("SI.GURS.KN:STAVBE_OBRIS"), fixture("poly-buildings.json")],
]);

describe("featuresInPolygon", () => {
  it("queries parcels intersecting the polygon in D96 and keeps only those whose centroid is inside", async () => {
    const f = routes();
    const res = await createGursClient({ fetch: f }).featuresInPolygon("parcel", ring);
    const cql = q(f.calls[0], "cql_filter");
    expect(cql).toMatch(/^INTERSECTS\(GEOM,POLYGON\(\(550000(\.0)? 157900(\.0)?,/);
    expect(Number(q(f.calls[0], "count"))).toBeLessThanOrEqual(300);
    expect(res.tooMany).toBe(false);
    expect(res.total).toBe(55);
    expect(res.items.length).toBeGreaterThan(5);
    expect(res.items.length).toBeLessThan(55); // edge-touching neighbours dropped
    const raw = JSON.parse(fixture("poly-parcels.json")).features as { properties: { E_CEN: number; N_CEN: number } }[];
    const inside = raw.filter((x) => x.properties.E_CEN > 550000 && x.properties.E_CEN < 550180 && x.properties.N_CEN > 157900 && x.properties.N_CEN < 158040);
    expect(res.items).toHaveLength(inside.length);
    expect(res.items[0]).toMatchObject({ kind: "parcel", koId: 657, koName: "MARIBOR GRAD" });
    expect(res.items[0].geometry?.type).toMatch(/Polygon/);
  });

  it("queries buildings on OBRIS_GEOM and includes building 130", async () => {
    const f = routes();
    const res = await createGursClient({ fetch: f }).featuresInPolygon("building", ring);
    expect(q(f.calls[0], "cql_filter")).toMatch(/^INTERSECTS\(OBRIS_GEOM,POLYGON/);
    expect(res.items.map((i) => i.number)).toContain("130");
    expect(res.items.every((i) => i.kind === "building" && i.eid)).toBe(true);
  });

  it("reports tooMany without items when GURS matches more than the limit", async () => {
    const big = JSON.parse(fixture("poly-parcels.json"));
    big.numberMatched = 1234;
    const f = fakeFetch([[() => true, JSON.stringify(big)]]);
    const res = await createGursClient({ fetch: f }).featuresInPolygon("parcel", ring, { max: 300 });
    expect(res).toMatchObject({ tooMany: true, total: 1234, items: [] });
  });

  it("rejects polygons with fewer than 3 points without calling GURS", async () => {
    const f = fakeFetch([]);
    await expect(createGursClient({ fetch: f }).featuresInPolygon("parcel", ring.slice(0, 2))).rejects.toMatchObject({ kind: "invalid-input" });
    expect(f.calls).toHaveLength(0);
  });
});
